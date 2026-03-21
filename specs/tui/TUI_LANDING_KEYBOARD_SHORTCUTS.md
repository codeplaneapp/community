# TUI_LANDING_KEYBOARD_SHORTCUTS

Specification for TUI_LANDING_KEYBOARD_SHORTCUTS.

## High-Level User POV

The landing keyboard shortcuts feature is the unified keybinding dispatch, conflict resolution, and discoverability layer for the entire landings domain in the Codeplane TUI. It orchestrates keyboard behavior across every landing-related screen — the landing list, landing detail view (with its five tabs: Overview, Changes, Reviews, Comments, Diff), landing create form, landing edit form, review form, filter picker overlays, and confirmation dialogs — ensuring that keybindings are predictable, conflict-free, and always discoverable.

Landing requests are Codeplane's jj-native alternative to pull requests. They represent a stack of jj changes proposed for landing into a target bookmark. The landing domain is the most keyboard-dense area of the TUI because it combines list navigation, tabbed detail views, multiple form types, diff navigation, review workflows, and filter overlays — all requiring distinct key contexts that must coexist without conflict.

When a user navigates to any landing screen — via `g l` go-to from any repository context, the `:landings` command palette entry, or the `codeplane tui --screen landings --repo owner/repo` deep link — they enter a keyboard context with multiple active layers. The landing list has its own navigation (`j`/`k`), filtering (`f`, `r`, `b`, `c`, `o`), search (`/`), and actions (`c` to create, `x` to close/reopen, `m` to merge, `Enter` to open). The landing detail view layers in tabbed navigation (`Tab`/`Shift+Tab`, `1`–`5`, `h`/`l`), tab-specific actions (the Changes tab adds `d` for per-change diff, `D` for combined diff, `n`/`p` for conflict navigation; the Reviews tab adds `r` for review, `d` for dismiss; the Diff tab adds `]`/`[` for file navigation, `t` for toggle mode, `w` for whitespace, `x`/`z` for hunks), and cross-cutting detail actions (`m` to merge, `x` to close/reopen, `e` to edit). The create, edit, and review forms switch keyboard semantics entirely: printable characters feed into text inputs, `Tab`/`Shift+Tab` cycle form fields, and most single-key shortcuts are suppressed. Filter overlays (reviewer picker, bookmark picker) introduce modal keyboard traps.

The user discovers landing-specific shortcuts through three mechanisms. First, the **status bar** at the bottom of the screen shows context-sensitive hints that change as the user moves between the landing list, a detail tab, a form, or an overlay. Second, pressing `?` opens the **help overlay**, which presents all active keybindings organized into labeled groups specific to the current landing sub-screen. Third, the **command palette** (`:`) provides fuzzy-searchable access to all landing actions.

The keybinding dispatch follows a strict 6-layer priority hierarchy: (1) text inputs consume all printable characters; (2) modal overlays trap all keys except `Esc` and `Ctrl+C`; (3) go-to mode intercepts the second key; (4) the active landing sub-screen handles its local keybindings; (5) landing-wide shortcuts handle cross-cutting actions; (6) global shortcuts handle `q`, `Esc`, `?`, `:`, and `Ctrl+C`. Key conflicts between sub-screens are resolved by context — `d` means "per-change diff" on the Changes tab, "dismiss review" on the Reviews tab, and is character input in forms. The user never needs to memorize these rules because the status bar always reflects the current context.

The feature also manages multi-select operations on the landing list. `Space` toggles row selection, and `x` with selections shows a confirmation prompt when count exceeds 3. The status bar reflects the selection count. The diff sub-screen within the Diff tab has its own keyboard context with file navigation, mode toggling, whitespace visibility, and hunk controls, while tab-level keybindings remain active above the diff layer.

## Acceptance Criteria

### Definition of Done

