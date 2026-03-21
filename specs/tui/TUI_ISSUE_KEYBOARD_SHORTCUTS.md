# TUI_ISSUE_KEYBOARD_SHORTCUTS

Specification for TUI_ISSUE_KEYBOARD_SHORTCUTS.

## High-Level User POV

The issue keyboard shortcuts feature is the unified keybinding dispatch, conflict resolution, and discoverability layer for the entire issues domain in the Codeplane TUI. It orchestrates keyboard behavior across every issue-related screen — the issue list, issue detail view, issue create form, issue edit form, comment creation, and filter/search overlays — ensuring that keybindings are predictable, conflict-free, and always discoverable.

When a user navigates to any issue screen — via `g i` go-to from any repository context, the `:issues` command palette entry, or the `codeplane tui --screen issues --repo owner/repo` deep link — they enter a keyboard context with multiple active layers. The issue list has its own navigation (`j`/`k`), filtering (`f`, `L`, `a`), search (`/`), and actions (`c` to create, `x` to close/reopen, `Enter` to open). The issue detail view layers in scrolling, comment navigation (`n`/`p`), inline actions (`c` to comment, `e` to edit, `o` to toggle state), and dependency navigation. The create and edit forms switch keyboard semantics entirely: printable characters feed into text inputs, `Tab`/`Shift+Tab` cycle form fields, and most single-key shortcuts are suppressed. Filter overlays (label picker, assignee picker, milestone picker) introduce modal keyboard traps.

The user discovers issue-specific shortcuts through three mechanisms. First, the **status bar** at the bottom of the screen shows context-sensitive hints that change as the user moves between the issue list, a detail view, a form, or an overlay. On the issue list, the status bar might show `j/k:nav  ↵:open  f:filter  c:new  q:back`. Inside an issue detail, it shifts to `j/k:scroll  n/p:comment  c:reply  e:edit  q:back`. Inside a form, it shows `Tab:next  Ctrl+S:submit  Esc:cancel`. Second, pressing `?` opens the **help overlay**, which presents all active keybindings organized into labeled groups. Third, the **command palette** (`:`) provides fuzzy-searchable access to all issue actions.

The keybinding dispatch follows a strict priority hierarchy: (1) text inputs consume all printable characters; (2) modal overlays trap all keys except `Esc` and `Ctrl+C`; (3) go-to mode intercepts the second key; (4) the active issue sub-screen handles its local keybindings; (5) issue-wide shortcuts handle cross-cutting actions; (6) global shortcuts handle `q`, `Esc`, `?`, `:`, and `Ctrl+C`. Key conflicts between sub-screens are resolved by context — `c` means "create issue" on the list, "add comment" on the detail, and is character input in forms. The user never needs to memorize these rules because the status bar always reflects the current context.

The feature also manages **bulk actions** via multi-select. On the issue list, `Space` toggles row selection. When issues are selected, `x` closes/reopens all selected issues (with a confirmation prompt if more than 5 are selected). The status bar reflects the selection count.

## Acceptance Criteria

### Definition of Done

- [ ] A `useIssueKeyboard()` hook orchestrates all keyboard dispatch across issue list, issue detail, issue create form, issue edit form, comment creation, and filter/search overlays
- [ ] The hook composes keybindings from all issue sub-features: list navigation, detail scrolling/actions, form input, overlay interactions
- [ ] Keybinding priority follows the documented 6-layer hierarchy: input → modal/overlay → go-to → active sub-screen → issue-wide → global
- [ ] No two keybindings in the same active context produce different actions for the same key
- [ ] The help overlay (`?`) displays all active keybindings organized into labeled groups specific to the current issue sub-screen
- [ ] The status bar displays context-sensitive keybinding hints that update within one render frame of focus changes
- [ ] The command palette (`:`) includes all issue actions as searchable commands
- [ ] All single-key shortcuts are suppressed when a `<input>` or `<textarea>` has focus, except `Esc` (blur/cancel), `Ctrl+C` (quit), and `Ctrl+S` (submit)
- [ ] All single-key shortcuts are suppressed when a modal overlay is open, except `Esc` (close), `?` (close help), and `Ctrl+C` (quit)
- [ ] `g` prefix mode activates go-to navigation with 1500ms timeout and status bar destination hints
- [ ] Rapid key presses (holding down a key) are processed sequentially without dropping events
- [ ] Multi-key sequence `g g` scrolls to the top of the current scrollable content
- [ ] All keybinding handlers execute within 16ms (one frame at 60fps)
- [ ] Bulk selection via `Space` on issue list toggles selection state per-row and shows selection count in status bar
- [ ] Bulk close/reopen via `x` with multiple selections shows confirmation prompt when count > 5

