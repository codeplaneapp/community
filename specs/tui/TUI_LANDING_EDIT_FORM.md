# TUI_LANDING_EDIT_FORM

Specification for TUI_LANDING_EDIT_FORM.

## High-Level User POV

The Landing Edit Form is a full-screen form overlay in the Codeplane TUI that allows a developer to modify an existing landing request's metadata directly from the terminal. Landing requests are Codeplane's jj-native alternative to pull requests — they represent a stack of changes proposed for landing into a target bookmark. The edit form is the primary mechanism for updating a landing request's title, body (description), target bookmark, source bookmark, and state without leaving the keyboard-driven terminal workflow.

The form is accessed from the landing detail view by pressing `e` (edit), from the landing list screen by pressing `e` while a landing request row is focused, or via the command palette with `:edit landing` when a repository context is active and a landing request is selected. When the edit form opens, it pushes onto the navigation stack and the breadcrumb updates to show "Dashboard > owner/repo > Landings > #12 > Edit".

All editable fields are pre-populated with the landing request's current values. The title field contains the existing title and is focused by default when the form opens — because title edits are the most common operation. Below the title is the body field, a multi-line textarea that supports free-form markdown content for the landing request description. Below the body are the metadata fields: target bookmark (a single-select dropdown listing repository bookmarks), source bookmark (a single-select dropdown, optional), and state (a single-select dropdown cycling through valid state transitions: open, draft, closed). The state selector enforces valid transitions — a merged landing request cannot be edited, and the state options reflect only transitions valid from the current state.

Navigation between form fields uses `Tab` (forward) and `Shift+Tab` (backward). The field order is: Title → Body → Target Bookmark → Source Bookmark → State → Save → Cancel. The focused field is visually indicated with a `primary` color border highlight and a `▸` indicator in the left margin.

Saving is triggered by pressing `Ctrl+S` from anywhere in the form, or by pressing `Enter` on the "Save" button. The form submits a `PATCH /api/repos/:owner/:repo/landings/:number` request with only modified fields. During submission, the "Save" button text changes to "Saving…" and all form inputs are disabled. On success, the form pops from the navigation stack and returns to the landing detail view. On failure, the form remains open with a red error message at the top.

Cancellation is triggered by pressing `Esc` or the "Cancel" button. If the form has unsaved changes, a confirmation dialog appears: "Discard unsaved changes? [y/N]". The entire edit workflow is optimized for speed: press `e`, edit the title (already focused), press `Ctrl+S` to save.

## Acceptance Criteria

### Definition of Done

- [ ] The Landing Edit Form renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The form is reachable by pressing `e` from the landing detail view, `e` from the landing list (focused row), or `:edit landing` from the command palette
- [ ] The breadcrumb reads "Dashboard > owner/repo > Landings > #N > Edit"
- [ ] All fields are pre-populated with the current landing request data fetched via `useLanding()` from `@codeplane/ui-core`
- [ ] The title field is focused by default when the form opens
- [ ] Tab order cycles through: Title → Body → Target Bookmark → Source Bookmark → State → Save → Cancel
- [ ] `Ctrl+S` submits the form from any field (except when a select overlay is open)
- [ ] Only modified fields are included in the PATCH request payload
- [ ] The form calls `PATCH /api/repos/:owner/:repo/landings/:number` via `useUpdateLanding()` hook
- [ ] On successful save, the form pops from the navigation stack and returns to the previous screen with updated data
- [ ] On save failure, the form remains open with a red error message at the top, inputs re-enabled
- [ ] `Esc` triggers cancellation: if changes exist, show confirmation dialog; if no changes, pop immediately
- [ ] The confirmation dialog renders "Discard unsaved changes? [y/N]" centered in a modal overlay
- [ ] A loading state ("Saving…") is shown on the Save button during submission, and all inputs are disabled
- [ ] The form does not open for merged landing requests — pressing `e` on a merged landing shows "Cannot edit a merged landing request" in the status bar for 3 seconds
- [ ] State selector only shows valid transitions from the current state
- [ ] Change IDs and stack size are displayed as read-only informational text (not editable)

### Keyboard Interactions

