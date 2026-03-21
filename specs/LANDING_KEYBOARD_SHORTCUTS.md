# LANDING_KEYBOARD_SHORTCUTS

Specification for LANDING_KEYBOARD_SHORTCUTS.

## High-Level User POV

When a user works with landing requests in Codeplane — whether in the web application, the terminal UI, or the desktop app — keyboard shortcuts transform the landing review-and-merge workflow from a mouse-driven, multi-step process into a fluid, muscle-memory-driven experience. Landing requests are Codeplane's jj-native alternative to pull requests: they represent a stack of jj changes proposed for landing into a target bookmark. The user can navigate landing request lists, triage landings by state and conflict status, browse stacked changes and diffs, submit reviews, add comments, close/reopen or queue landings for merge, and perform bulk operations entirely from the keyboard.

On the web application, the user presses a repository-scoped shortcut or navigates to the landings page to enter the landing keyboard context. Once on the landing list, `j`/`k` or arrow keys navigate between rows, `Enter` opens a landing request, and single-key actions like `c` (create), `x` (close/reopen), or `m` (queue for merge) trigger common operations. On the landing detail view, shortcuts let the user switch between tabs (Overview, Changes, Reviews, Comments, Diff) using `Tab`/`Shift+Tab` or number keys `1`–`5`, submit reviews with `r`, navigate stacked changes with `j`/`k`, explore per-change diffs with `d`, toggle diff display modes with `t`, and toggle whitespace visibility with `w`. The user always knows what shortcuts are available because a hint strip at the bottom of the page shows context-sensitive shortcuts, and pressing `?` opens a full keyboard shortcut reference overlay. The global command palette (`Ctrl+K` or `:`) also lists all landing actions as searchable, fuzzy-matched commands with keybinding hints alongside each entry.

On the TUI, the same conceptual keybinding model applies in a terminal-native form. The TUI's layered keyboard dispatch ensures the correct contextual action is triggered depending on whether the user is viewing the landing list, a specific detail tab, a review form, a filter overlay, or inside a text input. A status bar at the bottom of the terminal shows context-sensitive hints that update instantly as the user moves between screens and tabs. The TUI adds go-to mode (`g l` from any repository screen to jump to landings), multi-select for bulk operations, and the 6-layer priority dispatch hierarchy that prevents key conflicts.

On the desktop app, the embedded web UI inherits all web keyboard shortcuts, and native menu accelerators are mapped to the most critical landing actions so they appear in system menus.

The overall value is speed and confidence during code review. A reviewer can open a landing request, scan the change stack, jump between per-change diffs, toggle whitespace to focus on meaningful changes, submit an approval, and queue the landing for merge — all without lifting their hands from the keyboard. The consistent shortcut vocabulary across all Codeplane clients means the user only learns one set of bindings, and the jj-native concepts (change IDs, bookmarks, stacked changes, conflict status) are directly accessible through keyboard actions rather than hidden behind clicks.

## Acceptance Criteria

### Definition of Done

- [ ] All landing-related keyboard shortcuts are operational across the web UI and TUI, with consistent action semantics (same key → same conceptual action)
- [ ] The web UI landing list supports keyboard navigation (`j`/`k` or `↑`/`↓`), landing opening (`Enter`), and single-key actions for create (`c`), close/reopen (`x`), queue for merge (`m`), and search (`/`)
- [ ] The web UI landing detail view supports tab switching (`Tab`/`Shift+Tab`, `1`–`5`, `h`/`l`), and cross-cutting actions for edit (`e`), merge (`m`), close/reopen (`x`), and review (`r`)
- [ ] The web UI landing detail Changes tab supports change-stack navigation (`j`/`k`), per-change diff (`d`), combined diff (`D`), and conflict navigation (`n`/`p`)
- [ ] The web UI landing detail Reviews tab supports review navigation (`j`/`k`), review submission (`r`), and review dismissal (`d`)
- [ ] The web UI landing detail Comments tab supports comment navigation (`j`/`k`, `n`/`p`) and comment creation (`c`)
- [ ] The web UI landing detail Diff tab supports file navigation (`]`/`[`), mode toggle (`t`), whitespace toggle (`w`), hunk expand/collapse (`x`/`z`), and file tree toggle (`Ctrl+B`)
- [ ] The TUI implements the full keybinding dispatch hierarchy documented in the TUI_LANDING_KEYBOARD_SHORTCUTS specification, including 6-layer priority resolution
- [ ] Pressing `?` on any landing screen (web or TUI) opens a keyboard shortcut help overlay showing all active context-sensitive shortcuts grouped by function
- [ ] The command palette (`Ctrl+K` / `:` in web, `:` in TUI) includes all landing actions as searchable commands with keybinding hints displayed alongside each entry
- [ ] Status bar (TUI) or hint strip (web) displays context-sensitive keybinding hints that update within one render frame of focus or screen changes
- [ ] All single-key shortcuts are suppressed when a text input or textarea has focus, except `Esc` (blur/cancel), `Ctrl+C` (cancel in TUI), and `Ctrl+S` / `Cmd+S` (submit)
- [ ] All single-key shortcuts are suppressed when a modal overlay (help, command palette, filter picker) is open, except `Esc` (close) and `?` (close help)
- [ ] `g l` (TUI go-to mode) navigates to the landings list when a repository is in context
- [ ] Keyboard-triggered mutations (close, reopen, merge, review, comment) apply optimistic UI updates and revert on server error
- [ ] Unauthorized shortcut actions display a non-disruptive permission error rather than hiding the shortcut
- [ ] Bulk selection via `Space` on the landing list toggles per-row selection; `x` on a multi-selection performs bulk close/reopen with a confirmation prompt when more than 3 landings are selected
- [ ] All keyboard handlers execute within 16ms to maintain 60fps responsiveness
- [ ] No two keybindings within the same active context produce conflicting actions for the same key
- [ ] Tab-specific keybindings are only active when their respective tab is selected
- [ ] Diff-specific keybindings are suppressed when the terminal/viewport is too narrow for split mode (flash message instead)
- [ ] Review form type selection via `1`/`2`/`3` keys works when the type selector is focused but does not conflict with tab navigation `1`–`5` on the detail view
- [ ] Multi-key sequence `g g` scrolls to the top of the current scrollable content, distinct from go-to mode