### Priority Resolution Rules

- [ ] Layer 1 (Text Input): All printable characters, Tab, Shift+Tab, number keys, Backspace consumed. Only Esc, Ctrl+C, and Ctrl+S escape.
- [ ] Layer 2 (Modal/Overlay): All keys consumed by overlay handler. Esc closes. Ctrl+C quits. `?` toggles help. `j`/`k` navigate. `Space` toggles in multi-select. `Enter` confirms.
- [ ] Layer 3 (Go-to): Second key checked against destinations. `g` → scroll to top. `Esc` → cancel. `q` → cancel + pop. Unrecognized → cancel silently.
- [ ] Layer 4 (Active Sub-screen): Issue list handles `j`/`k`, `Enter`, `/`, `f`, `L`, `a`, `m`, `c`, `x`, `o`, `Space`, `G`, `g g`, `Ctrl+D`/`Ctrl+U`, `R`. Issue detail handles `j`/`k`, `n`/`p`, `c`, `e`, `o`, `Enter`, `G`, `g g`, `Ctrl+D`/`Ctrl+U`, `R`.
- [ ] Layer 5 (Issue-wide): `R` (retry), `q` (pop), `Esc` (cascade close).
- [ ] Layer 6 (Global): `?`, `:`, `Ctrl+C`, `g`.

### Edge Cases

- [ ] Terminal resize during keybinding dispatch: handler completes before re-layout
- [ ] Rapid key presses (>30 keys/second): all events processed sequentially, no drops
- [ ] `g g` distinguished from go-to mode: second `g` recognized as "scroll to top"
- [ ] `g q`: go-to mode cancelled AND screen popped
- [ ] `g Esc`: go-to mode cancelled, no pop
- [ ] `g` then timeout (1500ms): cancelled silently
- [ ] `c` key context: "create issue" on list, "add comment" on detail, character input in form
- [ ] `o` key context: "cycle sort" on list, "toggle state" on detail, character input in form
- [ ] `x` with multi-selection >5: confirmation prompt before bulk action
- [ ] Overlay open then immediate `Esc`: overlay closes, no cascade to pop screen
- [ ] Help overlay from inside filter overlay: filter overlay remains open underneath
- [ ] Form with unsaved changes then `q`: confirmation dialog before pop
- [ ] Empty issue list: `j`/`k`/`Enter`/`x`/`Space` are no-ops, only `c`/`q`/`Esc`/`?`/`:` active

### Boundary Constraints

- [ ] Maximum keybinding groups in help overlay: 8
- [ ] Maximum keybindings per group: 20 entries
- [ ] Maximum total keybindings in help overlay: 80
- [ ] Status bar hint string max: `terminal_width - 20` characters
- [ ] Status bar truncation: rightmost hints dropped first
- [ ] Go-to mode timeout: 1500ms
- [ ] Keybinding handler execution budget: 16ms per key event
- [ ] Key event queue depth: 64 events maximum (overflow silently dropped)
- [ ] Bulk selection max: 50 issues
- [ ] Confirmation dialog prompt max width: 60 characters

## Design

### Layout Integration

The issue keyboard shortcuts feature does not own a visible screen region. It operates as an invisible orchestration layer that integrates with three visible components: the status bar (bottom), the help overlay (modal), and the command palette (modal).

**Issue list keyboard context:**
```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues                   │
├──────────────────────────────────────────────────────────┤
│ Issues (142)                                     / search │
│ State: Open │ Labels: bug, ux │ Assignee: —               │
├──────────────────────────────────────────────────────────┤
│ ● #142  Fix login timeout on slow networks  [bug]  al…   │
│▸● #139  Add dark mode support               [ui] [ux]    │
│ ● #97   Refactor auth module                       bob    │
├──────────────────────────────────────────────────────────┤
│ j/k:navigate  Enter:open  f:filter  /:search  c:new  q:back │
└──────────────────────────────────────────────────────────┘
```

