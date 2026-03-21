# TUI_LANDING_REVIEW_FORM

Specification for TUI_LANDING_REVIEW_FORM.

## High-Level User POV

The Landing Review Form is the primary mechanism for submitting a code review on a landing request directly from the Codeplane TUI. Landing requests are Codeplane's jj-native alternative to pull requests — they represent a stack of changes proposed for landing into a target bookmark. The review form lets a developer approve changes, request modifications, or leave a general comment without ever leaving the keyboard-driven terminal workflow.

The form is accessed from the landing detail view by pressing `r` (review), from the TUI_LANDING_REVIEWS_VIEW tab by pressing `r`, or via the command palette with `:review landing` when a landing request is in context. When the review form opens, it pushes onto the navigation stack and the breadcrumb updates to show "Dashboard > owner/repo > Landings > #12 > Review". The form can also be opened from the diff viewer when reviewing a landing request's changes, making it natural to complete a review after examining the code.

The review form is a focused, purpose-built screen with three core elements: a review type selector, a body textarea for the review comment, and a submit button. The review type selector is the first focused element and presents three options: Approve (shown in green with a ✓ icon), Request Changes (shown in red with a ✗ icon), and Comment (shown in blue with a 💬 icon). The type defaults to "Comment" to prevent accidental approvals or change requests. The user cycles through types with `j`/`k` or selects directly with `1` (Approve), `2` (Request Changes), or `3` (Comment).

Below the type selector is the body textarea, a multi-line text input for the review message. The body is optional for Approve and Comment types but required for Request Changes — the TUI enforces this with client-side validation. The textarea supports free-form markdown content. At minimum terminal size (80×24), the textarea occupies 6 lines. At standard size (120×40), it expands to 15 lines. At large size (200×60+), it can display 25+ lines.

Navigation between the three form elements (type selector, body, submit button) uses `Tab` (forward) and `Shift+Tab` (backward). The focused element is highlighted with a primary color (blue, ANSI 33) border and a `▸` indicator. Submitting is triggered by pressing `Ctrl+S` from anywhere in the form, or by pressing `Enter` on the "Submit Review" button. The form calls `POST /api/repos/:owner/:repo/landings/:number/reviews` via the `useCreateLandingReview()` hook from `@codeplane/ui-core`. The request payload includes the selected type (`APPROVE`, `REQUEST_CHANGES`, or `COMMENT`) and the body text.

During submission, the "Submit Review" button text changes to "Submitting…" and all form inputs are disabled. On success, the form pops from the navigation stack and returns to the landing detail view (or reviews tab), which now shows the newly submitted review. A brief success indicator appears in the status bar: "Review submitted ✓" for 3 seconds. On failure, the form remains open, inputs are re-enabled, and a red error message appears at the top of the form with a retry hint.

Cancellation is triggered by pressing `Esc` from any field (when no overlay is open). If the body field has content (dirty state), a confirmation dialog appears: "Discard review? [y/N]". If the body is empty and the type is still the default "Comment", `Esc` pops immediately without confirmation.

The form is optimized for fast review workflows. The most common flow — quick approval — is: press `r`, press `1` (Approve), press `Ctrl+S`. Three keystrokes. For a more thorough review with comments: press `r`, press `2` (Request Changes), `Tab` to body, type feedback, `Ctrl+S`. The form respects the terminal-native developer's expectation that common operations should be fast and keyboard-only.

The review form cannot be opened for merged or closed landing requests. The landing request author can submit a Comment-type review on their own landing request but cannot Approve or Request Changes on their own work — the type selector disables those options with a "(cannot review own landing)" hint.

At minimum terminal size (80×24), the form collapses to a compact single-column layout with the type selector displayed as a horizontal row of abbreviated labels ("✓ Approve", "✗ Changes", "💬 Comment"). At standard and large sizes, the type selector displays as a vertical list with full descriptions explaining each review type's effect.

## Acceptance Criteria

### Definition of Done