### Edge Cases

- [ ] Empty landing list: navigation keys (`j`/`k`/`Enter`/`x`/`Space`/`m`) are no-ops; only `c` (create), `q`/`Esc` (back), `?` (help), and `:` (palette) remain active
- [ ] Landing list with a single landing: `j` and `k` do not move; `Enter` and `x` operate on the single row
- [ ] `c` key context disambiguation: triggers "create landing" on the list, "add comment" on the Comments tab, and inserts the character `c` in any text input
- [ ] `d` key context disambiguation: triggers "per-change diff" on the Changes tab, "dismiss review" on the Reviews tab, and inserts `d` in text inputs
- [ ] `r` key context disambiguation: triggers "reviewer filter picker" on the list, "submit review" on the detail/Reviews tab, and inserts `r` in text inputs
- [ ] `x` key context disambiguation: triggers "close/reopen" on the list/detail, "expand hunks" on the Diff tab, and inserts `x` in text inputs
- [ ] `m` on a conflicted landing: shows status bar/toast message "Landing has conflicts, cannot merge" — does not attempt the API call
- [ ] `m` on an already-merged landing: no-op, no error
- [ ] `m` on a draft landing: shows "Cannot merge a draft landing request" message
- [ ] `x` with multi-selection exceeding 3 items: displays a confirmation dialog/prompt before executing
- [ ] `x` with multi-selection when some landings are already in the target state: skips no-op transitions, counts only actual state changes
- [ ] `x` on a merged landing in the list: no-op (merged landings cannot be closed/reopened via keyboard)
- [ ] `Space` on a merged landing: no-op for selection (merged landings are excluded from bulk operations)
- [ ] Rapid repeated key presses (>30/sec): all events processed sequentially, no drops, mutating actions debounced
- [ ] `g g` in TUI: recognized as "scroll to top" (not go-to destination `g`)
- [ ] `g` then timeout (1500ms) in TUI: go-to mode cancelled silently
- [ ] `g` then unrecognized key in TUI: go-to mode cancelled silently
- [ ] `g q`: go-to mode cancelled AND screen popped
- [ ] Overlay stacking: opening `?` (help) while a filter overlay is open stacks help on top; `Esc` closes only the topmost overlay
- [ ] Form with unsaved changes then `Esc` or `q`: dirty check dialog asks for confirmation before discarding
- [ ] Browser or terminal resize during keyboard dispatch: handler completes before re-layout
- [ ] Network failure during keyboard-triggered mutation: optimistic UI reverts, status/hint area shows error message for 3 seconds
- [ ] 401 during keyboard-triggered action: propagates to auth expiry flow
- [ ] 429 rate limit during keyboard-triggered action: displays rate-limit message with retry countdown
- [ ] `1` on review form type selector vs `1` on detail tab navigation: form layer wins when form is active
- [ ] Diff tab active at narrow width then `t` (toggle split): status bar flash "Split mode unavailable at this terminal width"
- [ ] Double `Ctrl+S` during form submission: second press is no-op while submission is in-flight
- [ ] Tab switch during pending mutation: tab switches freely; mutation continues in background
- [ ] Merge API returns 409: status bar/toast "Landing has conflicts, cannot merge" for 3 seconds
- [ ] Merge API returns 403: status bar/toast "Permission denied" for 2 seconds

### Boundary Constraints

- [ ] Maximum keybinding groups in help overlay: 10 (TUI), 8 (web)
- [ ] Maximum keybindings per group in help overlay: 25 (TUI), 20 (web)
- [ ] Maximum total keybindings in help overlay: 100 (TUI), 80 (web)
- [ ] Go-to mode timeout (TUI): 1500ms
- [ ] Keybinding handler execution budget: 16ms per key event
- [ ] Key event queue depth (TUI): 64 events maximum; overflow silently dropped with a warning log
- [ ] Bulk selection maximum: 30 landings
- [ ] Confirmation dialog prompt maximum width: 60 characters
- [ ] Status bar hint text (TUI): maximum `terminal_width - 20` characters; rightmost hints dropped first
- [ ] Web hint strip: maximum 8 hint groups at widths ≥1280px; 5 at ≥1024px; 3 at <1024px; hidden below 768px
- [ ] Status bar flash message duration: 2–3 seconds
- [ ] Shortcut keys limited to single ASCII characters, single ASCII characters with Ctrl/Cmd modifier, or two-key sequences starting with `g`
- [ ] Hint strip dismissal preference stored in local storage as a boolean flag only

## Design

### Web UI Design

#### Landing List Page Shortcuts

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `↓` | Move focus to next landing row | No text input focused |
| `k` / `↑` | Move focus to previous landing row | No text input focused |
| `Enter` | Open focused landing request | Focused row exists |
| `Home` / `g g` | Jump to first landing | No text input focused |
| `End` / `G` | Jump to last loaded landing | No text input focused |
| `c` | Open create landing form | No text input focused, user has write access |
| `x` | Close or reopen focused landing | No text input focused, user has write access, landing not merged |
| `m` | Queue focused landing for merge | No text input focused, user has write access, landing is open and clean |
| `f` | Focus the state filter control | No text input focused |
| `r` | Open reviewer filter picker | No text input focused |
| `b` | Open target bookmark filter picker | No text input focused |
| `/` | Focus the search input | No text input focused |
| `?` | Toggle keyboard shortcut help overlay | Always |
| `Ctrl+K` / `:` | Open command palette | No modal open |
| `Esc` | Close open overlay → blur search → navigate back | Cascade priority |
| `Space` | Toggle row selection (bulk mode) | No text input focused, landing not merged |