- [ ] `Tab`: Move focus to the next form field
- [ ] `Shift+Tab`: Move focus to the previous form field
- [ ] `Enter`: When on a metadata field (target bookmark/source bookmark/state), open the select overlay. When on Save button, submit. When on Cancel button, trigger cancel flow
- [ ] `Ctrl+S`: Submit the form from any field position
- [ ] `Esc`: If a select overlay is open, close it. If no overlay is open, trigger cancellation (with dirty-check)
- [ ] `j`/`k` and `Up`/`Down`: Within a select overlay, navigate options. Within the body textarea, scroll/navigate lines
- [ ] `/`: Within a select overlay (target/source bookmark), focus filter input for fuzzy search
- [ ] `y`: In the discard confirmation dialog, confirm discard and pop screen
- [ ] `n` / `N` / `Esc`: In the discard confirmation dialog, return to form
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides form)
- [ ] `R`: After save error, retry the save operation

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Single-column layout. Title input spans full width. Body textarea is 5 lines tall. Field labels abbreviated ("Title:", "Body:", "Target:", "Source:", "State:"). Bookmark names truncated at 25ch
- [ ] 120×40 – 199×59 (standard): Title input spans full width. Body textarea is 12 lines tall. Full field labels. Full bookmark names visible up to 50ch
- [ ] 200×60+ (large): Title input spans 80% width. Body textarea is 20 lines tall. Full bookmark names, wider select overlays

### Truncation and Boundary Constraints

- [ ] Title: maximum 255 characters; input scrolls horizontally
- [ ] Body: maximum 65,535 characters; textarea scrolls vertically
- [ ] Bookmark names in selectors: truncated at 30ch with `…` at minimum, 50ch at standard, full at large
- [ ] Bookmark list in select overlay: maximum 20 visible options with scrolling
- [ ] Error messages: truncated at terminal width minus 4 characters with `…`
- [ ] Field labels: minimum 7ch width, right-aligned with `:` separator
- [ ] Source bookmark value: shows "None" when empty
- [ ] State display: shows colored text — green "open", gray "draft", red "closed"

### Edge Cases

- [ ] Terminal resize while form is open: Layout recalculates, textarea height adjusts, field focus and content preserved
- [ ] Terminal resize while select overlay is open: Overlay repositions; selection state preserved
- [ ] Save during network disconnect: Error banner with retry hint
- [ ] 403 on save (permission revoked): "Permission denied" error shown
- [ ] 404 on save (landing deleted): "Landing request not found" error shown
- [ ] 409 on save (concurrent edit): "Modified by another user" with reload option
- [ ] Empty title prevents submission with client-side validation
- [ ] Whitespace-only title treated as invalid
- [ ] Editing a merged landing request: Form does not open; status bar message shown
- [ ] Editing a closed landing request: Form opens normally; state can be changed to "open"
- [ ] Bookmarks API returns empty: Selector shows "No bookmarks available"
- [ ] Rapid Tab presses processed sequentially
- [ ] Body textarea shows raw markdown (not rendered)
- [ ] Unicode and emoji in title and body handled correctly
- [ ] Invalid state transition: 422 error shown inline

## Design

### Layout Structure