- [ ] The Landing Review Form renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The form is reachable by pressing `r` from the landing detail view, `r` from the reviews tab, `r` from the diff viewer (in landing context), or `:review landing` from the command palette
- [ ] The breadcrumb reads "Dashboard > owner/repo > Landings > #N > Review"
- [ ] The review type selector defaults to "Comment"
- [ ] The type selector displays three options: Approve (green ✓), Request Changes (red ✗), Comment (blue 💬)
- [ ] Each type option shows a short description at standard/large terminal sizes
- [ ] The body textarea accepts free-form markdown content
- [ ] The body is optional for Approve and Comment types
- [ ] The body is required for Request Changes — submission blocked with validation error if empty
- [ ] Tab order cycles through: Type Selector → Body → Submit Review → Cancel
- [ ] `Ctrl+S` submits the form from any field
- [ ] The form calls `POST /api/repos/:owner/:repo/landings/:number/reviews` via `useCreateLandingReview()` hook
- [ ] The request payload includes `type` (APPROVE / REQUEST_CHANGES / COMMENT) and `body`
- [ ] On successful submission, the form pops from the navigation stack and returns to the previous screen
- [ ] On successful submission, the parent screen's review data is invalidated/refreshed
- [ ] A "Review submitted ✓" message appears in the status bar for 3 seconds after success
- [ ] On submission failure, the form remains open with a red error message at the top, inputs re-enabled
- [ ] `Esc` triggers cancellation: if form is dirty (body has content or type changed from default), show confirmation dialog; if clean, pop immediately
- [ ] The confirmation dialog renders "Discard review? [y/N]" centered in a modal overlay
- [ ] A loading state ("Submitting…") is shown on the Submit Review button during submission, and all inputs are disabled
- [ ] The form does not open for merged landing requests — pressing `r` on a merged landing shows "Cannot review a merged landing request" in the status bar for 3 seconds
- [ ] The landing request author cannot select Approve or Request Changes for their own landing — those options are disabled with "(cannot review own landing)" hint text
- [ ] The landing request author can select Comment for their own landing
- [ ] The form does not open for landing requests in closed state — status bar shows "Cannot review a closed landing request" for 3 seconds
- [ ] Only open and draft landing requests can be reviewed

### Keyboard Interactions

- [ ] `Tab`: Move focus to the next form element
- [ ] `Shift+Tab`: Move focus to the previous form element
- [ ] `j`/`k` or `Up`/`Down`: When type selector is focused, cycle through review types
- [ ] `1`: Select Approve type (if not disabled)
- [ ] `2`: Select Request Changes type (if not disabled)
- [ ] `3`: Select Comment type
- [ ] `Enter`: When on Submit Review button, submit. When on Cancel button, trigger cancel flow
- [ ] `Ctrl+S`: Submit the form from any field position
- [ ] `Esc`: If no overlay is open, trigger cancellation (with dirty-check)
- [ ] `y`: In the discard confirmation dialog, confirm discard and pop screen
- [ ] `n` / `N` / `Esc`: In the discard confirmation dialog, return to form
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides form)
- [ ] `R`: After submission error, retry the submission
- [ ] `?`: Toggle help overlay showing all keybindings for this screen

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Single-column layout. Type selector displayed as horizontal compact row ("✓ Approve | ✗ Changes | 💬 Comment"). Body textarea is 6 lines tall. Field labels abbreviated. Submit/Cancel buttons on same row
- [ ] 120×40 – 199×59 (standard): Type selector as vertical list with descriptions. Body textarea is 15 lines tall. Full field labels. Buttons right-aligned with comfortable spacing
- [ ] 200×60+ (large): Type selector as vertical list with extended descriptions and spacing. Body textarea is 25 lines tall. Wider content area with additional padding

### Truncation and Boundary Constraints

- [ ] Body: maximum 65,535 characters; textarea scrolls vertically when content exceeds visible height
- [ ] Review type descriptions: truncated at terminal width minus label width with `…` at minimum size
- [ ] Error messages: truncated at terminal width minus 4 characters with `…`
- [ ] Reviewer display name in confirmation: truncated at 30 characters with `…`
- [ ] Landing request title shown in form header: truncated at 40 characters at minimum, 80 at standard, full at large
- [ ] Submit button text: fixed width, no truncation ("Submit Review" / "Submitting…")

### Edge Cases