**Issue detail keyboard context:**
```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues > #142            │
├──────────────────────────────────────────────────────────┤
│ Fix login timeout on slow networks                        │
│ [open] @alice  3d ago  💬 5                                │
│ ─────────────────────────────────────────                 │
│ 💬 @bob  2d ago                                           │
│ I can reproduce this on staging...                        │
├──────────────────────────────────────────────────────────┤
│ j/k:scroll  n/p:comment  c:reply  e:edit  o:close  q:back │
└──────────────────────────────────────────────────────────┘
```

### Components Used

- `<box>` — Flexbox containers for layout, rows, toolbars, overlays
- `<scrollbox>` — Scrollable issue list, detail content, help overlay, filter overlays
- `<text>` — Status bar hints, help overlay entries, confirmation prompts, selection count
- `<input>` — Search input, form inputs, overlay filter inputs
- `<markdown>` — Issue body and comment rendering in detail view

### Keybinding Reference

**Issue list:** `j`/`k` navigate, `Enter` opens, `G`/`g g` jump, `Ctrl+D`/`Ctrl+U` page, `/` search, `f` cycle state, `L` label overlay, `a` assignee overlay, `m` milestone overlay, `o` cycle sort, `c` create, `x` close/reopen, `Space` select, `R` retry.

**Issue detail:** `j`/`k` scroll, `G`/`g g` jump, `Ctrl+D`/`Ctrl+U` page, `n`/`p` next/prev comment, `c` comment, `e` edit, `o` toggle state, `Enter` open dependency, `R` retry.

**Forms:** `Tab`/`Shift+Tab` cycle fields, `Ctrl+S` submit, `Esc` cancel (with confirmation if dirty), `Enter` confirm selector.

**Overlays:** `j`/`k` navigate, `Space` toggle, `Enter` confirm, `Esc` cancel, `/` filter.

**Global:** `?` help, `:` command palette, `q` pop, `Esc` cascade, `Ctrl+C` quit, `g` go-to.

### Esc Cascade Priority

1. Stacked overlays: close topmost only
2. Single overlay open: close it
3. Search input focused: blur, clear query
4. Form with unsaved changes: confirmation dialog
5. None of above: pop screen

### Responsive Behavior

Status bar hints: 3 at 80col, 5-6 at 100col, 6-8 at 120col, all at 200+. Rightmost hints dropped first. Help overlay: 90% at 80×24, 70% at 120×40, 60% at 200×60 (two-column). During bulk selection, hints change to show count and bulk actions.

### Data Hooks

- `useKeyboard()` from `@opentui/react` — key event handler registration
- `useTerminalDimensions()` from `@opentui/react` — hint count and overlay sizing
- `useOnResize()` from `@opentui/react` — recompute on resize
- `useIssues()`, `useIssue()`, `useIssueComments()`, `useRepoLabels()`, `useRepoCollaborators()` from `@codeplane/ui-core` — data for actions
- `useNavigation()`, `useRepoContext()`, `useHelpOverlay()`, `useStatusBar()`, `useGoToMode()` from local TUI

### Command Palette Issue Actions

