# TUI_ISSUE_CREATE_FORM

Specification for TUI_ISSUE_CREATE_FORM.

## High-Level User POV

When a terminal user needs to file a new issue against a repository, they activate the issue create form from any screen that has repository context. The most common entry points are pressing `c` from the issue list screen, or using the command palette (`:`) and typing "create issue." Either action pushes a new screen onto the navigation stack titled "New Issue," and the breadcrumb updates to reflect the path — for example, `Dashboard > owner/repo > Issues > New Issue`.

The form occupies the full content area between the header bar and the status bar. At the top sits a single-line text input for the issue title, pre-focused so the user can start typing immediately. Below it is a multi-line text area for the issue body, which supports free-form markdown. The body area is wrapped in a scrollbox so the user can write longer descriptions without the form clipping. Beneath the body, three optional selector fields are stacked vertically: an assignees multi-select, a labels multi-select, and a milestone single-select. Each selector can be opened with `Enter`, navigated with `j`/`k`, toggled with `Space`, and confirmed with `Enter`. At the bottom of the form, two buttons — **Submit** and **Cancel** — sit side by side.

The user moves between form fields using `Tab` (forward) and `Shift+Tab` (backward). The status bar always shows a keybinding hint strip relevant to the currently focused field. Pressing `Ctrl+S` from anywhere in the form submits it. Pressing `Esc` cancels the form and pops the screen, returning the user to the previous view. If the form has unsaved content, an inline confirmation prompt appears: "Discard changes? (y/n)."

On submission, the form performs client-side validation — the title field must not be empty — and displays an inline error below the title input if validation fails, with focus returned to the title field. When the title is valid, the submit button text changes to "Creating…" and the form fields become non-interactive. On success, the TUI pops the form screen and navigates to the newly created issue's detail view. On server error, the form re-enables, an error message renders at the top of the form in red, and the user can correct their input and retry with `R` or `Ctrl+S`.

At minimum terminal size (80×24), the form collapses to show only the title input and body textarea with a minimal single-line summary for each selector. At standard size (120×40), all fields render with comfortable spacing and full labels. The form never requires horizontal scrolling.

## Acceptance Criteria

- **Title field is required.** Submitting with an empty or whitespace-only title must display an inline validation error and prevent the API call.
- **Title field maximum display length is 255 characters.** Characters beyond 255 are rejected at input time (input stops accepting characters).
- **Body field is optional.** An empty body submits as an empty string.
- **Body field supports multi-line input.** `Enter` inserts a newline in the body textarea; `Ctrl+S` submits the form (not `Enter` alone while in the body field).
- **Assignees selector loads repo collaborators on mount** and allows multi-selection. If no collaborators are returned, the selector shows "(no collaborators)" as disabled placeholder text.
- **Labels selector loads repo labels on mount** and allows multi-selection. Each label option displays the label name with its color rendered as a colored text prefix (●).
- **Milestone selector loads open milestones on mount** and allows single selection (or "None"). If no milestones exist, the selector shows "(no milestones)" as disabled placeholder text.
- **Tab order is deterministic:** Title → Body → Assignees → Labels → Milestone → Submit → Cancel.
- **`Ctrl+S` submits from any focused field.**
- **`Esc` triggers the discard confirmation if any field has been modified;** if no field has been modified, it pops immediately.
- **Optimistic navigation:** On successful creation, the TUI navigates to the new issue detail view (pushed onto the screen stack with the form screen replaced).
- **On API error (4xx, 5xx, network), the form re-enables and shows the error message in a red `<text>` element at the top of the form.**
- **On 401 error, the form shows "Session expired. Run `codeplane auth login` to re-authenticate." and does not retry.**
- **Form state is not persisted across screen pops.** Navigating away and returning starts a fresh form.
- **At 80×24 (minimum):** Selector fields collapse to a single-line summary showing the count of selected items. Body textarea height is reduced to 5 lines. Field labels are abbreviated (e.g., "Assign" instead of "Assignees").
- **At <80×24 (unsupported):** The form is not rendered; the "terminal too small" message is shown.
- **Rapid key input:** All keystrokes are buffered and processed in order; no keystrokes are dropped.
- **Terminal resize during form interaction:** Layout recalculates synchronously; focus position and form state are preserved.
- **No-color terminals (`NO_COLOR=1`):** Form renders without color; validation errors use bold or reverse video instead of red.
- **Scrollbox limits:** The body textarea scrollbox supports up to 10,000 lines of content without degrading performance.
- **Form does not make API calls until the user explicitly submits.** Loading selectors (labels, milestones, collaborators) is the only network activity on mount.
- **Double-submit prevention:** While a submission is in progress, additional `Ctrl+S` presses are ignored.
- **Server validation errors (422):** Field-level errors from the server are mapped to inline field errors and the first errored field is focused.