Focused-row styling: the currently keyboard-focused landing row receives a visible focus ring or highlight background that is distinct from hover styling. Focus follows the `j`/`k` cursor, not the mouse pointer. Mouse click sets the keyboard focus to the clicked row.

#### Landing Detail Page Shortcuts — All Tabs

| Key | Action | Condition |
|-----|--------|----------|
| `Tab` / `Shift+Tab` | Cycle to next/previous tab | No text input focused |
| `1`–`5` | Jump directly to tab (1=Overview, 2=Changes, 3=Reviews, 4=Comments, 5=Diff) | No text input focused, no form active |
| `h` | Move to adjacent left tab | No text input focused |
| `l` | Move to adjacent right tab | No text input focused |
| `e` | Open edit landing form | No text input focused, user has write access |
| `m` | Queue landing for merge | No text input focused, user has write access, landing is open and clean |
| `x` | Close or reopen landing | No text input focused, user has write access, landing not merged |
| `r` | Open review submission form | No text input focused, user has write access |
| `?` | Toggle keyboard shortcut help overlay | Always |
| `Ctrl+K` / `:` | Open command palette | No modal open |
| `Esc` | Close overlay → blur input → navigate back | Cascade priority |

#### Landing Detail — Changes Tab Shortcuts

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `↓` | Move focus to next change in stack | No text input focused |
| `k` / `↑` | Move focus to previous change in stack | No text input focused |
| `Enter` | Open focused change detail | Focused change exists |
| `d` | View per-change diff for focused change | Focused change exists |
| `D` | View combined diff for entire stack | No text input focused |
| `n` | Jump to next conflicted change | No text input focused, conflicts present |
| `p` | Jump to previous conflicted change | No text input focused, conflicts present |

#### Landing Detail — Reviews Tab Shortcuts

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `↓` | Move focus to next review | No text input focused |
| `k` / `↑` | Move focus to previous review | No text input focused |
| `Enter` | Expand/collapse focused review | Focused review exists |
| `r` | Open review submission form | No text input focused, user has write access |
| `d` | Dismiss focused review | No text input focused, user is admin/owner |
| `n` | Jump to next review | No text input focused |
| `p` | Jump to previous review | No text input focused |

#### Landing Detail — Comments Tab Shortcuts

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `↓` | Scroll down | No text input focused |
| `k` / `↑` | Scroll up | No text input focused |
| `c` | Focus comment textarea / open comment form | No text input focused, user has write access |
| `n` | Jump to next comment | No text input focused |
| `p` | Jump to previous comment | No text input focused |

#### Landing Detail — Diff Tab Shortcuts

| Key | Action | Condition |
|-----|--------|----------|
| `j` / `↓` | Scroll diff down | No text input focused |
| `k` / `↑` | Scroll diff up | No text input focused |
| `]` | Jump to next file in diff | No text input focused |
| `[` | Jump to previous file in diff | No text input focused |
| `t` | Toggle unified/split diff mode | No text input focused, viewport wide enough for split |
| `w` | Toggle whitespace visibility | No text input focused |
| `x` | Expand all hunks in current file | No text input focused |
| `z` | Collapse all hunks in current file | No text input focused |
| `Ctrl+B` | Toggle file tree sidebar | No text input focused |

#### Form Shortcuts (Create, Edit, Review)

| Key | Action | Condition |
|-----|--------|----------|
| `Tab` / `Shift+Tab` | Cycle to next/previous form field | Form is active |
| `Ctrl+S` / `Cmd+S` | Submit form | Form is active |
| `Esc` | Cancel form (with dirty check if changes exist) | Form is active |
| `Enter` | Activate focused submit button | Button has focus |

Review form additionally supports `1`/`2`/`3` to select Approve/Request Changes/Comment when the type selector is focused.

#### Key Conflict Resolution Matrix (Web)

| Key | Landing List | Detail Overview | Detail Changes | Detail Reviews | Detail Comments | Detail Diff | Forms |
|-----|-------------|-----------------|----------------|---------------|-----------------|-------------|-------|
| `c` | Create landing | — | — | — | Add comment | — | Input |
| `d` | — | — | Per-change diff | Dismiss review | — | — | Input |
| `r` | Reviewer filter | Submit review | — | Submit review | — | — | Input |
| `x` | Close/reopen | Close/reopen | — | — | — | Expand hunks | Input |
| `m` | Queue merge | Queue merge | — | — | — | — | Input |
| `n`/`p` | — | — | Conflict nav | Review nav | Comment nav | — | Input |
| `e` | — | Edit | Edit | Edit | Edit | Edit | Input |
| `t` | — | — | — | — | — | Toggle mode | Input |
| `w` | — | — | — | — | — | Toggle ws | Input |

#### Keyboard Shortcut Help Overlay (Web)

Triggered by `?` from any landing page. Displays a modal overlay with a semi-transparent backdrop. Content organized into groups: **Navigation**, **Actions**, **Changes**, **Reviews**, **Diff**, **Search & Filter**, **Selection**, **Global**. Only groups relevant to the current context are shown. Each entry shows the key on the left and a short description on the right. Scrollable if content overflows. Dismissed by `Esc` or pressing `?` again.

#### Hint Strip (Web)