- [ ] A `useLandingKeyboard()` hook orchestrates all keyboard dispatch across landing list, landing detail (all five tabs), landing create form, landing edit form, review form, and filter/confirmation overlays
- [ ] The hook composes keybindings from all landing sub-features: list navigation, detail tabbing, tab-specific actions, form input, overlay interactions, and diff navigation
- [ ] Keybinding priority follows the documented 6-layer hierarchy: input → modal/overlay → go-to → active sub-screen → landing-wide → global
- [ ] No two keybindings in the same active context produce different actions for the same key
- [ ] The help overlay (`?`) displays all active keybindings organized into labeled groups specific to the current landing sub-screen
- [ ] The status bar displays context-sensitive keybinding hints that update within one render frame of focus changes
- [ ] The command palette (`:`) includes all landing actions as searchable commands
- [ ] All single-key shortcuts are suppressed when a `<input>` or `<textarea>` has focus, except `Esc` (blur/cancel), `Ctrl+C` (quit), and `Ctrl+S` (submit)
- [ ] All single-key shortcuts are suppressed when a modal overlay is open, except `Esc` (close), `?` (close help), and `Ctrl+C` (quit)
- [ ] `g` prefix mode activates go-to navigation with 1500ms timeout and status bar destination hints
- [ ] Rapid key presses (holding down a key) are processed sequentially without dropping events
- [ ] Multi-key sequence `g g` scrolls to the top of the current scrollable content
- [ ] All keybinding handlers execute within 16ms (one frame at 60fps)
- [ ] Tab navigation (`Tab`/`Shift+Tab`, `1`–`5`, `h`/`l`) on the detail view remains active across all tab contents including the diff viewer
- [ ] Diff-specific keybindings (`]`/`[`, `t`, `w`, `x`/`z`, `Ctrl+B`) are only active when the Diff tab (5) is selected
- [ ] Bulk selection via `Space` on landing list toggles selection state per-row and shows selection count in status bar
- [ ] Bulk close/reopen via `x` with multiple selections shows confirmation prompt when count > 3

### Priority Resolution Rules

- [ ] Layer 1 (Text Input): All printable characters, Tab, Shift+Tab, number keys, Backspace consumed. Only Esc, Ctrl+C, and Ctrl+S escape.
- [ ] Layer 2 (Modal/Overlay): All keys consumed by overlay handler. Esc closes. Ctrl+C quits. `?` toggles help. `j`/`k` navigate. `Space` toggles in multi-select pickers. `Enter` confirms. `/` focuses filter input in pickers.
- [ ] Layer 3 (Go-to): Second key checked against destinations. `g` → cancel (unrecognized). `Esc` → cancel. `q` → cancel + pop. Unrecognized → cancel silently.
- [ ] Layer 4 (Active Sub-screen): Landing list handles `j`/`k`, `Enter`, `/`, `f`, `r`, `b`, `c`, `o`, `x`, `m`, `Space`, `G`, `g g`, `Ctrl+D`/`Ctrl+U`, `R`. Detail tabs handle their respective keybindings.
- [ ] Layer 5 (Landing-wide): `e` (edit), `m` (merge), `x` (close/reopen), `r` (review), `R` (retry), `q` (pop), `Esc` (cascade close).
- [ ] Layer 6 (Global): `?`, `:`, `Ctrl+C`, `g`.

### Edge Cases

- [ ] Terminal resize during keybinding dispatch: handler completes before re-layout
- [ ] Rapid key presses (>30 keys/second): all events processed sequentially, no drops
- [ ] `g g` distinguished from go-to mode: second `g` recognized as scroll-to-top
- [ ] `g q`: go-to mode cancelled AND screen popped
- [ ] `c` key context: "create landing" on list, "add comment" on Comments tab, character input in forms
- [ ] `d` key context: "per-change diff" on Changes tab, "dismiss review" on Reviews tab, character input in forms
- [ ] `r` key context: "reviewer picker" on list, "submit review" on detail/Reviews tab, character input in forms
- [ ] `x` key context: "close/reopen" on list/detail, "expand hunks" on Diff tab, character input in forms
- [ ] `x` with multi-selection >3: confirmation prompt before bulk action
- [ ] Overlay open then immediate `Esc`: overlay closes, no cascade to pop screen
- [ ] Help overlay from inside filter overlay: filter overlay remains open underneath
- [ ] Form with unsaved changes then `q`: confirmation dialog before pop
- [ ] Empty landing list: `j`/`k`/`Enter`/`x`/`Space`/`m` are no-ops, only `c`/`q`/`Esc`/`?`/`:` active
- [ ] Diff tab active at 80×24 then `t` (toggle split): status bar flash "Split mode unavailable at this terminal width"
- [ ] Double `Ctrl+S` during form submission: second press is no-op
- [ ] `1` on review form type selector vs `1` on detail tab navigation: form layer wins
- [ ] `Space` on a merged landing: no-op for selection