The edit form uses a vertical flexbox layout filling the entire content area. At standard (120×40) size:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Landings > #12 > Edit   │
├──────────────────────────────────────────────────────────┤
│ ▸ Title:           [Update auth flow for SSO support   ] │
│                                                          │
│   Body:            ┌──────────────────────────────────┐  │
│                    │ This landing updates the auth     │  │
│                    │ flow to support SSO providers.    │  │
│                    │ Changes include:                  │  │
│                    │ - New SSO handler                 │  │
│                    │ - Updated login screen            │  │
│                    └──────────────────────────────────┘  │
│                                                          │
│   Target Bookmark: main                            [▼]  │
│   Source Bookmark:  feature/sso-auth                [▼]  │
│   State:           ● open                          [▼]  │
│                                                          │
│   ─── Info (read-only) ──────────────────────────────── │
│   Changes:         3 changes (abc123, def456, ghi789)    │
│   Conflict Status: ✓ clean                               │
│                                                          │
│                              [Save]  [Cancel]            │
├──────────────────────────────────────────────────────────┤
│ Status: Tab:next Ctrl+S:save Esc:cancel ?:help           │
└──────────────────────────────────────────────────────────┘
```

At minimum (80×24), abbreviated field labels, 5-line textarea, compact layout. Read-only info collapses to single line ("3 changes · ✓ clean").

### Component Tree

Uses OpenTUI components: `<box>` for layout, `<input>` for title, `<input multiline>` wrapped in `<scrollbox>` for body, `<text>` for metadata display, `<select>` inside modal overlays for bookmark/state selection.

Focused field indicated by `▸` prefix and primary (ANSI 33) border color. Unfocused fields use border color (ANSI 240). Error states use red (ANSI 196) borders. State text uses semantic colors: green (ANSI 34) for open, gray (ANSI 245) for draft, red (ANSI 196) for closed. Discard confirmation uses warning (ANSI 178) border.

Select overlays render as centered `<box position="absolute">` modals. Bookmark overlays use 60% width/height. State overlay uses 40% width/30% height.

### Keybinding Reference

| Key | Context | Action |
|-----|---------|--------|
| `Tab` | Form (no overlay) | Next field |
| `Shift+Tab` | Form (no overlay) | Previous field |
| `Ctrl+S` | Form (no overlay) | Submit |
| `Enter` | Metadata field | Open select overlay |
| `Enter` | Save button | Submit |
| `Enter` | Cancel button | Cancel flow |
| `Esc` | Overlay open | Close overlay |
| `Esc` | Form (dirty) | Show discard dialog |
| `Esc` | Form (clean) | Pop screen |
| `j`/`k` | Select overlay | Navigate options |
| `/` | Select overlay | Focus filter input |
| `Enter` | Select overlay | Confirm and close |
| `y` | Discard dialog | Confirm discard |
| `n`/`Esc` | Discard dialog | Return to form |
| `R` | After save error | Retry save |
| `?` | Any (no overlay) | Help overlay |
| `:` | Any (no input focused) | Command palette |

### Responsive Column Layout

| Breakpoint | Textarea Height | Field Label Width | Bookmark Truncation |
|------------|----------------|-------------------|---------------------|
| 80×24 | 5 lines | 8ch (abbreviated) | 25ch |
| 120×40 | 12 lines | 18ch (full) | 50ch |
| 200×60+ | 20 lines | 18ch (full) | unlimited |

### Data Hooks

- `useLanding(owner, repo, number)` — Pre-populate form fields with current landing request data
- `useUpdateLanding(owner, repo, number)` — Submit PATCH request with only modified fields
- `useBookmarks(owner, repo)` — Repository bookmarks for target/source bookmark select overlays
- `useTerminalDimensions()` — Current terminal size for responsive layout
- `useOnResize(callback)` — Trigger re-layout on resize
- `useKeyboard(handler)` — Form navigation and shortcut registration

### Navigation Context

Pushed from landing detail view (`e`), landing list (`e` on focused row), or command palette (`:edit landing`). On save/cancel, pops and invalidates the `useLanding()` cache so the parent screen reflects updates. Also invalidates `useLandings()` list cache.

### State Transition Rules

| Current State | Available Transitions |
|---------------|----------------------|
| open | draft, closed |
| draft | open, closed |
| closed | open |
| merged | (form cannot open) |

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous | Cannot access. Pressing `e` is a no-op |
| Authenticated (no repo access) | 403 shown as "Permission denied" |
| Read-only collaborator | Cannot access. Status bar shows "Permission denied: cannot edit this landing request" for 3 seconds |
| Write collaborator | Full access to edit all fields |
| Landing request author | Full access to edit their own landing request |
| Admin | Full access to edit all landing request fields |
| Repository owner | Full access to edit all landing request fields |
| Organization owner | Full access to edit all landing request fields in org repositories |

### Token Handling

- Auth via stored token from `codeplane auth login` or `CODEPLANE_TOKEN` env var
- Bearer token in Authorization header for all requests
- 401 on save shows "Session expired. Run `codeplane auth login` to re-authenticate."
- No OAuth browser flow from TUI
- Token presence checked before form opens; missing token shows auth prompt

### Rate Limiting

- PATCH endpoint subject to standard API rate limit (60 req/min per user)
- 429 shows "Rate limit exceeded. Try again in {retry-after} seconds."
- Metadata loading (bookmarks) fetched on form open and cached for session
- No automatic retry on rate limit — user must press `R`

### Input Sanitization

- Title and body sent as-is; server performs sanitization
- No client-side HTML stripping (terminal has no HTML interpreter)
- XSS not applicable in terminal context
- Target bookmark and source bookmark values come from select overlays with server-provided options (no free-text injection)

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing.edit_form.opened` | Form pushed | `repo_owner`, `repo_name`, `landing_number`, `entry_point` (detail/list/palette), `terminal_width`, `terminal_height`, `current_state` |
| `tui.landing.edit_form.saved` | Successful PATCH | `repo_owner`, `repo_name`, `landing_number`, `fields_changed[]`, `duration_ms`, `title_changed`, `body_changed`, `target_bookmark_changed`, `source_bookmark_changed`, `state_changed`, `new_state` |
| `tui.landing.edit_form.save_failed` | PATCH fails | `repo_owner`, `repo_name`, `landing_number`, `error_code`, `error_message`, `fields_changed[]`, `duration_ms` |
| `tui.landing.edit_form.cancelled` | User cancels | `repo_owner`, `repo_name`, `landing_number`, `had_changes`, `fields_modified[]`, `duration_ms` |
| `tui.landing.edit_form.discard_confirmed` | Discard confirmed | `repo_owner`, `repo_name`, `landing_number`, `fields_modified[]`, `duration_ms` |
| `tui.landing.edit_form.discard_aborted` | Discard aborted | `repo_owner`, `repo_name`, `landing_number` |
| `tui.landing.edit_form.bookmark_overlay.opened` | Bookmark overlay open | `overlay_type` (target/source), `available_bookmarks_count` |
| `tui.landing.edit_form.state_overlay.opened` | State overlay open | `current_state`, `available_transitions_count` |
| `tui.landing.edit_form.validation_error` | Validation blocks submit | `field`, `error` |
| `tui.landing.edit_form.blocked_merged` | Edit attempted on merged LR | `repo_owner`, `repo_name`, `landing_number` |