## Design

### Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Issues > New Issue   │ ● connected │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Title ────────────────────────────────────────────────┐ │
│  │ [text input, single line]                              │ │
│  └────────────────────────────────────────────────────────┘ │
│  ⚠ Title is required                     (if validation)    │
│                                                             │
│  ┌─ Description ──────────────────────────────────────────┐ │
│  │ <scrollbox>                                            │ │
│  │   [textarea, multi-line, markdown]                     │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  Assignees:  [multi-select dropdown]           ▸ 0 selected │
│  Labels:     [multi-select dropdown]           ▸ 0 selected │
│  Milestone:  [single-select dropdown]          ▸ None       │
│                                                             │
│  [ Submit ]   [ Cancel ]                                    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Tab:next field │ Ctrl+S:submit │ Esc:cancel     │ ?:help    │
└─────────────────────────────────────────────────────────────┘
```

### Component Tree (OpenTUI)

```jsx
<box flexDirection="column" width="100%" height="100%">
  {error && (
    <box paddingX={2}>
      <text color="error" bold>{error}</text>
    </box>
  )}

  <scrollbox flex={1} paddingX={2} paddingY={1}>
    <box flexDirection="column" gap={1}>
      <box flexDirection="column">
        <text bold>Title</text>
        <input value={title} onChange={setTitle} maxLength={255} placeholder="Issue title" focused={focusIndex === 0} />
        {titleError && <text color="error">⚠ {titleError}</text>}
      </box>

      <box flexDirection="column">
        <text bold>Description</text>
        <scrollbox height={bodyHeight}>
          <input multiline value={body} onChange={setBody} placeholder="Describe the issue (markdown supported)" focused={focusIndex === 1} />
        </scrollbox>
      </box>

      <box flexDirection="row" gap={2}>
        <text bold width={12}>Assignees</text>
        <select multiple options={collaborators} value={selectedAssignees} onChange={setSelectedAssignees} placeholder="Select assignees..." focused={focusIndex === 2} />
      </box>

      <box flexDirection="row" gap={2}>
        <text bold width={12}>Labels</text>
        <select multiple options={labelOptions} value={selectedLabels} onChange={setSelectedLabels} placeholder="Select labels..." focused={focusIndex === 3} />
      </box>

      <box flexDirection="row" gap={2}>
        <text bold width={12}>Milestone</text>
        <select options={milestoneOptions} value={selectedMilestone} onChange={setSelectedMilestone} placeholder="None" focused={focusIndex === 4} />
      </box>

      <box flexDirection="row" gap={2} marginTop={1}>
        <button focused={focusIndex === 5} onPress={handleSubmit}>{submitting ? "Creating…" : "Submit"}</button>
        <button focused={focusIndex === 6} onPress={handleCancel}>Cancel</button>
      </box>
    </box>
  </scrollbox>