- [ ] Terminal resize while form is open: Layout recalculates, textarea height adjusts, field focus and content preserved
- [ ] Terminal resize while discard dialog is open: Dialog repositions; selection state preserved
- [ ] Submit during network disconnect: Error banner with retry hint
- [ ] 403 on submit (permission revoked mid-session): "Permission denied" error shown
- [ ] 404 on submit (landing deleted by another user): "Landing request not found" error shown
- [ ] 422 on submit (invalid review type or empty body for Request Changes): Server validation message shown
- [ ] Rapid Tab presses processed sequentially without skipping fields
- [ ] Body textarea shows raw markdown (not rendered)
- [ ] Unicode and emoji in body handled correctly
- [ ] Pressing `1` when Approve is disabled (own landing) shows status bar message "Cannot approve your own landing request" for 2 seconds
- [ ] Pressing `2` when Request Changes is disabled (own landing) shows status bar message "Cannot request changes on your own landing request" for 2 seconds
- [ ] Double `Ctrl+S` during submission is no-op (prevents duplicate reviews)
- [ ] Body textarea `Enter` key inserts newline (does not submit form)
- [ ] Form opened on a landing with no changes (empty stack): form still opens, review can be submitted
- [ ] Multiple reviews by same reviewer: allowed — latest review is authoritative
- [ ] SSE disconnect during form: No impact (review form does not use SSE); status bar shows disconnected state
- [ ] Submitting a review on a landing request that was merged between form open and submit: 422 or 409 error displayed inline

## Design

### Layout Structure

