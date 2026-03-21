# TUI_ISSUE_EDIT_FORM

Specification for TUI_ISSUE_EDIT_FORM.

## High-Level User POV

The Issue Edit Form is a full-screen form overlay in the Codeplane TUI that allows a developer to modify an existing issue's metadata directly from the terminal. It is the primary mechanism for updating an issue's title, body, labels, assignees, and milestone without leaving the keyboard-driven terminal workflow. The form is accessed from the issue detail view by pressing `e` (edit), or from the issue list by pressing `e` while an issue is focused. It can also be triggered via the command palette with `:edit issue` when a repository context is active and an issue is selected.

When the edit form opens, it pushes onto the navigation stack and the breadcrumb updates to show "Dashboard > owner/repo > Issues > #42 > Edit". The form is pre-populated with the issue's current values: the title field contains the existing title, the body field contains the existing body text, the label selector shows the currently attached labels as selected, the assignee selector shows the currently assigned users, and the milestone selector shows the current milestone (or "None" if unset).

The form layout is a vertical stack of labeled fields. The title field is a single-line `<input>` at the top, always visible and focused by default when the form opens. Below it is the body field, a multi-line `<textarea>` that expands to consume available vertical space. The textarea supports free-form markdown content and scrolls internally when content exceeds the visible height. Below the body are the metadata selectors: labels, assignees, and milestone. Each renders as a compact display showing the current value(s), and pressing `Enter` on a focused metadata field opens a `<select>` overlay for modification.

Navigation between form fields uses `Tab` (forward) and `Shift+Tab` (backward). The field order is: Title → Body → Labels → Assignees → Milestone → Save → Cancel. The focused field is visually indicated with a `primary` color border highlight and a `▸` indicator in the left margin. Unfocused fields show a `border` color border.

The labels field displays currently selected labels as color-coded badges inline. Pressing `Enter` on the labels field opens a multi-select overlay listing all labels defined for the repository. Labels that are already attached to the issue appear pre-selected with a `✓` prefix. The user navigates the overlay with `j`/`k`, toggles selection with `Space`, and confirms with `Enter`. The overlay closes and the updated label set is reflected inline.

The assignees field displays currently assigned usernames inline. Pressing `Enter` opens a multi-select overlay with all repository collaborators, plus an "Unassigned" option. The current assignee(s) appear pre-selected. Selection works identically to the label overlay.

The milestone field shows the current milestone title or "None". Pressing `Enter` opens a single-select overlay listing all open milestones for the repository, plus a "None" option to clear the milestone.

Saving is triggered by pressing `Ctrl+S` from anywhere in the form, or by pressing `Enter` on the "Save" button. The form submits a `PATCH /api/repos/:owner/:repo/issues/:number` request via the `useUpdateIssue()` hook from `@codeplane/ui-core`. The request body includes only the fields that have been modified — unchanged fields are omitted from the payload. During submission, the "Save" button text changes to "Saving…" and all form inputs are disabled. On success, the form pops from the navigation stack and returns to the issue detail view, which reflects the updated issue data. On failure, the form remains open, inputs are re-enabled, and a red error message appears at the top of the form.

Cancellation is triggered by pressing `Esc` from any field (when no overlay is open) or by pressing `Enter` on the "Cancel" button. If the form has unsaved changes, a confirmation dialog appears: "Discard unsaved changes? [y/N]". If there are no changes, `Esc` pops immediately without confirmation.

The form is optimized for the common edit workflow: press `e` on an issue, `Tab` to the field you want to change, make the edit, `Ctrl+S` to save. For title-only edits — the most common case — the user presses `e`, edits the title (which is already focused), and presses `Ctrl+S`. The entire operation takes seconds without reaching for a mouse.

At minimum terminal size (80×24), the form collapses to a single-column layout with each field spanning the full width. The body textarea height is reduced to 6 lines. Metadata selectors show abbreviated values. At standard size (120×40), the form has comfortable spacing, the textarea expands to 12+ lines, and metadata values are fully visible. At large size (200×60+), additional vertical padding is added and the textarea can display 20+ lines.

## Acceptance Criteria

### Definition of Done