A persistent horizontal bar at the bottom of landing pages showing context-sensitive shortcuts. Examples:
- **Landing list**: `j/k Navigate  Enter Open  c New  m Merge  x Close  ? Help`
- **Detail — Overview**: `Tab Switch tab  e Edit  m Merge  r Review  ? Help`
- **Detail — Changes**: `j/k Navigate  d Diff  D Combined  n/p Conflicts  ? Help`
- **Detail — Diff**: `]/[ Files  t Mode  w Whitespace  x Expand  ? Help`
- **Detail — Reviews**: `j/k Navigate  r Review  d Dismiss  ? Help`
- **Detail — Comments**: `j/k Scroll  c Comment  n/p Navigate  ? Help`
- **Form**: `Tab Fields  Ctrl+S Submit  Esc Cancel`

Responsive: fewer hints on narrow viewports, hidden below 768px. Dismissible via user preference (local storage boolean).

#### Command Palette Landing Commands

The global command palette (`Ctrl+K` or `:`) includes: Create landing request, Close landing request, Reopen landing request, Queue for merge, Edit landing request, Submit review, Filter landings (Open/Draft/Closed/Merged/All), Filter by reviewer, Filter by bookmark, Filter by conflict status, Clear all filters, Sort landings by…, View Changes/Reviews/Diff/Comments tab, Toggle diff mode, Toggle whitespace. Each command displays its keyboard shortcut hint.

#### Optimistic Updates (Web)

Mutations update UI immediately. Server errors trigger revert + toast (5s). Merge-specific: 409 shows conflict message, 403 shows permission denied. Review failures re-enable form with preserved values. Bulk partial failures keep successes, revert failures.

#### Esc Cascade Priority (Web)

1. Close topmost modal overlay
2. Blur focused search input
3. Dismiss active form (with dirty check)
4. Navigate back

### TUI UI Design

The TUI implements the full keybinding model from TUI_LANDING_KEYBOARD_SHORTCUTS with 6-layer priority dispatch (Text Input → Modal/Overlay → Go-to Mode → Active Sub-screen → Landing-wide → Global), go-to mode (`g l`), status bar hints (responsive to terminal width), bulk actions with confirmation, filter overlays, form mode, review form type selection (`1`/`2`/`3`), Esc cascade, and `R` retry key.

### CLI Considerations

The CLI supports `--json` structured output, `codeplane land list --state open`, `codeplane land close/reopen/merge <number>`, `codeplane land review <number> --type approve`, and `codeplane tui --screen landings --repo owner/repo` for deep-linking.

### Desktop App Design

Inherits all web shortcuts. Native menu items: "New Landing Request" (`Cmd+N`/`Ctrl+N`), "Queue for Merge" (`Cmd+M`/`Ctrl+M`), "Submit Review" (`Cmd+R`/`Ctrl+R`). Global `Cmd+K`/`Ctrl+K` registered as native accelerator.

### Documentation

1. **Landing Request Keyboard Shortcuts Reference** — Dedicated page listing all shortcuts by context with visual cheat sheet
2. **Code Review Workflow Guide** — Tutorial: open landing, browse change stack, view diffs, toggle whitespace, submit approval, queue merge — all keyboard
3. **Landing Triage Guide** — Tutorial: navigate list, filter by state/reviewer/conflicts, bulk close drafts, merge approved landings
4. **Command Palette Guide** — Updated to include all landing-specific palette commands
5. **Customization Note** — Shortcuts not user-customizable; follow standard conventions (vim-style `j`/`k`, `?` for help, `:` for palette)

## Permissions & Security

### Authorization Roles