The review form uses a vertical flexbox layout filling the entire content area. At standard (120×40) size:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings > #12 > Review │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Landing #12: Update auth flow for SSO support           │
│  by @alice · open · 3 changes · target: main             │
│                                                          │
│  ─── Review Type ────────────────────────────────────── │
│                                                          │
│  ▸ ✓  Approve                                            │
│       Signal that changes are ready to land.             │
│                                                          │
│    ✗  Request Changes                                    │
│       Block landing until concerns are addressed.        │
│                                                          │
│    💬 Comment                                             │
│       Leave feedback without explicit approval.          │
│                                                          │
│  ─── Comment ────────────────────────────────────────── │
│                                                          │
│    ┌──────────────────────────────────────────────────┐  │
│    │ LGTM! The SSO integration looks solid.           │  │
│    │ One minor nit on the error handling in the       │  │
│    │ callback handler — could use a more specific     │  │
│    │ error type.                                      │  │
│    │                                                  │  │
│    └──────────────────────────────────────────────────┘  │
│                                                          │
│                        [Submit Review]  [Cancel]         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Status: Tab:next 1/2/3:type Ctrl+S:submit Esc:cancel     │
└──────────────────────────────────────────────────────────┘
```

At minimum (80×24), the type selector is a compact horizontal row, the textarea is 6 lines, and the landing request context line is truncated.

When the author views their own landing request, disabled review types show grayed-out text with "(cannot review own landing)" hint.

### Component Tree

Uses `<box>` for layout, `<scrollbox>` for body textarea scrolling, `<text>` for labels and type options, `<input multiline>` for the body textarea. Type selector is a custom `<box flexDirection="column">` with `<text>` children that respond to `j`/`k` and `1`/`2`/`3` keybindings. Discard confirmation is a centered `<box position="absolute">` overlay with warning (ANSI 178) border.

Focused elements indicated by `▸` prefix and primary (ANSI 33) border color. Unfocused elements use border color (ANSI 240). Selected review type highlighted with semantic color: green (ANSI 34) for Approve, red (ANSI 196) for Request Changes, blue (ANSI 33) for Comment. Disabled type options use muted gray (ANSI 245).

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Form (no overlay) | Next element |
| `Shift+Tab` | Form (no overlay) | Previous element |
| `j`/`Down` | Type selector focused | Next type option |
| `k`/`Up` | Type selector focused | Previous type option |
| `1` | Type selector focused | Select Approve (if enabled) |
| `2` | Type selector focused | Select Request Changes (if enabled) |
| `3` | Type selector focused | Select Comment |
| `Ctrl+S` | Form (no overlay) | Submit review |
| `Enter` | Submit Review button | Submit review |
| `Enter` | Cancel button | Cancel flow |
| `Esc` | Form (dirty) | Show discard dialog |
| `Esc` | Form (clean) | Pop screen |
| `y` | Discard dialog | Confirm discard |
| `n`/`Esc` | Discard dialog | Return to form |
| `R` | After submit error | Retry submission |
| `?` | Any (no overlay) | Help overlay |
| `:` | Any (no input focused) | Command palette |

### Responsive Column Layout

| Breakpoint | Type Selector Layout | Textarea Height | Landing Title Truncation |
|------------|---------------------|----------------|---------------------------|
| 80×24 | Horizontal compact row | 6 lines | 40ch |
| 120×40 | Vertical list with descriptions | 15 lines | 80ch |
| 200×60+ | Vertical list with extended descriptions | 25 lines | unlimited |

### Data Hooks

- `useLanding(owner, repo, number)` — Fetch landing request data for context header (title, author, state, stack size, target bookmark)
- `useCreateLandingReview(owner, repo, number)` — Submit POST request with review type and body
- `useLandingReviews(owner, repo, number)` — Cache invalidation target after successful submission
- `useUser()` — Current authenticated user, for checking if user is the landing request author (to disable self-review types)
- `useTerminalDimensions()` — Current terminal size for responsive layout
- `useOnResize(callback)` — Trigger re-layout on resize
- `useKeyboard(handler)` — Form navigation and shortcut registration

### Navigation Context

Pushed from landing detail view (`r`), reviews tab (`r`), diff viewer (`r` in landing context), or command palette (`:review landing`). On successful submission, pops and invalidates the `useLandingReviews()` cache so the parent screen reflects the new review. Also invalidates the `useLanding()` cache since review counts or approval status may have changed.

### Review Type Semantics

| Type | API Value | Effect | Body Required | Self-Review |
|------|-----------|--------|---------------|-------------|
| Approve | `APPROVE` | Counts toward approval requirements for protected bookmarks | No | Disabled |
| Request Changes | `REQUEST_CHANGES` | Blocks landing until reviewer dismisses or submits a new review | Yes | Disabled |
| Comment | `COMMENT` | No approval/blocking effect; informational only | No | Allowed |

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous | Cannot access. Pressing `r` is a no-op |
| Authenticated (no repo access) | 403 shown as "Permission denied" |
| Read-only collaborator | Can submit Comment reviews only. Approve and Request Changes are disabled with "(requires write access)" hint |
| Write collaborator | Full access to all review types (except self-review restrictions) |
| Landing request author | Can submit Comment reviews on own landing. Approve and Request Changes disabled with "(cannot review own landing)" |
| Admin | Full access to all review types (except self-review restrictions) |
| Repository owner | Full access to all review types (except self-review restrictions) |
| Organization owner | Full access to all review types in org repositories (except self-review restrictions) |

### Token Handling

- Auth via stored token from `codeplane auth login` or `CODEPLANE_TOKEN` env var
- Bearer token in Authorization header for all requests
- 401 on submit shows "Session expired. Run `codeplane auth login` to re-authenticate."
- No OAuth browser flow from TUI
- Token presence checked before form opens; missing token shows auth prompt

### Rate Limiting

- POST review endpoint subject to standard API rate limit (60 req/min per user)
- 429 shows "Rate limit exceeded. Try again in {retry-after} seconds."
- Landing data fetched on form open and cached
- No automatic retry on rate limit — user must press `R`

### Input Sanitization

- Body sent as-is; server performs sanitization
- No client-side HTML stripping (terminal has no HTML interpreter)
- XSS not applicable in terminal context
- Review type constrained to enum values (APPROVE / REQUEST_CHANGES / COMMENT) — no free-text injection

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing.review_form.opened` | Form pushed | `repo_owner`, `repo_name`, `landing_number`, `entry_point` (detail/reviews_tab/diff/palette), `terminal_width`, `terminal_height`, `landing_state`, `is_author` |
| `tui.landing.review_form.type_selected` | Type changed | `repo_owner`, `repo_name`, `landing_number`, `review_type`, `previous_type`, `selection_method` (j_k/number_key) |
| `tui.landing.review_form.submitted` | Successful POST | `repo_owner`, `repo_name`, `landing_number`, `review_type`, `body_length`, `duration_ms`, `is_author` |
| `tui.landing.review_form.submit_failed` | POST fails | `repo_owner`, `repo_name`, `landing_number`, `review_type`, `error_code`, `error_message`, `duration_ms` |
| `tui.landing.review_form.cancelled` | User cancels | `repo_owner`, `repo_name`, `landing_number`, `had_body_content`, `selected_type`, `duration_ms` |
| `tui.landing.review_form.discard_confirmed` | Discard confirmed | `repo_owner`, `repo_name`, `landing_number`, `body_length`, `selected_type`, `duration_ms` |
| `tui.landing.review_form.discard_aborted` | Discard aborted | `repo_owner`, `repo_name`, `landing_number` |
| `tui.landing.review_form.self_review_blocked` | Disabled type pressed | `repo_owner`, `repo_name`, `landing_number`, `attempted_type` |
| `tui.landing.review_form.validation_error` | Validation blocks submit | `field`, `error`, `review_type` |
| `tui.landing.review_form.blocked_merged` | Review attempted on merged LR | `repo_owner`, `repo_name`, `landing_number` |
| `tui.landing.review_form.blocked_closed` | Review attempted on closed LR | `repo_owner`, `repo_name`, `landing_number` |