- [ ] The Issue Edit Form renders as a full-screen view occupying the entire content area between header and status bars
- [ ] The form is reachable by pressing `e` from the issue detail view, `e` from the issue list (focused row), or `:edit issue` from the command palette
- [ ] The breadcrumb reads "Dashboard > owner/repo > Issues > #N > Edit"
- [ ] All fields are pre-populated with the current issue data fetched via `useIssue()` from `@codeplane/ui-core`
- [ ] The title field is focused by default when the form opens
- [ ] Tab order cycles through: Title → Body → Labels → Assignees → Milestone → Save → Cancel
- [ ] `Ctrl+S` submits the form from any field (except when a select overlay is open)
- [ ] Only modified fields are included in the PATCH request payload
- [ ] The form calls `PATCH /api/repos/:owner/:repo/issues/:number` via `useUpdateIssue()` hook
- [ ] On successful save, the form pops from the navigation stack and returns to the previous screen with updated data
- [ ] On save failure, the form remains open with a red error message at the top, inputs re-enabled
- [ ] `Esc` triggers cancellation: if changes exist, show confirmation dialog; if no changes, pop immediately
- [ ] The confirmation dialog renders "Discard unsaved changes? [y/N]" centered in a modal overlay
- [ ] A loading state ("Saving…") is shown on the Save button during submission, and all inputs are disabled

### Keyboard Interactions

- [ ] `Tab`: Move focus to the next form field
- [ ] `Shift+Tab`: Move focus to the previous form field
- [ ] `Enter`: When on a metadata field (labels/assignees/milestone), open the select overlay. When on Save button, submit. When on Cancel button, trigger cancel flow
- [ ] `Ctrl+S`: Submit the form from any field position
- [ ] `Esc`: If a select overlay is open, close it. If no overlay is open, trigger cancellation (with dirty-check)
- [ ] `j`/`k` and `Up`/`Down`: Within a select overlay, navigate options. Within the body textarea, scroll/navigate lines
- [ ] `Space`: Within a select overlay, toggle the focused option's selection
- [ ] `y`: In the discard confirmation dialog, confirm discard and pop screen
- [ ] `n` / `N` / `Esc`: In the discard confirmation dialog, return to form
- [ ] `Ctrl+C`: Quit TUI (global binding, overrides form)

### Responsive Behavior

- [ ] Below 80×24: "Terminal too small" handled by the router
- [ ] 80×24 – 119×39 (minimum): Single-column layout. Title input spans full width. Body textarea is 6 lines tall. Metadata selectors show abbreviated values. Field labels abbreviated ("Lbl:", "Asgn:", "MS:")
- [ ] 120×40 – 199×59 (standard): Title input spans full width. Body textarea is 12 lines tall. Full field labels. Labels display up to 5 badges inline before "+N more"
- [ ] 200×60+ (large): Title input spans 80% width. Body textarea is 20 lines tall. All label badges visible up to 10

### Truncation and Boundary Constraints

- [ ] Title: maximum 255 characters; input scrolls horizontally
- [ ] Body: maximum 65,535 characters; textarea scrolls vertically
- [ ] Label names in badges: truncated at 15 characters with `…`
- [ ] Label badge display: at minimum, comma-separated names at 30ch total; at standard, up to 5 badges then "+N more"; at large, up to 10 badges
- [ ] Assignee display: comma-separated usernames truncated at 25ch at minimum, full at standard+
- [ ] Milestone display: truncated at 20ch with `…` at minimum, full at standard+
- [ ] Error messages: truncated at terminal width minus 4 characters with `…`
- [ ] Select overlay: maximum 20 visible options with scrolling
- [ ] Field labels: minimum 5ch width, right-aligned with `:` separator

### Edge Cases

- [ ] Terminal resize while form is open: Layout recalculates, textarea height adjusts, field focus and content preserved
- [ ] Terminal resize while select overlay is open: Overlay repositions; selection state preserved
- [ ] Save during network disconnect: Error banner with retry hint
- [ ] 403 on save (permission revoked): "Permission denied" error shown
- [ ] 404 on save (issue deleted): "Issue not found" error shown
- [ ] 409 on save (concurrent edit): Conflict error with reload option
- [ ] Empty title prevents submission with client-side validation
- [ ] Whitespace-only title treated as invalid
- [ ] Editing a closed issue: Form opens normally; state not editable here
- [ ] Labels/assignees/milestones API returns empty: Select overlay shows appropriate empty message
- [ ] Rapid Tab presses processed sequentially
- [ ] Body textarea shows raw markdown (not rendered)
- [ ] Unicode and emoji in title handled correctly

## Design

### Layout Structure

The edit form uses a vertical flexbox layout filling the entire content area. At standard (120×40) size:

```
┌──────────────────────────────────────────────────────────┐
│ Header: Dashboard > owner/repo > Issues > #42 > Edit     │
├──────────────────────────────────────────────────────────┤
│ ▸ Title:  [Fix login timeout on slow networks         ] │
│                                                          │
│   Body:   ┌──────────────────────────────────────────┐  │
│           │ When users are on slow networks, the      │  │
│           │ login request times out after 5 seconds.  │  │
│           │ ...                                       │  │
│           └──────────────────────────────────────────┘  │
│                                                          │
│   Labels:    [bug] [network] [ux]                        │
│   Assignees: alice, bob                                  │
│   Milestone: v2.1 Release                                │
│                                                          │
│                              [Save]  [Cancel]            │
├──────────────────────────────────────────────────────────┤
│ Status: Tab:next Ctrl+S:save Esc:cancel ?:help           │
└──────────────────────────────────────────────────────────┘
```

At minimum (80×24), abbreviated field labels, 6-line textarea, and compact layout.

### Component Tree

Uses OpenTUI components: `<box>` for layout, `<input>` for title, `<textarea>` for body, `<text>` for labels/metadata display, `<select>` inside modal overlays for label/assignee/milestone selection, and `<scrollbox>` for the form body.

Focused field indicated by `▸` prefix and primary (ANSI 33) border color. Unfocused fields use border color (ANSI 240). Error states use red (ANSI 196) borders. Discard confirmation uses a centered `<box position="absolute">` modal overlay with warning (ANSI 178) border.

Select overlays render as 60% width/height centered modals with primary border, containing a `<select>` component. Label overlay supports multi-select, milestone overlay supports single-select.

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
| `Space` | Select overlay | Toggle selection |
| `Enter` | Select overlay | Confirm and close |
| `y` | Discard dialog | Confirm discard |
| `n`/`Esc` | Discard dialog | Return to form |
| `R` | After save error | Retry save |

### Responsive Column Layout

| Breakpoint | Textarea Height | Max Label Badges | Field Label Width |
|------------|----------------|------------------|-------------------|
| 80×24 | 6 lines | Comma text, 30ch | 7ch (abbreviated) |
| 120×40 | 12 lines | 5 badges + "+N" | 12ch (full) |
| 200×60+ | 20 lines | 10 badges | 12ch (full) |

### Data Hooks

- `useIssue(owner, repo, number)` — Pre-populate form fields
- `useUpdateIssue(owner, repo, number)` — Submit PATCH request with only modified fields
- `useLabels(owner, repo)` — Repository labels for select overlay
- `useCollaborators(owner, repo)` — Collaborators for assignee overlay
- `useMilestones(owner, repo)` — Open milestones for milestone overlay
- `useTerminalDimensions()` — Current terminal size for responsive layout
- `useOnResize(callback)` — Trigger re-layout on resize
- `useKeyboard(handler)` — Form navigation and shortcut registration

### Navigation Context

Pushed from issue detail view (`e`), issue list (`e` on focused row), or command palette (`:edit issue`). On save/cancel, pops and invalidates the `useIssue()` cache so the parent screen reflects updates.

## Permissions & Security

### Authorization Roles

| Role | Access |
|------|--------|
| Anonymous | Cannot access. Pressing `e` is no-op |
| Authenticated (no repo access) | 403 shown as "Permission denied" |
| Read-only collaborator | Cannot access. Status bar shows "Permission denied: cannot edit this issue" for 3 seconds |
| Write collaborator | Full access to edit all fields |
| Admin | Full access to edit all fields |
| Repository owner | Full access to edit all fields |
| Organization owner | Full access to edit all fields in org repositories |

### Token Handling

- Auth via stored token from `codeplane auth login` or `CODEPLANE_TOKEN` env var
- Bearer token in Authorization header for all requests
- 401 on save shows "Session expired. Run `codeplane auth login` to re-authenticate."
- No OAuth browser flow from TUI

### Rate Limiting

- PATCH endpoint subject to standard API rate limit (60 req/min per user)
- 429 shows "Rate limit exceeded. Try again in {retry-after} seconds."
- Metadata loading (labels, collaborators, milestones) fetched concurrently on form open, cached for session
- No automatic retry on rate limit

### Input Sanitization

- Title and body sent as-is; server performs sanitization
- No client-side HTML stripping (terminal has no HTML interpreter)
- XSS not applicable in terminal context

## Telemetry & Product Analytics

### Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issue.edit_form.opened` | Form pushed | `repo_owner`, `repo_name`, `issue_number`, `entry_point`, `terminal_width`, `terminal_height` |
| `tui.issue.edit_form.saved` | Successful PATCH | `repo_owner`, `repo_name`, `issue_number`, `fields_changed[]`, `duration_ms`, `title_changed`, `body_changed`, `labels_changed`, `assignees_changed`, `milestone_changed` |
| `tui.issue.edit_form.save_failed` | PATCH fails | `repo_owner`, `repo_name`, `issue_number`, `error_code`, `error_message`, `fields_changed`, `duration_ms` |
| `tui.issue.edit_form.cancelled` | User cancels | `repo_owner`, `repo_name`, `issue_number`, `had_changes`, `fields_modified[]`, `duration_ms` |
| `tui.issue.edit_form.discard_confirmed` | Discard confirmed | `repo_owner`, `repo_name`, `issue_number`, `fields_modified`, `duration_ms` |
| `tui.issue.edit_form.discard_aborted` | Discard aborted | `repo_owner`, `repo_name`, `issue_number` |
| `tui.issue.edit_form.label_overlay.opened` | Label overlay open | `available_labels_count` |
| `tui.issue.edit_form.assignee_overlay.opened` | Assignee overlay open | `available_collaborators_count` |
| `tui.issue.edit_form.milestone_overlay.opened` | Milestone overlay open | `available_milestones_count` |
| `tui.issue.edit_form.validation_error` | Validation blocks submit | `field`, `error` |

### Success Indicators

- Save completion rate: >90% of opened forms result in successful save
- Time to save: <15s median for title-only edits, <60s for multi-field
- Error recovery rate: >80% of failures result in successful retry
- Discard rate: <15% of forms with changes are discarded
- Feature adoption: ratio of `edit_form.opened` to `issue_detail.viewed`

## Observability

### Logging

| Level | Event | Details |
|-------|-------|---------|
| `info` | Form opened | `issue_number`, `entry_point`, `terminal_dimensions` |
| `info` | Save submitted | `issue_number`, `fields_changed`, `payload_size_bytes` |
| `info` | Save succeeded | `issue_number`, `response_time_ms` |
| `warn` | Save failed (4xx) | `issue_number`, `status_code`, `error_body` |
| `error` | Save failed (5xx) | `issue_number`, `status_code`, `error_body`, `request_id` |
| `warn` | Token expired (401) | `issue_number` |
| `warn` | Rate limited (429) | `issue_number`, `retry_after` |
| `debug` | Field focus changed | `from_field`, `to_field` |
| `debug` | Overlay opened/closed | `overlay_type`, `action` |
| `debug` | Dirty state changed | `is_dirty`, `modified_fields` |
| `warn` | Metadata fetch failed | `resource`, `status_code`, `error` |
| `info` | Discard confirmed | `issue_number`, `modified_fields` |
| `debug` | Terminal resize during form | `old_dimensions`, `new_dimensions` |

### Error Cases

| Error | Behavior | Recovery |
|-------|----------|----------|
| Network timeout | Error banner with retry hint | Press `R` |
| 401 Unauthorized | "Session expired" message | Re-authenticate via CLI |
| 403 Forbidden | "Permission denied" message | Exit form |
| 404 Not Found | "Issue not found" message | Pop form |
| 409 Conflict | "Modified by another user" with reload option | `R` reloads, `Esc` discards |
| 422 Validation | Server message shown, field highlighted red | Correct and resubmit |
| 429 Rate Limited | Countdown message | Wait and retry |
| 500+ Server Error | "Server error" with request ID | Press `R` |
| Metadata API failure | Individual field disabled, others functional | Edit other fields |
| Resize below 80×24 | "Terminal too small"; form state preserved | Resize back |

### Failure Modes

- API updates atomically; no partial save state
- 409 on concurrent edit; TUI offers reload
- Minimal memory footprint; no growth during long sessions
- Terminal disconnect during save: server completes request; no cleanup needed

## Verification

### Terminal Snapshot Tests