### Boundary Constraints

- [ ] Maximum keybinding groups in help overlay: 10
- [ ] Maximum keybindings per group: 25 entries
- [ ] Maximum total keybindings in help overlay: 100
- [ ] Status bar hint string max: `terminal_width - 20` characters
- [ ] Status bar truncation: rightmost hints dropped first
- [ ] Go-to mode timeout: 1500ms
- [ ] Keybinding handler execution budget: 16ms per key event
- [ ] Key event queue depth: 64 events maximum (overflow silently dropped)
- [ ] Bulk selection max: 30 landings
- [ ] Confirmation dialog prompt max width: 60 characters
- [ ] Status bar flash message duration: 2–3 seconds

## Design

### Layout Integration

The landing keyboard shortcuts feature does not own a visible screen region. It operates as an invisible orchestration layer that integrates with three visible components: the status bar (bottom), the help overlay (modal), and the command palette (modal).

### Components Used

- `<box>` — Flexbox containers for layout, rows, toolbars, overlays, confirmation dialogs
- `<scrollbox>` — Scrollable landing list, detail tab content, help overlay, filter overlays, change stack, review list
- `<text>` — Status bar hints, help overlay entries, confirmation prompts, selection count, flash messages
- `<input>` — Search input, form title input, overlay filter inputs
- `<select>` — Bookmark picker, state selector, reviewer picker
- `<markdown>` — Landing body, review body, comment body in detail view
- `<diff>` — Diff tab content with unified/split modes
- `<code>` — Change IDs, file paths in change stack and diff viewer

### Keybinding Reference

**Landing list:** `j`/`k` navigate, `Enter` opens, `G`/`g g` jump, `Ctrl+D`/`Ctrl+U` page, `/` search, `f` cycle state, `r` reviewer picker, `b` bookmark picker, `c` conflict filter, `o` cycle sort, `c` create, `x` close/reopen, `m` queue merge, `Space` select, `R` retry.

**Detail — all tabs:** `Tab`/`Shift+Tab` cycle tabs, `1`–`5` jump tabs, `h`/`l` adjacent tabs, `e` edit, `m` merge, `x` close/reopen, `r` review, `q` pop.

**Detail — Changes tab:** `j`/`k` navigate, `Enter` change detail, `d` per-change diff, `D` combined diff, `n`/`p` conflict nav.

**Detail — Reviews tab:** `j`/`k` navigate, `r` submit review, `d` dismiss, `n`/`p` next/prev review.

**Detail — Comments tab:** `j`/`k` navigate, `c` add comment, `n`/`p` next/prev comment.

**Detail — Diff tab:** `j`/`k` scroll, `]`/`[` files, `t` toggle mode, `w` whitespace, `x`/`z` hunks, `Ctrl+B` file tree.

**Forms (create/edit/review):** `Tab`/`Shift+Tab` fields, `Ctrl+S` submit, `Esc` cancel with dirty check, `Enter` on button.

**Review form:** `1`/`2`/`3` select type, `j`/`k` cycle type when selector focused.

**Filter overlays:** `j`/`k` navigate, `Enter` confirm, `Esc` cancel, `/` filter.

**Confirmation dialogs:** `y` confirm, `n`/`N`/`Esc` cancel.

**Global:** `?` help, `:` command palette, `q` pop, `Esc` cascade, `Ctrl+C` quit, `g` go-to.

### Key Conflict Resolution Matrix

| Key | Landing List | Detail Overview | Detail Changes | Detail Reviews | Detail Comments | Detail Diff | Forms |
|-----|-------------|-----------------|----------------|---------------|-----------------|-------------|-------|
| `c` | Create landing | — | — | — | Add comment | — | Input |
| `d` | — | — | Per-change diff | Dismiss review | — | — | Input |
| `r` | Reviewer picker | Submit review | — | Submit review | — | — | Input |
| `x` | Close/reopen | Close/reopen | — | — | — | Expand hunks | Input |
| `m` | Queue merge | Queue merge | — | — | — | — | Input |
| `n`/`p` | — | — | Conflict nav | Review nav | Comment nav | — | Input |
| `o` | Cycle sort | — | — | — | — | — | Input |
| `e` | Edit landing | Edit landing | Edit landing | Edit landing | Edit landing | Edit landing | Input |
| `t` | — | — | — | — | — | Toggle mode | Input |
| `w` | — | — | — | — | — | Toggle ws | Input |