### Success Indicators

- Submission completion rate: >85% of opened forms result in successful submission
- Quick approval rate: percentage of approvals completed in <5 seconds (type select + Ctrl+S)
- Time to submit: <5s median for approval-only, <30s for reviews with body content
- Error recovery rate: >80% of failures result in successful retry
- Discard rate: <20% of forms with body content are discarded
- Feature adoption: ratio of `review_form.opened` to `landing_detail.viewed`
- Review type distribution: Approve vs Request Changes vs Comment ratios
- Self-review block encounters: frequency of `self_review_blocked` events (potential UX confusion signal)

## Observability

### Logging

| Level | Event | Details |
|-------|-------|--------|
| `info` | Form opened | `landing_number`, `entry_point`, `terminal_dimensions`, `landing_state`, `is_author` |
| `info` | Review submitted | `landing_number`, `review_type`, `body_length`, `payload_size_bytes` |
| `info` | Review succeeded | `landing_number`, `review_id`, `response_time_ms` |
| `warn` | Review failed (4xx) | `landing_number`, `status_code`, `error_body` |
| `error` | Review failed (5xx) | `landing_number`, `status_code`, `error_body`, `request_id` |
| `warn` | Token expired (401) | `landing_number` |
| `warn` | Rate limited (429) | `landing_number`, `retry_after` |
| `debug` | Field focus changed | `from_element`, `to_element` |
| `debug` | Type selection changed | `from_type`, `to_type`, `method` (j_k/number_key) |
| `debug` | Dirty state changed | `is_dirty`, `has_body_content`, `type_changed_from_default` |
| `info` | Discard confirmed | `landing_number`, `body_length`, `review_type` |
| `debug` | Terminal resize during form | `old_dimensions`, `new_dimensions` |
| `info` | Blocked review on merged LR | `landing_number` |
| `info` | Blocked review on closed LR | `landing_number` |
| `debug` | Self-review type blocked | `landing_number`, `attempted_type` |
| `warn` | Landing data fetch failed on form open | `landing_number`, `status_code`, `error` |

### Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Network timeout | Error banner "Request timed out" with retry hint | Press `R` to retry |
| 401 Unauthorized | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI |
| 403 Forbidden | "Permission denied" error message | Exit form with `Esc` |
| 404 Not Found | "Landing request not found" error message | Pop form with `Esc` |
| 409 Conflict | "Landing request state changed" error with info to reopen form | `Esc` to pop, then reopen if desired |
| 422 Validation | Server validation message shown (e.g., "body required for REQUEST_CHANGES") | Correct and resubmit |
| 429 Rate Limited | "Rate limit exceeded. Try again in {retry-after} seconds." | Wait and press `R` |
| 500+ Server Error | "Server error" with request ID if available | Press `R` to retry |
| Landing data fetch failure | Form shows error state: "Could not load landing request data" | `R` to retry load, `Esc` to go back |
| Resize below 80×24 | "Terminal too small" message; form state preserved in memory | Resize terminal back above 80×24 |
| Terminal disconnect during submit | Server completes POST atomically; review created server-side | Relaunch TUI; review is persisted |
| SSE disconnect during form | No impact (review form does not use SSE); status bar shows disconnected state | SSE auto-reconnects |

### Failure Modes