</box>
```

### Keybindings

**Form-level:** `Tab` (next field), `Shift+Tab` (prev field), `Ctrl+S` (submit), `Esc` (cancel with confirmation if dirty), `?` (help overlay), `:` (command palette from non-input fields).

**Title input:** Printable chars (insert), `Backspace`/`Delete` (delete), `Left`/`Right` (cursor move), `Home`/`Ctrl+A` (start of line), `End`/`Ctrl+E` (end of line), `Ctrl+K` (kill to end), `Ctrl+U` (kill to start).

**Body textarea:** All title keys plus `Enter` (insert newline, does NOT submit), `Up`/`Down` (move between lines).

**Selectors (when open):** `Enter` (open/confirm), `j`/`Down` (next option), `k`/`Up` (prev option), `Space` (toggle selection in multi-select), `/` (filter options), `Esc` (close dropdown).

**Buttons:** `Enter`/`Space` (activate).

### Responsive Behavior

| Size | Body Height | Labels | Selectors | Gap |
|------|-------------|--------|-----------|-----|
| 80×24 | 5 lines | Abbreviated | Inline summary | 0 |
| 120×40 | 10 lines | Full | Overlay (8 items) | 1 line |
| 200×60 | 16 lines | Full | Overlay (12 items) | 1 line + padding |

Resize triggers synchronous re-layout via `useOnResize()`. Focus index and form values preserved.

### Data Hooks

| Hook | Purpose |
|------|---------|
| `useCreateIssue()` | Mutation for `POST /api/repos/:owner/:repo/issues`. Returns `{ mutate, isLoading, error }`. |
| `useLabels(owner, repo)` | Fetches repo labels for label selector. |
| `useMilestones(owner, repo, { state: "open" })` | Fetches open milestones. |
| `useCollaborators(owner, repo)` | Fetches repo collaborators for assignees. |
| `useKeyboard()` | Registers form-level keybinding handlers. |
| `useTerminalDimensions()` | Returns `{ columns, rows }` for responsive decisions. |
| `useOnResize()` | Triggers re-render on terminal resize. |

### Navigation Flow

1. Entry: `c` from issue list OR command palette "Create Issue".
2. Screen push: `IssueCreateForm` pushed onto navigation stack.
3. Success: Form screen replaced with new issue detail view.
4. Cancel: Form screen popped; user returns to previous screen.

## Permissions & Security

### Authorization

- **Required permission:** Write access to the repository. The API endpoint `POST /api/repos/:owner/:repo/issues` checks `requireWriteAccess()` server-side.
- **Read-only users** who navigate to the create form see the form rendered but receive a 403 error on submission. The error displays: "You do not have permission to create issues in this repository."
- **Unauthenticated users** (expired or missing token) receive a 401, triggering: "Session expired. Run `codeplane auth login` to re-authenticate."

### Token-based Auth

- The TUI reads the auth token from the CLI keychain (stored by `codeplane auth login`) or from `CODEPLANE_TOKEN` environment variable.
- Token attached as `Authorization: token <token>` on all API requests.
- No interactive login flow in the TUI. Auth failures require CLI re-authentication.

### Rate Limiting

- Issue creation is subject to server-side rate limiting (same limits as web UI and CLI).
- 429 Too Many Requests displays: "Rate limit exceeded. Please wait and try again." with `Retry-After` value if present.
- No auto-retry on 429.

### Input Sanitization

- Title and body sent as-is to the server. Server-side sanitization handles injection concerns.
- The TUI does not render HTML; markdown in the body field is plain text during editing.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.issue_create_form.opened` | Form screen pushed onto stack | `repo_owner`, `repo_name`, `entry_point` ("keybinding" \| "command_palette" \| "go_to"), `terminal_columns`, `terminal_rows` |
| `tui.issue_create_form.submitted` | User submits the form | `repo_owner`, `repo_name`, `has_body`, `assignee_count`, `label_count`, `has_milestone`, `title_length`, `body_length` |
| `tui.issue_create_form.succeeded` | API returns 2xx | `repo_owner`, `repo_name`, `issue_number`, `duration_ms` |
| `tui.issue_create_form.failed` | API returns non-2xx or network error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.issue_create_form.cancelled` | User cancels the form | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` |
| `tui.issue_create_form.validation_error` | Client-side validation fails | `repo_owner`, `repo_name`, `field`, `error_type` |

### Success Indicators

- **Completion rate:** % of `form.opened` → `form.succeeded`. Target: >70%.
- **Abandonment rate:** % of `form.opened` → `form.cancelled` with `was_dirty=true`. Target: <15%.
- **Error rate:** % of `form.submitted` → `form.failed`. Target: <2%.
- **Time to submit:** Median duration from open to success. Benchmark: <60s.
- **Field utilization:** % of submissions using assignees, labels, or milestones (tracks feature discovery).

## Observability