### Esc Cascade Priority

1. Stacked overlays: close topmost only
2. Single overlay open: close it
3. Search input focused: blur, clear query
4. Form with unsaved changes: confirmation dialog
5. Discard confirmation dialog open: cancel dialog
6. None of above: pop screen

### Responsive Behavior

Status bar hints: 3 at 80col, 5–6 at 100col, 6–8 at 120col, all at 200+. Rightmost hints dropped first. Priority: navigation > primary action > secondary > tertiary > back.

Help overlay: 90% width at 80×24 (single column), 70% at 120×40 (single column), 60% at 200×60 (two columns).

During bulk selection, hints change to show count and bulk actions. Tab-level hints update within one render frame of tab switch.

### Data Hooks

- `useKeyboard()` from `@opentui/react` — key event handler registration
- `useTerminalDimensions()` from `@opentui/react` — hint count and overlay sizing
- `useOnResize()` from `@opentui/react` — recompute on resize
- `useLandings()`, `useLanding()`, `useLandingReviews()`, `useLandingChanges()` from `@codeplane/ui-core` — data for actions
- `useCreateLanding()`, `useUpdateLanding()`, `useCreateLandingReview()` from `@codeplane/ui-core` — mutation hooks
- `useNavigation()`, `useRepoContext()`, `useHelpOverlay()`, `useStatusBarHints()`, `useGoToMode()` from local TUI

### Command Palette Landing Actions