- Review creation is atomic server-side; no partial state possible
- Duplicate review prevention: double-submit guard disables inputs during submission
- If the same user submits multiple reviews, the latest is authoritative (server handles this)
- Minimal memory footprint; body content held in React state only
- Form state survives terminal resize events but not TUI restart

### Health Signals

- Form render time: <100ms from `r` press to fully populated form
- Landing context load: <500ms for landing request data to appear in form header
- Submit round-trip: <2s for POST request to complete
- Resize re-layout: <50ms

## Verification

### Terminal Snapshot Tests

- [ ] `TUI_LANDING_REVIEW_FORM — renders review form at 120x40 with all elements`
- [ ] `TUI_LANDING_REVIEW_FORM — renders review form at 80x24 minimum size with compact type selector`
- [ ] `TUI_LANDING_REVIEW_FORM — renders review form at 200x60 large size with expanded layout`
- [ ] `TUI_LANDING_REVIEW_FORM — renders type selector with Approve selected (green highlight)`
- [ ] `TUI_LANDING_REVIEW_FORM — renders type selector with Request Changes selected (red highlight)`
- [ ] `TUI_LANDING_REVIEW_FORM — renders type selector with Comment selected (blue highlight)`
- [ ] `TUI_LANDING_REVIEW_FORM — renders focused body textarea after Tab from type selector`
- [ ] `TUI_LANDING_REVIEW_FORM — renders focused Submit Review button`
- [ ] `TUI_LANDING_REVIEW_FORM — renders focused Cancel button`
- [ ] `TUI_LANDING_REVIEW_FORM — renders discard confirmation dialog`
- [ ] `TUI_LANDING_REVIEW_FORM — renders error banner on submission failure`
- [ ] `TUI_LANDING_REVIEW_FORM — renders body validation error for Request Changes with empty body`
- [ ] `TUI_LANDING_REVIEW_FORM — renders submitting state with disabled inputs`
- [ ] `TUI_LANDING_REVIEW_FORM — renders breadcrumb correctly`
- [ ] `TUI_LANDING_REVIEW_FORM — renders landing context header with title, author, state, and stack info`
- [ ] `TUI_LANDING_REVIEW_FORM — renders disabled Approve and Request Changes for self-review`
- [ ] `TUI_LANDING_REVIEW_FORM — renders Comment section header as "(required)" for Request Changes type`
- [ ] `TUI_LANDING_REVIEW_FORM — renders Comment section header as "(optional)" for Approve type`
- [ ] `TUI_LANDING_REVIEW_FORM — renders placeholder text appropriate to selected type`
- [ ] `TUI_LANDING_REVIEW_FORM — renders status bar keybinding hints`

### Keyboard Interaction Tests

- [ ] `TUI_LANDING_REVIEW_FORM — Tab cycles through all form elements in order`
- [ ] `TUI_LANDING_REVIEW_FORM — Shift+Tab cycles backward through elements`
- [ ] `TUI_LANDING_REVIEW_FORM — Tab wraps from Cancel back to Type Selector`
- [ ] `TUI_LANDING_REVIEW_FORM — Shift+Tab wraps from Type Selector to Cancel`
- [ ] `TUI_LANDING_REVIEW_FORM — j/k navigates review types when type selector focused`
- [ ] `TUI_LANDING_REVIEW_FORM — Up/Down navigates review types when type selector focused`
- [ ] `TUI_LANDING_REVIEW_FORM — 1 selects Approve type`
- [ ] `TUI_LANDING_REVIEW_FORM — 2 selects Request Changes type`
- [ ] `TUI_LANDING_REVIEW_FORM — 3 selects Comment type`
- [ ] `TUI_LANDING_REVIEW_FORM — 1 is no-op when Approve is disabled (self-review)`
- [ ] `TUI_LANDING_REVIEW_FORM — 2 is no-op when Request Changes is disabled (self-review)`
- [ ] `TUI_LANDING_REVIEW_FORM — j/k skips disabled types in type selector`
- [ ] `TUI_LANDING_REVIEW_FORM — Ctrl+S from type selector submits form`
- [ ] `TUI_LANDING_REVIEW_FORM — Ctrl+S from body field submits form`
- [ ] `TUI_LANDING_REVIEW_FORM — Ctrl+S from Submit button submits form`
- [ ] `TUI_LANDING_REVIEW_FORM — Enter on Submit Review button submits form`
- [ ] `TUI_LANDING_REVIEW_FORM — Enter on Cancel button triggers cancel flow`
- [ ] `TUI_LANDING_REVIEW_FORM — Esc with no changes pops screen immediately`
- [ ] `TUI_LANDING_REVIEW_FORM — Esc with body content shows discard dialog`
- [ ] `TUI_LANDING_REVIEW_FORM — Esc with type changed from default shows discard dialog`
- [ ] `TUI_LANDING_REVIEW_FORM — y in discard dialog discards and pops`
- [ ] `TUI_LANDING_REVIEW_FORM — n in discard dialog returns to form`
- [ ] `TUI_LANDING_REVIEW_FORM — Esc in discard dialog returns to form`
- [ ] `TUI_LANDING_REVIEW_FORM — R after submit error retries`
- [ ] `TUI_LANDING_REVIEW_FORM — Ctrl+S blocked when Request Changes selected and body empty`
- [ ] `TUI_LANDING_REVIEW_FORM — double Ctrl+S during submission is no-op`
- [ ] `TUI_LANDING_REVIEW_FORM — body textarea Enter inserts newline (does not submit)`
- [ ] `TUI_LANDING_REVIEW_FORM — ? opens help overlay`
- [ ] `TUI_LANDING_REVIEW_FORM — j/k in body textarea scrolls content (does not change type)`
- [ ] `TUI_LANDING_REVIEW_FORM — 1/2/3 in body textarea types characters (does not change type)`