### Success Indicators

- Save completion rate: >90% of opened forms result in successful save
- Time to save: <10s median for title-only edits, <45s for multi-field edits
- Error recovery rate: >80% of failures result in successful retry
- Discard rate: <15% of forms with changes are discarded
- Feature adoption: ratio of `edit_form.opened` to `landing_detail.viewed`
- State change frequency: ratio of state-changing edits to total edits
- Bookmark change frequency: how often target bookmark is re-targeted

## Observability

### Logging

| Level | Event | Details |
|-------|-------|---------|
| `info` | Form opened | `landing_number`, `entry_point`, `terminal_dimensions`, `current_state` |
| `info` | Save submitted | `landing_number`, `fields_changed`, `payload_size_bytes` |
| `info` | Save succeeded | `landing_number`, `response_time_ms` |
| `warn` | Save failed (4xx) | `landing_number`, `status_code`, `error_body` |
| `error` | Save failed (5xx) | `landing_number`, `status_code`, `error_body`, `request_id` |
| `warn` | Token expired (401) | `landing_number` |
| `warn` | Rate limited (429) | `landing_number`, `retry_after` |
| `debug` | Field focus changed | `from_field`, `to_field` |
| `debug` | Overlay opened/closed | `overlay_type`, `action` |
| `debug` | Dirty state changed | `is_dirty`, `modified_fields` |
| `warn` | Bookmarks fetch failed | `status_code`, `error` |
| `info` | Discard confirmed | `landing_number`, `modified_fields` |
| `debug` | Terminal resize during form | `old_dimensions`, `new_dimensions` |
| `info` | Blocked edit on merged LR | `landing_number` |
| `debug` | State transition selected | `from_state`, `to_state` |

### Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Network timeout | Error banner "Request timed out" with retry hint | Press `R` to retry |
| 401 Unauthorized | "Session expired. Run `codeplane auth login` to re-authenticate." | Re-authenticate via CLI |
| 403 Forbidden | "Permission denied" error message | Exit form with `Esc` |
| 404 Not Found | "Landing request not found" error message | Pop form with `Esc` |
| 409 Conflict | "Modified by another user" with reload option | `R` reloads fresh data, `Esc` discards |
| 422 Validation | Server validation message shown, first errored field focused | Correct and resubmit |
| 429 Rate Limited | "Rate limit exceeded. Try again in {retry-after} seconds." | Wait and press `R` |
| 500+ Server Error | "Server error" with request ID if available | Press `R` to retry |
| Bookmarks API failure | Target/Source bookmark fields disabled, other fields functional | Edit other fields; `R` retries bookmark fetch |
| Resize below 80×24 | "Terminal too small" message; form state preserved | Resize terminal back |
| Terminal disconnect during save | Server completes PATCH atomically; no cleanup needed | Relaunch TUI |
| SSE disconnect during form | No impact (edit form does not use SSE) | SSE auto-reconnects |

### Failure Modes

- API updates atomically; no partial save state possible
- 409 on concurrent edit; TUI offers reload with latest data
- Minimal memory footprint; no growth during long sessions
- Form state survives terminal resize events but not TUI restart

### Health Signals