- [ ] `TUI_ISSUE_EDIT_FORM — renders edit form at 120x40 with all fields pre-populated`
- [ ] `TUI_ISSUE_EDIT_FORM — renders edit form at 80x24 minimum size`
- [ ] `TUI_ISSUE_EDIT_FORM — renders edit form at 200x60 large size`
- [ ] `TUI_ISSUE_EDIT_FORM — renders focused title field with primary color border`
- [ ] `TUI_ISSUE_EDIT_FORM — renders focused body field after Tab`
- [ ] `TUI_ISSUE_EDIT_FORM — renders label select overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — renders assignee select overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — renders milestone select overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — renders discard confirmation dialog`
- [ ] `TUI_ISSUE_EDIT_FORM — renders error banner on save failure`
- [ ] `TUI_ISSUE_EDIT_FORM — renders title validation error for empty title`
- [ ] `TUI_ISSUE_EDIT_FORM — renders saving state`
- [ ] `TUI_ISSUE_EDIT_FORM — renders breadcrumb correctly`
- [ ] `TUI_ISSUE_EDIT_FORM — renders with no labels assigned`
- [ ] `TUI_ISSUE_EDIT_FORM — renders with no assignees`
- [ ] `TUI_ISSUE_EDIT_FORM — renders with no milestone`

### Keyboard Interaction Tests

- [ ] `TUI_ISSUE_EDIT_FORM — Tab cycles through all form fields in order`
- [ ] `TUI_ISSUE_EDIT_FORM — Shift+Tab cycles backward through fields`
- [ ] `TUI_ISSUE_EDIT_FORM — Ctrl+S from title field submits form`
- [ ] `TUI_ISSUE_EDIT_FORM — Ctrl+S from body field submits form`
- [ ] `TUI_ISSUE_EDIT_FORM — Enter on labels opens overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — Space in label overlay toggles selection`
- [ ] `TUI_ISSUE_EDIT_FORM — Enter in label overlay confirms and closes`
- [ ] `TUI_ISSUE_EDIT_FORM — Esc in label overlay closes without changes`
- [ ] `TUI_ISSUE_EDIT_FORM — Enter on assignees opens overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — Enter on milestone opens overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — Esc with no changes pops screen immediately`
- [ ] `TUI_ISSUE_EDIT_FORM — Esc with changes shows discard dialog`
- [ ] `TUI_ISSUE_EDIT_FORM — y in discard dialog discards and pops`
- [ ] `TUI_ISSUE_EDIT_FORM — n in discard dialog returns to form`
- [ ] `TUI_ISSUE_EDIT_FORM — Esc in discard dialog returns to form`
- [ ] `TUI_ISSUE_EDIT_FORM — Enter on Save button submits form`
- [ ] `TUI_ISSUE_EDIT_FORM — Enter on Cancel button triggers cancel flow`
- [ ] `TUI_ISSUE_EDIT_FORM — R after save error retries`
- [ ] `TUI_ISSUE_EDIT_FORM — j/k navigates within select overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — only modified fields included in PATCH payload`
- [ ] `TUI_ISSUE_EDIT_FORM — empty title prevents submission`
- [ ] `TUI_ISSUE_EDIT_FORM — whitespace-only title prevents submission`

### Responsive Resize Tests

- [ ] `TUI_ISSUE_EDIT_FORM — resize from 120x40 to 80x24 preserves form state`
- [ ] `TUI_ISSUE_EDIT_FORM — resize from 80x24 to 200x60 expands layout`
- [ ] `TUI_ISSUE_EDIT_FORM — resize during select overlay`
- [ ] `TUI_ISSUE_EDIT_FORM — resize below 80x24 shows too-small message`

### Error Handling Tests

- [ ] `TUI_ISSUE_EDIT_FORM — 403 on save shows permission error`
- [ ] `TUI_ISSUE_EDIT_FORM — 404 on save shows not-found error`
- [ ] `TUI_ISSUE_EDIT_FORM — 401 on save shows auth error`
- [ ] `TUI_ISSUE_EDIT_FORM — 429 on save shows rate limit error`
- [ ] `TUI_ISSUE_EDIT_FORM — labels API failure degrades gracefully`
- [ ] `TUI_ISSUE_EDIT_FORM — collaborators API failure degrades gracefully`
- [ ] `TUI_ISSUE_EDIT_FORM — milestones API failure degrades gracefully`
- [ ] `TUI_ISSUE_EDIT_FORM — permission check prevents form from opening`
- [ ] `TUI_ISSUE_EDIT_FORM — successful save pops form and updates issue data`

### Integration Tests

- [ ] `TUI_ISSUE_EDIT_FORM — e2e edit title flow`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e edit body flow`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e edit labels flow`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e edit assignees flow`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e edit milestone flow`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e cancel without changes`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e cancel with changes and discard`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e cancel with changes and abort discard`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e edit from issue list`
- [ ] `TUI_ISSUE_EDIT_FORM — e2e multi-field edit`