`Create landing request`, `Close landing request`, `Reopen landing request`, `Queue for merge`, `Edit landing request`, `Submit review`, `Filter by state`, `Filter by reviewer`, `Filter by bookmark`, `Filter by conflict status`, `Clear all filters`, `Sort by...`, `View changes`, `View reviews`, `View diff`, `View comments`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View keybinding hints / status bar | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Open help overlay | ✅ | ✅ | ✅ | ✅ | ✅ |
| Navigate landing list (`j`/`k`/`Enter`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate landing detail tabs (`Tab`/`1`–`5`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate diff (`]`/`[`/`t`/`w`/`x`/`z`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Create landing (`c` on list) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit landing (`e` on detail) | ❌ | ❌ | ✅ (own landings) | ✅ | ✅ |
| Close/reopen landing (`x`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Queue for merge (`m`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Submit review (`r`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Dismiss review (`d` on Reviews tab) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Add inline comment (`c` on Comments tab) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bulk close/reopen (`x` with selection) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Filter/search (`f`/`r`/`b`/`c`/`o`/`/`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token is never displayed in keybinding hints, help overlay, status bar messages, or confirmation dialogs
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Keybindings for unauthorized actions are still shown — the action itself returns an inline permission error, not a hidden shortcut

### Rate Limiting

- Keyboard dispatch itself generates zero API requests
- Rate limits: GET landings 300 req/min, PATCH close/reopen 60 req/min, POST create 60 req/min, POST review 60 req/min, PUT land (merge) 30 req/min
- 429 responses: status bar shows "Rate limited. Retry in {N}s." for 2 seconds
- Rapid mutating key presses debounced at action layer
- Bulk close/reopen batches with 100ms stagger

### Input Sanitization

- Keybinding dispatch processes only single-byte ASCII characters and modifier keys
- No keybinding triggers shell command execution or eval
- Go-to destinations come from hardcoded constant array
- Status bar hints generated from hardcoded templates
- Filter picker options come from API data rendered as plain `<text>` — no injection vector

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.landings.keyboard.shortcut_used` | Any landing-level keybinding activated | `repo_full_name`, `key`, `action`, `sub_screen` (list/detail-overview/detail-changes/detail-reviews/detail-comments/detail-diff/create-form/edit-form/review-form), `terminal_width`, `terminal_height` |
| `tui.landings.keyboard.help_opened` | `?` from any landing screen | `repo_full_name`, `sub_screen`, `total_keybindings_shown`, `groups_shown` |
| `tui.landings.keyboard.help_closed` | Help overlay closed | `close_method` (Esc/question_mark/Ctrl+C), `time_open_ms`, `scroll_depth_percent` |
| `tui.landings.keyboard.goto_activated` | `g` pressed from landing screen | `repo_full_name`, `sub_screen` |
| `tui.landings.keyboard.goto_completed` | Go-to navigation completed | `destination`, `time_to_second_key_ms`, `origin_sub_screen` |
| `tui.landings.keyboard.goto_cancelled` | Go-to cancelled | `cancel_reason` (timeout/esc/unrecognized), `time_elapsed_ms` |
| `tui.landings.keyboard.tab_switch` | Tab changed in detail view | `from_tab`, `to_tab`, `method` (Tab/number/h_l), `landing_number` |
| `tui.landings.keyboard.context_switch` | Sub-screen transition changes key meanings | `key`, `from_sub_screen`, `to_sub_screen`, `from_action`, `to_action` |
| `tui.landings.keyboard.conflict_suppressed` | Keybinding suppressed by focus context | `key`, `suppression_reason`, `sub_screen` |
| `tui.landings.keyboard.bulk_action` | Bulk close/reopen triggered | `action`, `selection_count`, `success_count`, `failure_count` |
| `tui.landings.keyboard.esc_cascade` | Esc cascade resolved | `cascade_level`, `sub_screen` |
| `tui.landings.keyboard.action_error` | Keybinding action failed | `key`, `action`, `error_type`, `http_status` |
| `tui.landings.keyboard.command_palette_used` | Landing action via palette | `action`, `search_query`, `result_position` |
| `tui.landings.keyboard.form_submit_method` | Form submitted | `method` (ctrl_s/enter_button/palette), `form_type` (create/edit/review) |
| `tui.landings.keyboard.diff_navigation` | Diff keybinding used | `key`, `action`, `landing_number` |
| `tui.landings.keyboard.review_quick_flow` | Approve/reject in <5s | `review_type`, `time_to_submit_ms`, `keystrokes_count` |

### Common Properties

All events include: `session_id`, `timestamp` (ISO 8601), `viewer_id`, `terminal_width`, `terminal_height`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Keybinding adoption rate | >70% of landing sessions | % of sessions with at least one keybinding used |
| Help overlay usage | <30% of sessions | Decreasing over time indicates intuitiveness |
| Command palette fallback | <20% of actions | Lower = better keybinding discovery |
| Go-to completion rate | >80% of activations | Successful navigation vs cancellation |
| Context key confusion | <3% of key events | User immediately Esc/undo after wrong-context key |
| Tab switch by number | >60% of tab switches | Direct jump (1-5) preferred over Tab cycling |
| Bulk action adoption | >8% of close/reopen | Multi-select vs single actions |
| Form Ctrl+S usage | >50% of submits | Power users prefer Ctrl+S |
| Quick review flow (<5s) | >25% of reviews | Efficient keyboard-driven review |
| Action error rate | <2% | Failed keybinding-triggered actions |
| Key processing latency (p99) | <16ms | Never exceeds one frame |
| Esc cascade correctness | >99% | Performs user's intended action |
| Diff keybinding usage | >40% of diff views | Users navigating diff with keys vs scrolling |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Key event received | `LandingKeyboard: key=[{key}] modifiers=[{mods}] sub_screen=[{sub_screen}] focus=[{focus}]` |
| `debug` | Key dispatched | `LandingKeyboard: dispatched [key={key}] [handler={handler_name}] [layer={layer}]` |
| `debug` | Key suppressed | `LandingKeyboard: suppressed [key={key}] [reason={reason}] [sub_screen={sub_screen}]` |
| `debug` | Tab switch | `LandingKeyboard: tab switch [from={from_tab}] [to={to_tab}] [method={method}]` |
| `debug` | Go-to mode entered | `LandingKeyboard: goto mode entered [sub_screen={sub_screen}]` |
| `debug` | Go-to resolved | `LandingKeyboard: goto resolved [destination={dest}] [elapsed_ms={ms}]` |
| `debug` | Go-to cancelled | `LandingKeyboard: goto cancelled [reason={reason}] [elapsed_ms={ms}]` |
| `debug` | Status hints updated | `LandingKeyboard: hints updated [count={n}] [truncated={bool}] [width={w}] [sub_screen={sub_screen}]` |
| `debug` | Esc cascade level | `LandingKeyboard: esc cascade [level={level}] [sub_screen={sub_screen}]` |
| `debug` | Bulk selection changed | `LandingKeyboard: selection [count={n}] [action=select|deselect|clear]` |
| `info` | Help overlay toggled | `LandingKeyboard: help overlay [action=open|close] [sub_screen={sub_screen}] [groups={n}] [entries={n}]` |
| `info` | Landing action triggered | `LandingKeyboard: action [key={key}] [action={action}] [repo={repo}] [landing={number}]` |
| `info` | Bulk action triggered | `LandingKeyboard: bulk action [action={action}] [count={n}] [repo={repo}]` |
| `info` | Review submitted via key | `LandingKeyboard: review submitted [type={type}] [landing={number}] [time_ms={ms}]` |
| `info` | Diff navigation used | `LandingKeyboard: diff nav [key={key}] [action={action}] [file_index={i}]` |
| `warn` | Action failed | `LandingKeyboard: action failed [key={key}] [action={action}] [error={error_type}] [status={http_status}]` |
| `warn` | Queue overflow | `LandingKeyboard: queue overflow [dropped={n}] [queue_depth=64]` |
| `warn` | Permission denied | `LandingKeyboard: permission denied [action={action}] [repo={repo}] [landing={number}]` |
| `error` | Handler exception | `LandingKeyboard: handler error [key={key}] [handler={handler}] [error={msg}] [stack={trace}]` |
| `error` | Auth error | `LandingKeyboard: auth error [action={action}] [repo={repo}] [status=401]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error | Detection | Recovery |
|-------|-----------|----------|
| Handler throws exception | try/catch in dispatch loop | Error logged, key ignored, status bar flash for 2s |
| Close/reopen fails (network) | PATCH rejects | Optimistic revert, status bar: "Close failed" for 2s |
| Merge fails (409 conflict) | PUT returns 409 | Status bar: "Landing has conflicts, cannot merge" for 3s |
| Merge fails (403 permission) | PUT returns 403 | Status bar: "Permission denied" for 2s |
| Review submit fails | POST rejects | Form re-enabled, error shown at top, fields preserved |
| Dismiss review fails | PATCH rejects | Optimistic revert, status bar: "Dismiss failed" for 2s |
| Bulk close partial failure | Mixed responses | All optimistic reverts, status bar: "N of M failed" |
| Go-to timeout | Timer fires | Cancelled silently, hints revert |
| Resize during dispatch | useOnResize mid-handler | Handler completes first, re-layout after |
| SSE disconnect | SSE provider emits disconnect | Keyboard dispatch unaffected, data may be stale |
| 401 during action | API returns 401 | Propagates to auth error screen |
| 429 rate limit | API returns 429 | Status bar: "Rate limited. Retry in {N}s." |
| Queue overflow (>64 events) | Depth check | Oldest processed, overflow dropped, warning logged |
| Tab switch during pending mutation | Mutation in-flight check | Tab switches freely; mutation continues in background |
| Diff split toggle at 80×24 | Width check | Status bar flash "Split mode unavailable" |

### Failure Modes

- **Dispatch crash**: Error boundary catches, shows error screen with `r` to restart
- **Status bar crash**: Falls back to empty hints, keybindings still work
- **Help overlay crash**: Falls back to "Unable to display help. Press Esc to close."
- **Go-to timer leak**: Cleared on unmount via useEffect cleanup
- **Bulk action crash**: Error boundary, partial results applied, `R` retries remaining
- **Tab content crash**: Error boundary per-tab, other tabs remain functional
- **Diff viewer crash**: Falls back to "Unable to render diff. Press q to go back."
- **Memory accumulation**: Handlers cleaned up on unmount, stable references via useCallback/useEvent
- **Form timer leak**: Confirmation dialog timeouts cleared on unmount

## Verification

### Test File: `e2e/tui/landings.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests — Status Bar Hints (15 tests)

1. `landing-keyboard-status-bar-list-120x40` — Landing list at 120×40, assert 6–8 hints including merge and close
2. `landing-keyboard-status-bar-list-80x24` — Landing list at 80×24, assert 3 hints
3. `landing-keyboard-status-bar-list-200x60` — Landing list at 200×60, assert all hints
4. `landing-keyboard-status-bar-detail-overview-120x40` — Detail overview tab hints
5. `landing-keyboard-status-bar-detail-changes-120x40` — Detail changes tab hints (d, D, n/p)
6. `landing-keyboard-status-bar-detail-reviews-120x40` — Detail reviews tab hints (r, d)
7. `landing-keyboard-status-bar-detail-comments-120x40` — Detail comments tab hints (c)
8. `landing-keyboard-status-bar-detail-diff-120x40` — Detail diff tab hints (]/[, t, w)
9. `landing-keyboard-status-bar-detail-80x24` — Detail at 80×24, 3 hints
10. `landing-keyboard-status-bar-create-form` — Create form hints
11. `landing-keyboard-status-bar-edit-form` — Edit form hints
12. `landing-keyboard-status-bar-review-form` — Review form hints (1/2/3, Ctrl+S)
13. `landing-keyboard-status-bar-bulk-selection` — 3 selected, selection hints
14. `landing-keyboard-status-bar-search-active` — Search mode hints
15. `landing-keyboard-status-bar-goto-mode` — Go-to destination hints

#### Terminal Snapshot Tests — Help Overlay (8 tests)

16. `landing-keyboard-help-overlay-list` — Help on list, 6 groups
17. `landing-keyboard-help-overlay-detail-overview` — Help on overview, 5 groups
18. `landing-keyboard-help-overlay-detail-changes` — Changes entries (d, D, n/p)
19. `landing-keyboard-help-overlay-detail-diff` — Diff entries (]/[, t, w, x/z, Ctrl+B)
20. `landing-keyboard-help-overlay-review-form` — Form groups
21. `landing-keyboard-help-overlay-80x24` — 90% width, single column
22. `landing-keyboard-help-overlay-200x60` — 60% width, two columns
23. `landing-keyboard-help-overlay-scrolled` — Scrollable at 80×24

#### Keyboard Tests — List Navigation (11 tests)

24–34: j/k/arrows, G/gg, Ctrl+D/U, Enter opens detail, boundary behavior

#### Keyboard Tests — List Actions (13 tests)

35–47: c create, x close/reopen/noop-merged/revert-403, m merge/conflict/permission, Space select/deselect, bulk close/confirmation

#### Keyboard Tests — List Filters (9 tests)

48–56: f state cycling, o sort, r reviewer picker, b bookmark picker, c conflict filter, x clear all, / search, Esc clears search

#### Keyboard Tests — Detail Tab Navigation (10 tests)

57–66: Tab/Shift+Tab cycling, 1–5 jump, h/l adjacent, wrap-around

#### Keyboard Tests — Detail Actions (8 tests)

67–74: e edit, m merge, x close/reopen, r review, noop on merged/closed states

#### Keyboard Tests — Changes Tab (8 tests)

75–82: j/k navigate, Enter detail, d diff, D combined, n/p conflict nav, noop no conflicts

#### Keyboard Tests — Reviews Tab (7 tests)

83–89: j/k navigate, r review form, d dismiss/confirmation/403, Enter expand/collapse

#### Keyboard Tests — Diff Tab (9 tests)

90–98: ]/[ files, t toggle, t unavailable 80×24, w whitespace, x/z hunks, Ctrl+B tree, j/k scroll

#### Keyboard Tests — Forms (12 tests)

99–110: Tab cycling, Ctrl+S submit, Esc cancel clean/dirty, review type 1/2/3 selection

#### Keyboard Tests — Priority & Suppression (9 tests)

111–119: Keys suppressed in input/overlay/help, Esc topmost only, Ctrl+C/S from input, 1 in review vs tab, d changes vs reviews, c list vs comments

#### Keyboard Tests — Go-To Mode (8 tests)

120–127: g activates, destinations from list/detail, cancel Esc/timeout/unknown, gg scroll-to-top, gq cancel+pop

#### Keyboard Tests — Rapid Input (6 tests)

128–133: Rapid j, f cycling, Space toggle, x debounce, m idempotent, tab switch

#### Keyboard Tests — Context Disambiguation (8 tests)

134–141: c creates/comments/types, d diffs/dismisses/types, r picker/review per sub-screen

#### Responsive Tests (16 tests)

142–157: Hints at all breakpoints for list/detail/diff, help overlay sizing, resize preserving focus/tab/content/overlay, hint recompute, goto during resize

#### Integration Tests (18 tests)

158–175: Full review workflow, merge workflow, create-and-view, edit-and-verify, change-stack-to-diff flow, diff file navigation, auth expiry, rate limit, permission denied, deep link, command palette, back navigation, help scrolling, concurrent bulk actions, empty list, no-color terminal, quick review approve, own-landing review restriction

**Total: 175 tests** — all left failing if backend is unimplemented, never skipped or commented out.