- Form render time: <100ms from `e` press to fully populated form
- Bookmark overlay load: <500ms for bookmark list to appear
- Save round-trip: <2s for PATCH request to complete
- Resize re-layout: <50ms

## Verification

### Terminal Snapshot Tests

- [ ] `TUI_LANDING_EDIT_FORM — renders edit form at 120x40 with all fields pre-populated`
- [ ] `TUI_LANDING_EDIT_FORM — renders edit form at 80x24 minimum size with abbreviated labels`
- [ ] `TUI_LANDING_EDIT_FORM — renders edit form at 200x60 large size with expanded textarea`
- [ ] `TUI_LANDING_EDIT_FORM — renders focused title field with primary color border`
- [ ] `TUI_LANDING_EDIT_FORM — renders focused body textarea after Tab`
- [ ] `TUI_LANDING_EDIT_FORM — renders focused target bookmark field`
- [ ] `TUI_LANDING_EDIT_FORM — renders focused source bookmark field`
- [ ] `TUI_LANDING_EDIT_FORM — renders focused state field`
- [ ] `TUI_LANDING_EDIT_FORM — renders target bookmark select overlay`
- [ ] `TUI_LANDING_EDIT_FORM — renders source bookmark select overlay with None option`
- [ ] `TUI_LANDING_EDIT_FORM — renders state select overlay with valid transitions from open`
- [ ] `TUI_LANDING_EDIT_FORM — renders state select overlay with valid transitions from draft`
- [ ] `TUI_LANDING_EDIT_FORM — renders state select overlay with valid transitions from closed`
- [ ] `TUI_LANDING_EDIT_FORM — renders discard confirmation dialog`
- [ ] `TUI_LANDING_EDIT_FORM — renders error banner on save failure`
- [ ] `TUI_LANDING_EDIT_FORM — renders title validation error for empty title`
- [ ] `TUI_LANDING_EDIT_FORM — renders saving state with disabled inputs`
- [ ] `TUI_LANDING_EDIT_FORM — renders breadcrumb correctly`
- [ ] `TUI_LANDING_EDIT_FORM — renders with empty source bookmark as "None"`
- [ ] `TUI_LANDING_EDIT_FORM — renders read-only info section with change stack`
- [ ] `TUI_LANDING_EDIT_FORM — renders state colors correctly (green open, gray draft, red closed)`
- [ ] `TUI_LANDING_EDIT_FORM — renders conflict status indicator in info section`

### Keyboard Interaction Tests

- [ ] `TUI_LANDING_EDIT_FORM — Tab cycles through all form fields in order`
- [ ] `TUI_LANDING_EDIT_FORM — Shift+Tab cycles backward through fields`
- [ ] `TUI_LANDING_EDIT_FORM — Tab wraps from Cancel back to Title`
- [ ] `TUI_LANDING_EDIT_FORM — Shift+Tab wraps from Title to Cancel`
- [ ] `TUI_LANDING_EDIT_FORM — Ctrl+S from title field submits form`
- [ ] `TUI_LANDING_EDIT_FORM — Ctrl+S from body field submits form`
- [ ] `TUI_LANDING_EDIT_FORM — Ctrl+S from bookmark field submits form`
- [ ] `TUI_LANDING_EDIT_FORM — Ctrl+S is no-op when select overlay is open`
- [ ] `TUI_LANDING_EDIT_FORM — Enter on target bookmark opens overlay`
- [ ] `TUI_LANDING_EDIT_FORM — Enter on source bookmark opens overlay`
- [ ] `TUI_LANDING_EDIT_FORM — Enter on state opens overlay`
- [ ] `TUI_LANDING_EDIT_FORM — j/k navigates within bookmark select overlay`
- [ ] `TUI_LANDING_EDIT_FORM — / in bookmark overlay focuses filter input`
- [ ] `TUI_LANDING_EDIT_FORM — Enter in bookmark overlay confirms and closes`
- [ ] `TUI_LANDING_EDIT_FORM — Esc in bookmark overlay closes without changes`
- [ ] `TUI_LANDING_EDIT_FORM — j/k navigates within state select overlay`
- [ ] `TUI_LANDING_EDIT_FORM — Enter in state overlay confirms transition`
- [ ] `TUI_LANDING_EDIT_FORM — Esc in state overlay closes without changes`
- [ ] `TUI_LANDING_EDIT_FORM — Esc with no changes pops screen immediately`
- [ ] `TUI_LANDING_EDIT_FORM — Esc with changes shows discard dialog`
- [ ] `TUI_LANDING_EDIT_FORM — y in discard dialog discards and pops`
- [ ] `TUI_LANDING_EDIT_FORM — n in discard dialog returns to form`
- [ ] `TUI_LANDING_EDIT_FORM — Esc in discard dialog returns to form`
- [ ] `TUI_LANDING_EDIT_FORM — Enter on Save button submits form`
- [ ] `TUI_LANDING_EDIT_FORM — Enter on Cancel button triggers cancel flow`
- [ ] `TUI_LANDING_EDIT_FORM — R after save error retries`
- [ ] `TUI_LANDING_EDIT_FORM — only modified fields included in PATCH payload`
- [ ] `TUI_LANDING_EDIT_FORM — empty title prevents submission`
- [ ] `TUI_LANDING_EDIT_FORM — whitespace-only title prevents submission`
- [ ] `TUI_LANDING_EDIT_FORM — double Ctrl+S during submission is no-op`
- [ ] `TUI_LANDING_EDIT_FORM — body textarea Enter inserts newline (does not submit)`