### Logging

| Level | Event | Details |
|-------|-------|---------|
| `debug` | Form mounted | `{ screen: "issue_create", repo: "owner/repo" }` |
| `debug` | Selector data loaded | `{ selector, count, duration_ms }` |
| `info` | Form submitted | `{ repo, title_length, has_body, assignee_count, label_count, has_milestone }` |
| `info` | Issue created | `{ repo, issue_number, duration_ms }` |
| `warn` | Selector data fetch failed | `{ selector, error_code, error_message }` |
| `error` | Issue creation failed | `{ repo, status_code, error_message, request_duration_ms }` |
| `error` | Auth failure | `{ repo, status_code: 401 }` |
| `debug` | Form cancelled | `{ was_dirty, fields_filled }` |

### Error Cases and Recovery

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout during submission | Fetch timeout or `AbortError` | "Request timed out. Press `R` to retry." Form re-enables with data preserved. |
| SSE disconnect while form is open | SSE context reports disconnection | Status bar updates. Form unaffected (uses REST, not SSE). |
| Terminal resize during submission | `useOnResize` fires while `submitting=true` | Layout recalculates. Submission continues. "Creating…" preserved. |
| Terminal resize below minimum | `columns < 80 \|\| rows < 24` | "Terminal too small" shown. Form state preserved; re-enlarging restores form. |
| Selector data fails to load | Fetch error | Selector shows "Failed to load (retry)". Other fields remain functional. |
| Auth token expired | 401 response | Auth error message. No retry. User re-authenticates via CLI. |
| Server 422 validation error | Response with field errors | Map to inline field errors. Focus first errored field. |
| Rapid double-submit | `Ctrl+S` while `submitting=true` | Ignored. Button shows "Creating…" |
| Content too large | 413 response | "Content too large. Please shorten the description." |

### Health Signals

- Form render time: <100ms from screen push to first interactive frame.
- Selector data load: <500ms per selector.
- Submission round-trip: <2000ms at p95.

## Verification

### Terminal Snapshot Tests

- `TUI_ISSUE_CREATE_FORM > renders empty form at 120x40` — Snapshot of initial form state at standard size. Title focused, all fields empty, Submit and Cancel visible.
- `TUI_ISSUE_CREATE_FORM > renders empty form at 80x24` — Minimum size. Abbreviated labels, reduced body height, collapsed selectors.
- `TUI_ISSUE_CREATE_FORM > renders empty form at 200x60` — Large size. Wider fields, more body lines, expanded padding.
- `TUI_ISSUE_CREATE_FORM > renders title validation error` — Error message "⚠ Title is required" visible below title input after empty submit.
- `TUI_ISSUE_CREATE_FORM > renders server error banner` — Red error banner at top after failed API call.
- `TUI_ISSUE_CREATE_FORM > renders submitting state` — Submit button shows "Creating…", fields dimmed.
- `TUI_ISSUE_CREATE_FORM > renders assignees selector expanded` — Assignees dropdown open with collaborator list.
- `TUI_ISSUE_CREATE_FORM > renders labels selector with colored indicators` — Labels selector with color dot prefixes.
- `TUI_ISSUE_CREATE_FORM > renders milestone selector expanded` — Milestone selector with open milestones and "None" option.
- `TUI_ISSUE_CREATE_FORM > renders discard confirmation` — Inline "Discard changes? (y/n)" prompt.
- `TUI_ISSUE_CREATE_FORM > renders breadcrumb correctly` — Breadcrumb shows "Dashboard > owner/repo > Issues > New Issue".
- `TUI_ISSUE_CREATE_FORM > renders help overlay` — Help overlay showing all form keybindings.

### Keyboard Interaction Tests