`Create issue`, `Close issue`, `Reopen issue`, `Edit issue`, `Add comment`, `Filter by state: Open/Closed/All`, `Filter by label`, `Filter by assignee`, `Clear all filters`.

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View keybinding hints / status bar | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Open help overlay | ✅ | ✅ | ✅ | ✅ | ✅ |
| Navigate issue list (`j`/`k`/`Enter`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate issue detail (`j`/`k`/`n`/`p`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Create issue (`c` on list) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit issue (`e` on detail) | ❌ | ❌ | ✅ (own issues) | ✅ | ✅ |
| Close/reopen issue (`x` / `o`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Add comment (`c` on detail) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bulk close/reopen (`x` with selection) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Filter/search (`f`/`L`/`a`/`m`/`/`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |

### Token Handling

- Token loaded from CLI keychain or `CODEPLANE_TOKEN` environment variable at bootstrap
- Token is never displayed in keybinding hints, help overlay, status bar messages, or confirmation dialogs
- 401 responses propagate to app-shell auth error screen: "Session expired. Run `codeplane auth login` to re-authenticate."
- Keybindings for unauthorized actions are still shown — the action itself returns an inline permission error, not a hidden shortcut

### Rate Limiting

- Keyboard dispatch itself generates zero API requests
- Rate limits: GET issues 300 req/min, PATCH close/reopen 60 req/min, POST create 60 req/min, POST comment 60 req/min
- 429 responses: status bar shows "Rate limited. Retry in {N}s." for 2 seconds
- Rapid mutating key presses debounced at action layer
- Bulk close/reopen batches with 50ms stagger

### Input Sanitization

- Keybinding dispatch processes only single-byte ASCII characters and modifier keys
- No keybinding triggers shell command execution or eval
- Go-to destinations come from hardcoded constant array
- Status bar hints generated from hardcoded templates

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `tui.issues.keyboard.shortcut_used` | Any issue-level keybinding activated | `repo_full_name`, `key`, `action`, `sub_screen` (list/detail/form), `terminal_width`, `terminal_height` |
| `tui.issues.keyboard.help_opened` | `?` from any issue screen | `repo_full_name`, `sub_screen`, `total_keybindings_shown`, `groups_shown` |
| `tui.issues.keyboard.help_closed` | Help overlay closed | `close_method` (Esc/question_mark/Ctrl+C), `time_open_ms`, `scroll_depth_percent` |
| `tui.issues.keyboard.goto_activated` | `g` pressed from issue screen | `repo_full_name`, `sub_screen` |
| `tui.issues.keyboard.goto_completed` | Go-to navigation completed | `destination`, `time_to_second_key_ms`, `origin_sub_screen` |
| `tui.issues.keyboard.goto_cancelled` | Go-to cancelled | `cancel_reason` (timeout/esc/unrecognized), `time_elapsed_ms` |
| `tui.issues.keyboard.context_switch` | Sub-screen transition changes key meanings | `key`, `from_sub_screen`, `to_sub_screen`, `from_action`, `to_action` |
| `tui.issues.keyboard.conflict_suppressed` | Keybinding suppressed by focus context | `key`, `suppression_reason`, `sub_screen` |
| `tui.issues.keyboard.bulk_action` | Bulk close/reopen triggered | `action`, `selection_count`, `success_count`, `failure_count` |
| `tui.issues.keyboard.esc_cascade` | Esc cascade resolved | `cascade_level`, `sub_screen` |
| `tui.issues.keyboard.action_error` | Keybinding action failed | `key`, `action`, `error_type`, `http_status` |
| `tui.issues.keyboard.command_palette_used` | Issue action via palette | `action`, `search_query`, `result_position` |
| `tui.issues.keyboard.form_submit_method` | Form submitted | `method` (ctrl_s/enter_button/palette), `form_type` |

### Common Properties

All events include: `session_id`, `timestamp` (ISO 8601), `viewer_id`, `terminal_width`, `terminal_height`

### Success Indicators

| Metric | Target | Description |
|--------|--------|-------------|
| Keybinding adoption rate | >70% of issue sessions | % of sessions with at least one keybinding used |
| Help overlay usage | <30% of sessions | Decreasing over time indicates intuitiveness |
| Command palette fallback | <20% of actions | Lower = better keybinding discovery |
| Go-to completion rate | >80% of activations | Successful navigation vs cancellation |
| Context key confusion | <3% of key events | User immediately Esc/undo after wrong-context key |
| Bulk action adoption | >10% of close/reopen | Multi-select vs single actions |
| Form Ctrl+S usage | >50% of submits | Power users prefer Ctrl+S |
| Action error rate | <2% | Failed keybinding-triggered actions |
| Key processing latency (p99) | <16ms | Never exceeds one frame |
| Esc cascade correctness | >99% | Performs user's intended action |

## Observability

### Logging Requirements

| Level | Event | Format |
|-------|-------|--------|
| `debug` | Key event received | `IssueKeyboard: key=[{key}] modifiers=[{mods}] sub_screen=[{sub_screen}] focus=[{focus}]` |
| `debug` | Key dispatched | `IssueKeyboard: dispatched [key={key}] [handler={handler_name}] [layer={layer}]` |
| `debug` | Key suppressed | `IssueKeyboard: suppressed [key={key}] [reason={reason}] [sub_screen={sub_screen}]` |
| `debug` | Go-to mode entered | `IssueKeyboard: goto mode entered [sub_screen={sub_screen}]` |
| `debug` | Go-to resolved | `IssueKeyboard: goto resolved [destination={dest}] [elapsed_ms={ms}]` |
| `debug` | Go-to cancelled | `IssueKeyboard: goto cancelled [reason={reason}] [elapsed_ms={ms}]` |
| `debug` | Status hints updated | `IssueKeyboard: hints updated [count={n}] [truncated={bool}] [width={w}] [sub_screen={sub_screen}]` |
| `debug` | Esc cascade level | `IssueKeyboard: esc cascade [level={level}] [sub_screen={sub_screen}]` |
| `info` | Help overlay toggled | `IssueKeyboard: help overlay [action=open|close] [sub_screen={sub_screen}] [groups={n}] [entries={n}]` |
| `info` | Issue action triggered | `IssueKeyboard: action [key={key}] [action={action}] [repo={repo}] [issue={number}]` |
| `info` | Bulk action triggered | `IssueKeyboard: bulk action [action={action}] [count={n}] [repo={repo}]` |
| `warn` | Action failed | `IssueKeyboard: action failed [key={key}] [action={action}] [error={error_type}] [status={http_status}]` |
| `warn` | Queue overflow | `IssueKeyboard: queue overflow [dropped={n}] [queue_depth=64]` |
| `error` | Handler exception | `IssueKeyboard: handler error [key={key}] [handler={handler}] [error={msg}] [stack={trace}]` |
| `error` | Auth error | `IssueKeyboard: auth error [action={action}] [repo={repo}] [status=401]` |

Logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Error Cases

| Error | Detection | Recovery |
|-------|-----------|----------|
| Handler throws exception | try/catch in dispatch loop | Error logged, key ignored, status bar flash for 2s |
| Close/reopen fails (network) | PATCH rejects | Optimistic revert, status bar: "Close failed" for 2s |
| Create issue fails | POST rejects | Form re-enabled, error shown at top, fields preserved |
| Bulk close partial failure | Mixed responses | All optimistic reverts, status bar: "N of M failed" |
| Go-to timeout | Timer fires | Cancelled silently, hints revert |
| Resize during dispatch | useOnResize mid-handler | Handler completes first, re-layout after |
| SSE disconnect | SSE provider emits disconnect | Keyboard dispatch unaffected, data may be stale |
| 401 during action | API returns 401 | Propagates to auth error screen |
| 429 rate limit | API returns 429 | Status bar: "Rate limited. Retry in {N}s." |
| Queue overflow (>64 events) | Depth check | Oldest processed, overflow dropped, warning logged |
| Help >80 keybindings | Count check | Entries beyond 80 not rendered, "…" shown |

### Failure Modes

- **Dispatch crash**: Error boundary catches, shows error screen with `r` to restart
- **Status bar crash**: Falls back to empty hints, keybindings still work
- **Help overlay crash**: Falls back to "Unable to display help. Press Esc to close."
- **Go-to timer leak**: Cleared on unmount via useEffect cleanup
- **Bulk action crash**: Error boundary, partial results applied, `R` retries remaining
- **Memory accumulation**: Handlers cleaned up on unmount, stable references via useCallback

## Verification

### Test File: `e2e/tui/issues.test.ts`

All tests use `@microsoft/tui-test`. Tests that fail due to unimplemented backends are left failing (never skipped).

#### Terminal Snapshot Tests — Status Bar Hints (9 tests)

1. `issue-keyboard-status-bar-list-120x40` — Issue list at 120×40, assert 6-8 hints
2. `issue-keyboard-status-bar-list-80x24` — Issue list at 80×24, assert 3 hints
3. `issue-keyboard-status-bar-list-200x60` — Issue list at 200×60, assert all hints
4. `issue-keyboard-status-bar-detail-120x40` — Detail at 120×40, assert detail hints
5. `issue-keyboard-status-bar-detail-80x24` — Detail at 80×24, assert 3 hints
6. `issue-keyboard-status-bar-create-form` — Create form, assert form hints
7. `issue-keyboard-status-bar-bulk-selection` — 3 selected, assert selection hints
8. `issue-keyboard-status-bar-search-active` — Search mode, assert search hints
9. `issue-keyboard-status-bar-goto-mode` — Go-to mode, assert destination hints

#### Terminal Snapshot Tests — Help Overlay (6 tests)

10. `issue-keyboard-help-overlay-list` — Help on list, assert 5 groups
11. `issue-keyboard-help-overlay-detail` — Help on detail, assert 4 groups
12. `issue-keyboard-help-overlay-create-form` — Help on form, assert 2 groups
13. `issue-keyboard-help-overlay-80x24` — 90% width, single column
14. `issue-keyboard-help-overlay-200x60` — 60% width, two columns
15. `issue-keyboard-help-overlay-scrolled` — Scrollable at 80×24

#### Keyboard Tests — List Navigation (11 tests)

16. `issue-keyboard-j-moves-down-in-list`
17. `issue-keyboard-k-moves-up-in-list`
18. `issue-keyboard-down-arrow-moves-down`
19. `issue-keyboard-up-arrow-moves-up`
20. `issue-keyboard-G-jumps-to-bottom`
21. `issue-keyboard-gg-jumps-to-top`
22. `issue-keyboard-ctrl-d-pages-down`
23. `issue-keyboard-ctrl-u-pages-up`
24. `issue-keyboard-enter-opens-detail`
25. `issue-keyboard-j-wraps-at-bottom`
26. `issue-keyboard-k-stops-at-top`

#### Keyboard Tests — List Actions (9 tests)

27. `issue-keyboard-c-opens-create-form`
28. `issue-keyboard-x-closes-open-issue`
29. `issue-keyboard-x-reopens-closed-issue`
30. `issue-keyboard-x-reverts-on-403`
31. `issue-keyboard-space-selects-row`
32. `issue-keyboard-space-deselects-row`
33. `issue-keyboard-x-bulk-close`
34. `issue-keyboard-x-bulk-confirmation`
35. `issue-keyboard-x-bulk-deny-confirmation`

#### Keyboard Tests — Filters (7 tests)

36-42: State filter cycling, label/assignee/milestone overlays, search focus, sort cycling

#### Keyboard Tests — Detail Navigation (6 tests)

43-48: Scroll, next/prev comment, boundary behavior

#### Keyboard Tests — Detail Actions (5 tests)

49-53: Comment form, edit form, state toggle, dependency navigation

#### Keyboard Tests — Forms (8 tests)

54-61: Tab/Shift+Tab field cycling, Ctrl+S submit, validation, Esc cancel with dirty confirmation

#### Keyboard Tests — Overlays (5 tests)

62-66: Label overlay navigation, toggle, apply, cancel, filter

#### Keyboard Tests — Priority & Suppression (7 tests)

67-73: Keys suppressed in inputs/overlays/help, Esc from stacked overlays, Ctrl+C from input

#### Keyboard Tests — Go-To Mode (8 tests)

74-81: Go-to destinations, cancel, g g scroll-to-top, timeout, unknown key

#### Keyboard Tests — Rapid Input (5 tests)

82-86: Rapid j, rapid f, rapid Space, rapid x debounce, rapid mixed sequence

#### Keyboard Tests — Context Disambiguation (6 tests)

87-92: `c` creates/comments/types, `o` sorts/toggles/types per sub-screen

#### Responsive Tests (14 tests)

93-106: Hints at all breakpoints for list/detail, help overlay sizing, resize adaptation, focus preservation, overlay resize, form resize

#### Integration Tests (14 tests)

107-120: Full triage workflow, create-and-view workflow, dependency navigation, auth expiry, rate limit, permission denied, deep link, command palette actions, back navigation, help scrolling, concurrent actions, empty list, no-color terminal

**Total: 120 tests** — all left failing if backend is unimplemented, never skipped or commented out.