### Responsive Resize Tests

- [ ] `TUI_LANDING_EDIT_FORM — resize from 120x40 to 80x24 preserves form state`
- [ ] `TUI_LANDING_EDIT_FORM — resize from 80x24 to 200x60 expands layout`
- [ ] `TUI_LANDING_EDIT_FORM — resize during bookmark select overlay repositions overlay`
- [ ] `TUI_LANDING_EDIT_FORM — resize during state select overlay repositions overlay`
- [ ] `TUI_LANDING_EDIT_FORM — resize below 80x24 shows too-small message`
- [ ] `TUI_LANDING_EDIT_FORM — resize back above 80x24 restores form`
- [ ] `TUI_LANDING_EDIT_FORM — textarea height adjusts on resize`

### Error Handling Tests

- [ ] `TUI_LANDING_EDIT_FORM — 403 on save shows permission error`
- [ ] `TUI_LANDING_EDIT_FORM — 404 on save shows not-found error`
- [ ] `TUI_LANDING_EDIT_FORM — 401 on save shows auth error`
- [ ] `TUI_LANDING_EDIT_FORM — 409 on save shows conflict error with reload option`
- [ ] `TUI_LANDING_EDIT_FORM — 422 on save shows validation error and focuses errored field`
- [ ] `TUI_LANDING_EDIT_FORM — 429 on save shows rate limit error with countdown`
- [ ] `TUI_LANDING_EDIT_FORM — 500 on save shows server error with retry hint`
- [ ] `TUI_LANDING_EDIT_FORM — bookmarks API failure disables bookmark fields gracefully`
- [ ] `TUI_LANDING_EDIT_FORM — permission check prevents form from opening on read-only repo`
- [ ] `TUI_LANDING_EDIT_FORM — edit blocked on merged landing request`
- [ ] `TUI_LANDING_EDIT_FORM — successful save pops form and updates landing data`

### Integration Tests

- [ ] `TUI_LANDING_EDIT_FORM — e2e edit title flow`
- [ ] `TUI_LANDING_EDIT_FORM — e2e edit body flow`
- [ ] `TUI_LANDING_EDIT_FORM — e2e change target bookmark flow`
- [ ] `TUI_LANDING_EDIT_FORM — e2e change source bookmark flow`
- [ ] `TUI_LANDING_EDIT_FORM — e2e clear source bookmark flow`
- [ ] `TUI_LANDING_EDIT_FORM — e2e change state from open to draft`
- [ ] `TUI_LANDING_EDIT_FORM — e2e change state from open to closed`
- [ ] `TUI_LANDING_EDIT_FORM — e2e change state from closed to open (reopen)`
- [ ] `TUI_LANDING_EDIT_FORM — e2e change state from draft to open`
- [ ] `TUI_LANDING_EDIT_FORM — e2e cancel without changes`
- [ ] `TUI_LANDING_EDIT_FORM — e2e cancel with changes and discard`
- [ ] `TUI_LANDING_EDIT_FORM — e2e cancel with changes and abort discard`
- [ ] `TUI_LANDING_EDIT_FORM — e2e edit from landing list`
- [ ] `TUI_LANDING_EDIT_FORM — e2e edit from landing detail`
- [ ] `TUI_LANDING_EDIT_FORM — e2e multi-field edit (title + target bookmark + state)`
- [ ] `TUI_LANDING_EDIT_FORM — e2e title-only quick edit flow (e → type → Ctrl+S)`