- `TUI_ISSUE_CREATE_FORM > Tab cycles through form fields` — `Tab` × 7 cycles Title → Body → Assignees → Labels → Milestone → Submit → Cancel → Title.
- `TUI_ISSUE_CREATE_FORM > Shift+Tab cycles backward` — `Shift+Tab` × 2 from Title: Title → Cancel → Submit.
- `TUI_ISSUE_CREATE_FORM > typing in title updates value` — Type "Bug report"; title displays "Bug report".
- `TUI_ISSUE_CREATE_FORM > Enter inserts newline in body` — Focus body, type "line1", Enter, "line2"; body = "line1\nline2".
- `TUI_ISSUE_CREATE_FORM > Ctrl+S submits from title field` — Type title, Ctrl+S; API called.
- `TUI_ISSUE_CREATE_FORM > Ctrl+S submits from body field` — Tab to body, type, Ctrl+S; API called.
- `TUI_ISSUE_CREATE_FORM > Ctrl+S with empty title shows validation error` — Ctrl+S with empty title; error shown, API not called.
- `TUI_ISSUE_CREATE_FORM > Esc on clean form pops immediately` — Open form, Esc; form popped, no confirmation.
- `TUI_ISSUE_CREATE_FORM > Esc on dirty form shows confirmation` — Type in title, Esc; confirmation shown.
- `TUI_ISSUE_CREATE_FORM > Esc confirmation y discards` — Dirty form, Esc, y; form popped.
- `TUI_ISSUE_CREATE_FORM > Esc confirmation n returns to form` — Dirty form, Esc, n; form still active.
- `TUI_ISSUE_CREATE_FORM > assignees selector opens with Enter` — Tab to assignees, Enter; dropdown opens.
- `TUI_ISSUE_CREATE_FORM > assignees selector j/k navigates` — Open assignees, j then k; highlight moves.
- `TUI_ISSUE_CREATE_FORM > assignees selector Space toggles` — Open assignees, Space; first item selected.
- `TUI_ISSUE_CREATE_FORM > labels selector multi-select` — Open labels, Space on two, Enter; "2 selected".
- `TUI_ISSUE_CREATE_FORM > milestone selector single-select` — Open milestone, j, Enter; milestone selected.
- `TUI_ISSUE_CREATE_FORM > selector filter with /` — Open labels, /, type text; options filtered.
- `TUI_ISSUE_CREATE_FORM > successful submit navigates to issue detail` — Fill title, Ctrl+S, API 201; navigates to detail.
- `TUI_ISSUE_CREATE_FORM > failed submit shows error and re-enables form` — Fill title, Ctrl+S, API 500; error shown, form re-enabled.
- `TUI_ISSUE_CREATE_FORM > double submit is prevented` — Ctrl+S twice quickly; only one API call.
- `TUI_ISSUE_CREATE_FORM > c keybinding from issue list opens form` — On issue list, press c; form pushed.
- `TUI_ISSUE_CREATE_FORM > command palette create issue` — `:`, type "create issue", Enter; form pushed.
- `TUI_ISSUE_CREATE_FORM > title max length enforced` — Type 256 chars; only 255 accepted.
- `TUI_ISSUE_CREATE_FORM > R retries after error` — Submit, error, R; re-submits.

### Responsive Tests

- `TUI_ISSUE_CREATE_FORM > responsive 80x24 collapses body height` — Body textarea = 5 lines at 80×24.
- `TUI_ISSUE_CREATE_FORM > responsive 80x24 abbreviates labels` — Field labels read "Assign", "Labels", "Miles."
- `TUI_ISSUE_CREATE_FORM > responsive 80x24 selectors show inline summary` — Selectors show "0 selected", no dropdown.
- `TUI_ISSUE_CREATE_FORM > responsive 120x40 standard layout` — Full labels, 10-line body, dropdown overlays.
- `TUI_ISSUE_CREATE_FORM > responsive 200x60 expanded layout` — 16-line body, wider inputs, extra padding.
- `TUI_ISSUE_CREATE_FORM > resize from 120x40 to 80x24 preserves state` — Values and focus preserved through resize.
- `TUI_ISSUE_CREATE_FORM > resize from 80x24 to 120x40 expands layout` — Body grows, labels expand, data preserved.
- `TUI_ISSUE_CREATE_FORM > resize below minimum shows warning` — 60×20: "terminal too small" shown.
- `TUI_ISSUE_CREATE_FORM > resize back above minimum restores form` — 60×20 → 80×24: form restored with state.
- `TUI_ISSUE_CREATE_FORM > resize during submission` — Submit at 120×40, resize to 80×24; submission completes normally.