### Responsive Resize Tests

- [ ] `TUI_LANDING_REVIEW_FORM — resize from 120x40 to 80x24 preserves form state and switches to compact type selector`
- [ ] `TUI_LANDING_REVIEW_FORM — resize from 80x24 to 200x60 expands layout and switches to vertical type list`
- [ ] `TUI_LANDING_REVIEW_FORM — resize from 120x40 to 80x24 reduces textarea height from 15 to 6 lines`
- [ ] `TUI_LANDING_REVIEW_FORM — resize during discard dialog repositions dialog`
- [ ] `TUI_LANDING_REVIEW_FORM — resize below 80x24 shows too-small message`
- [ ] `TUI_LANDING_REVIEW_FORM — resize back above 80x24 restores form`
- [ ] `TUI_LANDING_REVIEW_FORM — textarea height adjusts on resize`

### Error Handling Tests

- [ ] `TUI_LANDING_REVIEW_FORM — 403 on submit shows permission error`
- [ ] `TUI_LANDING_REVIEW_FORM — 404 on submit shows not-found error`
- [ ] `TUI_LANDING_REVIEW_FORM — 401 on submit shows auth error`
- [ ] `TUI_LANDING_REVIEW_FORM — 409 on submit shows conflict error`
- [ ] `TUI_LANDING_REVIEW_FORM — 422 on submit shows validation error`
- [ ] `TUI_LANDING_REVIEW_FORM — 429 on submit shows rate limit error with countdown`
- [ ] `TUI_LANDING_REVIEW_FORM — 500 on submit shows server error with retry hint`
- [ ] `TUI_LANDING_REVIEW_FORM — landing data fetch failure shows error with retry`
- [ ] `TUI_LANDING_REVIEW_FORM — review blocked on merged landing request`
- [ ] `TUI_LANDING_REVIEW_FORM — review blocked on closed landing request`
- [ ] `TUI_LANDING_REVIEW_FORM — successful submit pops form and refreshes review data`

### Integration Tests

- [ ] `TUI_LANDING_REVIEW_FORM — e2e approve flow (r → 1 → Ctrl+S)`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e approve with comment flow (r → 1 → Tab → type comment → Ctrl+S)`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e request changes flow (r → 2 → Tab → type feedback → Ctrl+S)`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e comment-only flow (r → Tab → type comment → Ctrl+S)`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e cancel without changes`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e cancel with body content and discard`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e cancel with body content and abort discard`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e review from landing detail view`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e review from reviews tab`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e review from diff viewer`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e request changes with empty body blocked`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e self-review shows disabled approve and request changes`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e self-review can submit comment`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e submit error and retry flow`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e review reflects in landing detail after pop`
- [ ] `TUI_LANDING_REVIEW_FORM — e2e quick approval three-keystroke flow (r → 1 → Ctrl+S) completes in under 5 seconds`