| Action | Anonymous | Read-Only | Write (Member) | Admin | Owner |
|--------|-----------|-----------|----------------|-------|-------|
| View shortcut hints / help overlay | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate landing list (`j`/`k`/`Enter`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate landing detail tabs (`Tab`/`1`–`5`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Navigate diff (`]`/`[`/`t`/`w`/`x`/`z`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Filter / search landings (`f`/`r`/`b`/`/`) | ✅ (public repos) | ✅ | ✅ | ✅ | ✅ |
| Create landing (`c` on list) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit landing (`e` on detail) | ❌ | ❌ | ✅ (own landings) | ✅ | ✅ |
| Close/reopen landing (`x`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Queue for merge (`m`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Submit review (`r`) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Dismiss review (`d` on Reviews tab) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Add comment (`c` on Comments tab) | ❌ | ❌ | ✅ | ✅ | ✅ |
| Bulk close/reopen (`x` with selection) | ❌ | ❌ | ✅ | ✅ | ✅ |

Unauthorized users can see all keybinding hints and the help overlay — shortcuts for unavailable actions are shown but marked with a lock icon or "(requires write access)" annotation. Attempting the action returns a non-disruptive inline error rather than silently hiding the shortcut.

### Rate Limiting

- Keyboard dispatch itself generates zero API requests; only the resulting actions hit the server
- Landing list GET: 300 requests/minute
- Landing close/reopen PATCH: 60 requests/minute per user
- Landing create POST: 60 requests/minute per user
- Review submit POST: 60 requests/minute per user
- Review dismiss PATCH: 60 requests/minute per user
- Comment create POST: 60 requests/minute per user
- Queue for merge PUT: 30 requests/minute per user
- 429 responses: web displays a toast "Rate limited — retry in {N}s"; TUI displays a status bar message for 2 seconds
- Rapid mutating keypresses are debounced at the action layer (not the keyboard layer) to prevent accidental double-fires
- Bulk close/reopen batches requests with 100ms stagger to avoid triggering rate limits

### Data Privacy

- No keybinding, shortcut key, or keyboard event data contains PII
- Auth tokens are never displayed in hints, help overlays, status bars, or error messages
- Telemetry events record the key pressed and action triggered but never record the content of landing titles, bodies, review bodies, or comments
- Local storage for hint strip visibility preference contains only a boolean flag, no user-identifying information

## Telemetry & Product Analytics

### Key Business Events

| Event Name | Trigger | Properties |
|------------|---------|------------|
| `landing.keyboard.shortcut_used` | Any landing keybinding activated | `client` (web/tui/desktop), `repo_full_name`, `key`, `action`, `context` (list/detail-overview/detail-changes/detail-reviews/detail-comments/detail-diff/create-form/edit-form/review-form), `viewport_width`, `viewport_height` |
| `landing.keyboard.help_opened` | `?` pressed on any landing screen | `client`, `repo_full_name`, `context`, `total_bindings_shown`, `groups_shown` |
| `landing.keyboard.help_closed` | Help overlay dismissed | `client`, `close_method` (esc/question_mark/click_outside), `time_open_ms`, `scroll_depth_percent` |
| `landing.keyboard.command_palette_action` | Landing action executed via command palette | `client`, `action`, `search_query_length`, `result_position`, `repo_full_name` |
| `landing.keyboard.hint_strip_visibility_changed` | User shows/hides the hint strip | `client`, `new_state` (visible/hidden) |
| `landing.keyboard.tab_switch` | Tab changed in detail view | `client`, `from_tab`, `to_tab`, `method` (tab_key/number/h_l/palette), `landing_number` |
| `landing.keyboard.bulk_action` | Bulk close/reopen triggered | `client`, `action` (close/reopen), `selection_count`, `success_count`, `failure_count`, `repo_full_name` |
| `landing.keyboard.action_error` | Keyboard-triggered action failed | `client`, `key`, `action`, `error_type` (auth/permission/rate_limit/network/server/conflict), `http_status` |
| `landing.keyboard.optimistic_revert` | Optimistic update reverted due to server error | `client`, `action`, `error_type`, `repo_full_name` |
| `landing.keyboard.goto_completed` | TUI go-to `g l` navigated to landings | `origin_screen`, `time_to_second_key_ms` |
| `landing.keyboard.goto_cancelled` | TUI go-to cancelled | `cancel_reason` (timeout/esc/unrecognized), `time_elapsed_ms` |
| `landing.keyboard.context_switch` | Key meaning changed due to tab/screen transition | `key`, `from_context`, `to_context`, `from_action`, `to_action` |
| `landing.keyboard.form_submit_method` | Landing/review/comment form submitted | `client`, `method` (keyboard_shortcut/button_click/palette), `form_type` (create_landing/edit_landing/review/comment) |
| `landing.keyboard.review_quick_flow` | Review submitted within 5 seconds of opening form | `client`, `review_type` (approve/request_changes/comment), `time_to_submit_ms`, `keystrokes_count` |
| `landing.keyboard.diff_navigation` | Diff keybinding used | `client`, `key`, `action` (next_file/prev_file/toggle_mode/toggle_ws/expand_hunks/collapse_hunks/toggle_tree), `landing_number` |
| `landing.keyboard.merge_attempt` | Merge queued via keyboard | `client`, `landing_number`, `conflict_status`, `review_count`, `approval_count`, `outcome` (success/conflict/permission_denied/error) |
| `landing.keyboard.esc_cascade` | Esc cascade resolved | `client`, `cascade_level` (overlay/search/form/pop), `context` |

### Common Properties

All events include: `session_id`, `timestamp` (ISO 8601), `viewer_id` (hashed), `client_version`.

### Success Indicators

| Metric | Target | Interpretation |
|--------|--------|----------------|
| Keybinding adoption rate | >60% of landing sessions use ≥1 shortcut | Users discovering and adopting shortcuts |
| Help overlay open rate | <30% of sessions, decreasing over time | Decreasing = shortcuts becoming intuitive |
| Command palette fallback rate | <25% of landing actions via palette | Lower = keybindings well-learned |
| Keyboard-vs-click ratio for mutations | >40% keyboard after 30 days | Power users shifting to keyboard |
| Tab switch by number key | >60% of tab switches | Direct jump (1–5) preferred over Tab cycling |
| Quick review flow (<5s) | >25% of reviews | Efficient keyboard-driven review |
| Bulk action adoption | >8% of close/reopen actions | Multi-select is useful |
| Form submit via `Ctrl+S`/`Cmd+S` | >50% of form submissions | Keyboard-first form completion |
| Diff keybinding usage | >40% of diff views | Users navigating diff with keys vs scrolling |
| Action error rate from shortcuts | <2% | Shortcuts reliably trigger successful actions |
| Key processing latency p99 | <16ms | Shortcuts feel instant |
| Esc cascade correctness | >99% | Esc always does what user expects |
| TUI go-to completion rate | >80% of activations | Users complete the two-key sequence |
| Merge success rate from keyboard | >90% | Keyboard merge attempts succeed |

## Observability

### Logging Requirements

| Level | Event | Structured Context |
|-------|-------|-------------------|
| `debug` | Key event received | `key`, `modifiers`, `context` (list/detail-tab/form), `focus_element`, `client` |
| `debug` | Key dispatched to handler | `key`, `handler_name`, `priority_layer`, `context` |
| `debug` | Key suppressed by focus guard | `key`, `suppression_reason` (input_focused/modal_open/unauthorized), `context` |
| `debug` | Go-to mode entered (TUI) | `context`, `timestamp` |
| `debug` | Go-to mode resolved (TUI) | `destination`, `elapsed_ms` |
| `debug` | Go-to mode cancelled (TUI) | `cancel_reason`, `elapsed_ms` |
| `debug` | Tab switch | `from_tab`, `to_tab`, `method`, `context` |
| `debug` | Status bar / hint strip updated | `hint_count`, `truncated`, `viewport_width`, `context` |
| `debug` | Esc cascade resolved | `cascade_level` (overlay/search/form/pop), `context` |
| `debug` | Bulk selection changed | `selection_count`, `action` (select/deselect/clear), `context` |
| `info` | Help overlay toggled | `action` (open/close), `context`, `groups_count`, `entries_count`, `client` |
| `info` | Landing mutation triggered via shortcut | `key`, `action`, `repo`, `landing_number`, `client` |
| `info` | Bulk action triggered | `action`, `selection_count`, `repo`, `client` |
| `info` | Review submitted via keyboard | `review_type`, `landing_number`, `time_to_submit_ms`, `client` |
| `info` | Merge queued via keyboard | `landing_number`, `conflict_status`, `repo`, `client` |
| `info` | Diff navigation used | `key`, `action`, `file_index`, `landing_number`, `client` |
| `warn` | Action failed after keyboard trigger | `key`, `action`, `error_type`, `http_status`, `repo`, `landing_number` |
| `warn` | Optimistic revert triggered | `action`, `error_type`, `repo`, `landing_number` |
| `warn` | Key event queue overflow (TUI) | `dropped_count`, `queue_depth` |
| `warn` | Rate limit hit from keyboard action | `action`, `retry_after_seconds` |
| `warn` | Permission denied on action | `action`, `repo`, `landing_number` |
| `error` | Keyboard handler threw exception | `key`, `handler_name`, `error_message`, `stack_trace` |
| `error` | Auth error during keyboard action | `action`, `repo`, `http_status` |

Web logs to browser console (structured JSON in production). TUI logs to stderr. Level via `CODEPLANE_LOG_LEVEL` (default: `warn`).

### Prometheus Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `codeplane_landing_keyboard_events_total` | Counter | `client`, `key`, `action`, `context` | Total keyboard shortcut activations |
| `codeplane_landing_keyboard_handler_duration_ms` | Histogram | `client`, `action` | Key-to-handler completion time (buckets: 1,2,4,8,16,32,64ms) |
| `codeplane_landing_keyboard_suppressed_total` | Counter | `client`, `reason` | Keys suppressed by focus/modal guards |
| `codeplane_landing_keyboard_action_errors_total` | Counter | `client`, `action`, `error_type` | Failed keyboard-triggered mutations |
| `codeplane_landing_keyboard_optimistic_reverts_total` | Counter | `client`, `action` | Optimistic updates reverted |
| `codeplane_landing_keyboard_bulk_actions_total` | Counter | `client`, `action` | Bulk close/reopen operations |
| `codeplane_landing_keyboard_help_opens_total` | Counter | `client`, `context` | Help overlay opens |
| `codeplane_landing_keyboard_palette_actions_total` | Counter | `client`, `action` | Landing actions via command palette |
| `codeplane_landing_keyboard_tab_switches_total` | Counter | `client`, `method`, `to_tab` | Tab navigation events |
| `codeplane_landing_keyboard_merge_attempts_total` | Counter | `client`, `outcome` | Merge attempts from keyboard |
| `codeplane_landing_keyboard_reviews_submitted_total` | Counter | `client`, `review_type` | Reviews submitted via keyboard |
| `codeplane_landing_keyboard_diff_nav_total` | Counter | `client`, `action` | Diff navigation keybinding uses |
| `codeplane_landing_keyboard_goto_total` | Counter | `outcome` (completed/cancelled/timeout) | TUI go-to activations |
| `codeplane_landing_keyboard_queue_overflow_total` | Counter | | TUI key event queue overflows |

### Alerts and Runbooks

#### Alert: High keyboard action error rate
- **Condition**: `rate(codeplane_landing_keyboard_action_errors_total[5m]) / rate(codeplane_landing_keyboard_events_total[5m]) > 0.05` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `codeplane_landing_keyboard_action_errors_total` by `error_type` label to classify failures.
  2. If `error_type=server`: check API server health, database connectivity, recent deployments. Inspect landing endpoint logs.
  3. If `error_type=auth`: check session/token expiry rates and auth middleware.
  4. If `error_type=rate_limit`: check thresholds and per-user mutation rates, especially merge endpoint (30 req/min).
  5. If `error_type=conflict`: expected behavior — verify client-side conflict pre-check is working.
  6. If `error_type=network`: check connectivity, CDN health, DNS.
  7. Check client version distribution for regression.

#### Alert: Keyboard handler latency spike
- **Condition**: `histogram_quantile(0.99, codeplane_landing_keyboard_handler_duration_ms) > 32` for 3 minutes
- **Severity**: Warning
- **Runbook**:
  1. Identify slow `action` label from histogram breakdown.
  2. Mutations slow → check API endpoint latency for landing endpoints.
  3. Navigation slow → check rendering (DOM thrashing, re-renders). Diff rendering most likely culprit.
  4. Diff-related → check for unusually large diffs causing render stalls.
  5. TUI → check terminal emulator performance and dimensions.
  6. Check for memory leaks in handler registration.
  7. Review recent client-side code changes.

#### Alert: Key event queue overflow (TUI)
- **Condition**: `rate(codeplane_landing_keyboard_queue_overflow_total[5m]) > 0` sustained for 2 minutes
- **Severity**: Warning
- **Runbook**:
  1. >64 key events accumulated = blocked event loop.
  2. Check for synchronous blocking work in handlers.
  3. Check TUI rendering pipeline for excessive re-renders from large change stacks or diffs.
  4. Correlate with specific actions for targeted debugging.
  5. Set `CODEPLANE_LOG_LEVEL=debug` for dispatch timing.

#### Alert: Optimistic revert rate spike
- **Condition**: `rate(codeplane_landing_keyboard_optimistic_reverts_total[5m]) / rate(codeplane_landing_keyboard_events_total{action=~"close|reopen|merge|review_submit"}[5m]) > 0.10` for 5 minutes
- **Severity**: Warning
- **Runbook**:
  1. Classify failures by `error_type`.
  2. 409 conflicts → check concurrent mutation races and client-side conflict pre-check.
  3. 403 → check repository permission changes.
  4. 5xx → escalate to API server investigation.
  5. Verify optimistic logic matches server validation.

#### Alert: High merge failure rate
- **Condition**: `rate(codeplane_landing_keyboard_merge_attempts_total{outcome!="success"}[10m]) / rate(codeplane_landing_keyboard_merge_attempts_total[10m]) > 0.30` for 10 minutes
- **Severity**: Warning
- **Runbook**:
  1. Check `outcome` distribution: conflict/permission_denied/error.
  2. Mostly conflict → may be expected during high contention; verify conflict-status display accuracy.
  3. Mostly permission_denied → check merge permission changes.
  4. Mostly error → check API server health and jj operation logs.
  5. Verify client-side pre-check functionality.

### Error Cases and Failure Modes

| Error | Detection | User Impact | Recovery |
|-------|-----------|-------------|----------|
| Handler throws exception | try/catch in dispatch | Key ignored; toast/status flash 2s | Error logged; no state corruption |
| Close/reopen API failure | PATCH rejects | Optimistic revert; error toast/status 3s | Retry manually or `R` (TUI) |
| Merge API failure (409) | PUT returns 409 | Toast: "Landing has conflicts" 3s | Fix conflicts, retry |
| Merge API failure (403) | PUT returns 403 | Toast: "Permission denied" 2s | Contact repo admin |
| Create API failure | POST rejects | Form re-enabled; error shown; fields preserved | Fix and resubmit |
| Review submit failure | POST rejects | Form re-enabled; fields preserved | Fix and resubmit |
| Review dismiss failure | PATCH rejects | Optimistic revert; status flash 2s | Retry |
| Comment API failure | POST rejects | Comment removed; textarea refilled | Resubmit |
| Bulk close partial failure | Mixed responses | Successes kept; failures reverted; summary toast | Status: "N of M failed" |
| Go-to timeout (TUI) | 1500ms timer | Cancelled silently; hints revert | Press `g` again |
| Resize during dispatch | Resize event | Handler completes; re-layout after | Automatic |
| 401 auth expiry | API returns 401 | Auth error screen | Re-authenticate |
| 429 rate limit | API returns 429 | Toast with countdown | Wait and retry |
| Queue overflow (TUI) | Depth check | Oldest processed; newest dropped | Automatic; transient |
| Diff split at narrow width | Width check | Flash "Split mode unavailable" 2s | Use unified mode |
| Merge on draft | State check | Toast "Cannot merge draft" 2s | Change to open first |

## Verification

### E2E Tests — Web UI (Playwright)

#### Landing List Keyboard Navigation (13 tests)
1. `web-landing-keyboard-j-moves-focus-down` — Press `j`, verify next row has focus highlight
2. `web-landing-keyboard-k-moves-focus-up` — Press `k`, verify previous row has focus highlight
3. `web-landing-keyboard-down-arrow-moves-focus-down` — Press `↓`, same as `j`
4. `web-landing-keyboard-up-arrow-moves-focus-up` — Press `↑`, same as `k`
5. `web-landing-keyboard-enter-opens-landing-detail` — Focus row, press `Enter`, verify detail page loads with correct landing number
6. `web-landing-keyboard-home-jumps-to-first` — Press `Home`, verify first landing focused
7. `web-landing-keyboard-end-jumps-to-last` — Press `End`, verify last loaded landing focused
8. `web-landing-keyboard-j-at-bottom-does-not-wrap` — Focus last row, press `j`, verify focus stays
9. `web-landing-keyboard-k-at-top-does-not-move` — Focus first row, press `k`, verify focus stays
10. `web-landing-keyboard-empty-list-navigation-noop` — Empty list, press `j`/`k`/`Enter`, verify no errors
11. `web-landing-keyboard-single-item-navigation` — Single landing, press `j`/`k`, verify no movement; `Enter` opens
12. `web-landing-keyboard-focus-follows-click` — Click a row, verify keyboard focus moves to clicked row
13. `web-landing-keyboard-gg-scrolls-to-top` — Scroll down, press `g` then `g`, verify scrolled to top

#### Landing List Keyboard Actions (14 tests)
14. `web-landing-keyboard-c-opens-create-form` — Press `c`, verify create landing form opens
15. `web-landing-keyboard-x-closes-open-landing` — Focus open landing, press `x`, verify state changes to closed (optimistic)
16. `web-landing-keyboard-x-reopens-closed-landing` — Focus closed landing, press `x`, verify state changes to open (optimistic)
17. `web-landing-keyboard-x-noop-on-merged` — Focus merged landing, press `x`, verify no state change
18. `web-landing-keyboard-x-reverts-on-server-error` — Mock 500, press `x`, verify optimistic revert and error toast
19. `web-landing-keyboard-m-queues-merge` — Focus open clean landing, press `m`, verify merge initiated (optimistic)
20. `web-landing-keyboard-m-blocked-on-conflict` — Focus conflicted landing, press `m`, verify toast "Landing has conflicts, cannot merge"
21. `web-landing-keyboard-m-blocked-on-draft` — Focus draft landing, press `m`, verify toast "Cannot merge a draft landing request"
22. `web-landing-keyboard-m-permission-denied` — Mock 403, press `m`, verify toast "Permission denied"
23. `web-landing-keyboard-m-conflict-409` — Mock 409, press `m`, verify optimistic revert and conflict toast
24. `web-landing-keyboard-space-selects-row` — Press `Space`, verify row shows selection indicator
25. `web-landing-keyboard-space-deselects-row` — Select then `Space` again, verify deselection
26. `web-landing-keyboard-space-noop-on-merged` — Focus merged landing, press `Space`, verify no selection
27. `web-landing-keyboard-bulk-close-confirmation` — Select 4 landings, press `x`, verify confirmation dialog appears

#### Landing List Keyboard Filters (8 tests)
28. `web-landing-keyboard-f-focuses-state-filter` — Press `f`, verify state filter control is focused
29. `web-landing-keyboard-slash-focuses-search` — Press `/`, verify search input is focused
30. `web-landing-keyboard-r-opens-reviewer-picker` — Press `r`, verify reviewer filter picker opens
31. `web-landing-keyboard-b-opens-bookmark-picker` — Press `b`, verify bookmark filter picker opens
32. `web-landing-keyboard-esc-blurs-search` — Focus search, press `Esc`, verify search blurred
33. `web-landing-keyboard-esc-closes-filter-picker` — Open reviewer picker, press `Esc`, verify picker closed
34. `web-landing-keyboard-filter-picker-search` — Open reviewer picker, type a name, verify filtering works
35. `web-landing-keyboard-filter-enter-confirms` — Open reviewer picker, navigate with `j`/`k`, press `Enter`, verify filter applied

#### Landing List Suppression (6 tests)
36. `web-landing-keyboard-suppressed-when-search-focused` — Focus search, press `j`, verify no row navigation
37. `web-landing-keyboard-suppressed-when-create-form-open` — Open create form, press `x`, verify no close action
38. `web-landing-keyboard-c-types-in-search` — Focus search, press `c`, verify "c" typed, no create form
39. `web-landing-keyboard-ctrl-s-submits-from-form` — In create form, press `Ctrl+S`, verify form submits
40. `web-landing-keyboard-esc-closes-modal-not-page` — Open help, press `Esc`, verify help closed, page remains
41. `web-landing-keyboard-suppressed-when-help-open` — Open help, press `m`, verify no merge action

#### Landing Detail Tab Navigation (10 tests)
42-51: Tab/Shift+Tab cycling, 1-5 jump, h/l adjacent, wrap-around

#### Landing Detail Actions (10 tests)
52-61: e edit, m merge, m conflict error, x close/reopen/noop-merged, r review form, permission denied, scroll preserved

#### Landing Detail — Changes Tab (8 tests)
62-69: j/k navigate, Enter detail, d diff, D combined, n/p conflict nav, n noop no conflicts

#### Landing Detail — Reviews Tab (7 tests)
70-76: j/k navigate, Enter expand, r review form, d dismiss, d permission denied, d revert on failure

#### Landing Detail — Comments Tab (6 tests)
77-82: j/k scroll, c comment, n/p navigate, n noop at last

#### Landing Detail — Diff Tab (10 tests)
83-92: j/k scroll, ]/[ files, t toggle, t unavailable narrow, w whitespace, x expand, z collapse, Ctrl+B tree

#### Form Keyboard Tests (12 tests)
93-104: Tab cycling, Ctrl+S submit, Esc cancel clean/dirty, edit form, review type 1/2/3, double Ctrl+S idempotent

#### Help Overlay (7 tests)
105-111: ? opens/closes, Esc closes, list groups, diff groups, scrollable, not triggered in input

#### Command Palette (6 tests)
112-117: Ctrl+K opens, create landing, queue merge, shortcut hints, filter, toggle diff mode

#### Hint Strip (5 tests)
118-122: visible on list, updates on detail, updates per tab, responsive narrow, hidden on mobile

#### Optimistic Update Behavior (6 tests)
123-128: close success/revert, merge success/revert-conflict, review revert, bulk partial failure

#### Permission & Auth Edge Cases (5 tests)
129-133: unauthorized error, 401 redirect, 429 toast, shortcuts visible for readonly, dismiss requires admin

### E2E Tests — TUI (`@microsoft/tui-test`)

The TUI E2E tests are comprehensively specified in `TUI_LANDING_KEYBOARD_SHORTCUTS.md` and include **175 tests** across: status bar snapshots (15), help overlay snapshots (8), list navigation (11), list actions (13), filters (9), detail tab navigation (10), detail actions (8), Changes tab (8), Reviews tab (7), Diff tab (9), forms (12), priority & suppression (9), go-to mode (8), rapid input (6), context disambiguation (8), responsive (16), integration workflows (18).

### E2E Tests — API (6 tests)
134. `api-landing-close-reopen-round-trip` — Create, close, verify, reopen, verify
135. `api-landing-merge-clean` — Create clean landing, merge, verify merged
136. `api-landing-merge-conflict-409` — Create conflicted landing, merge, verify 409
137. `api-landing-merge-permission-403` — Read-only user merge, verify 403
138. `api-landing-rate-limit-429` — Exceed rate limit on merge, verify 429 with Retry-After
139. `api-landing-review-create-round-trip` — Create review, verify listed

### Cross-Client Consistency Tests (4 tests)
140. `cross-client-landing-close-web-reflects-in-tui` — Close via web, verify TUI reflects
141. `cross-client-landing-create-web-visible-in-cli` — Create via web, verify CLI lists it
142. `cross-client-landing-merge-web-reflects-in-tui` — Merge via web, verify TUI shows merged
143. `cross-client-keyboard-action-parity` — Verify keyboard actions match between web and TUI

**Total: 133 web/API/cross-client tests + 175 TUI tests = 308 tests**

All tests that fail due to unimplemented backends are left failing — never skipped or commented out.
