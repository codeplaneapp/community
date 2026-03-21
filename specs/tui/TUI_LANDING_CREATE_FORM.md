# TUI_LANDING_CREATE_FORM

Specification for TUI_LANDING_CREATE_FORM.

## High-Level User POV

When a terminal user wants to propose landing a set of jj changes into a target bookmark, they open the landing request creation form. The most common entry point is pressing `c` from the landing request list screen, which pushes a new screen titled "New Landing Request" onto the navigation stack and updates the breadcrumb — for example, `Dashboard > owner/repo > Landings > New Landing Request`. The form is also accessible via the command palette (`:`) by typing "create landing" or "new landing request."

The form occupies the full content area between the header bar and the status bar. At the top sits a single-line text input for the landing request title, pre-focused so the user can begin typing immediately. Below it, a multi-line text area for the body/description supports free-form markdown and is wrapped in a scrollbox for longer descriptions. Beneath the body, three fields are arranged vertically: a **target bookmark** single-select to choose which bookmark the changes will land into, a **source bookmark** optional single-line text input for the originating bookmark, and a **changes** multi-select to choose which jj change IDs to include in the stack. The target bookmark selector loads the repository's bookmarks on mount and presents them in a filterable dropdown. The changes selector loads the repository's recent changes and presents them with their short change ID and description, allowing the user to select one or more changes to form the landing stack. At the bottom of the form, **Submit** and **Cancel** buttons sit side by side.

The user moves between fields with `Tab` (forward) and `Shift+Tab` (backward). The status bar updates with keybinding hints relevant to the currently focused field. Pressing `Ctrl+S` from anywhere in the form submits it. Pressing `Esc` cancels — if any field has been modified, an inline confirmation prompt "Discard changes? (y/n)" appears. A clean form pops immediately on `Esc`.

On submission, the form validates that the title is non-empty and that at least one change and a target bookmark are selected. Validation errors appear inline below the offending field in red, and focus moves to the first errored field. When validation passes, the submit button text changes to "Creating…" and fields become non-interactive. On success, the TUI pops the form screen and navigates to the newly created landing request's detail view. On server error, the form re-enables, an error message renders at the top in red, and the user can fix their input and retry with `R` or `Ctrl+S`.

At minimum terminal size (80×24), field labels are abbreviated, the body textarea is reduced to 4 lines, and selectors show inline summaries rather than overlay dropdowns. At standard size (120×40), all fields render with comfortable spacing, full labels, and overlay selectors. The form never requires horizontal scrolling. Changes in the selector display their truncated change ID (first 12 characters) and the first line of their description.

## Acceptance Criteria

- **Title field is required.** Submitting with an empty or whitespace-only title must display an inline validation error "⚠ Title is required" and prevent the API call.
- **Title field maximum display length is 255 characters.** Characters beyond 255 are rejected at input time (input stops accepting characters).
- **Body field is optional.** An empty body submits as an empty string.
- **Body field supports multi-line input.** `Enter` inserts a newline in the body textarea; `Ctrl+S` submits the form (not `Enter` alone while in the body field).
- **Target bookmark is required.** Submitting without a target bookmark selected must display "⚠ Target bookmark is required" below the selector and prevent the API call.
- **Target bookmark selector loads repository bookmarks on mount** and presents them in a filterable single-select. If no bookmarks are returned, the selector shows "(no bookmarks)" as disabled placeholder text.
- **Source bookmark is optional.** An empty source bookmark submits as an empty string.
- **At least one change is required.** Submitting with no changes selected must display "⚠ At least one change is required" below the selector and prevent the API call.
- **Changes selector loads repository changes on mount** and allows multi-selection. Each change option displays the short change ID (first 12 characters, monospace) followed by the first line of the description (truncated to fit terminal width). Empty changes are visually distinguished with "(empty)" in muted color.
- **Changes with conflicts are marked.** Changes that have `has_conflict: true` display a warning indicator (⚠) in yellow next to the change ID.
- **Tab order is deterministic:** Title → Body → Target Bookmark → Source Bookmark → Changes → Submit → Cancel.
- **`Ctrl+S` submits from any focused field.**
- **`Esc` triggers the discard confirmation if any field has been modified;** if no field has been modified, it pops immediately.
- **Optimistic navigation:** On successful creation, the TUI navigates to the new landing request detail view (pushed onto the screen stack with the form screen replaced).
- **On API error (4xx, 5xx, network), the form re-enables and shows the error message in a red `<text>` element at the top of the form.**
- **On 401 error, the form shows "Session expired. Run `codeplane auth login` to re-authenticate." and does not retry.**
- **Form state is not persisted across screen pops.** Navigating away and returning starts a fresh form.
- **At 80×24 (minimum):** Selector fields collapse to a single-line summary showing the count of selected items or the selected bookmark name (truncated). Body textarea height is reduced to 4 lines. Field labels are abbreviated ("Target", "Source", "Changes" instead of "Target Bookmark", "Source Bookmark", "Changes (jj)").
- **At <80×24 (unsupported):** The form is not rendered; the "terminal too small" message is shown.
- **Rapid key input:** All keystrokes are buffered and processed in order; no keystrokes are dropped.
- **Terminal resize during form interaction:** Layout recalculates synchronously; focus position and form state are preserved.
- **No-color terminals (`NO_COLOR=1`):** Form renders without color; validation errors use bold or reverse video instead of red. Conflict indicators use `[!]` text instead of colored `⚠`.
- **Scrollbox limits:** The body textarea scrollbox supports up to 10,000 lines of content without degrading performance.
- **Change selector scrollbox limits:** The changes selector supports up to 1,000 changes without performance degradation. Cursor-based pagination loads more changes when scrolling to 80% of the list.
- **Form does not make API calls until the user explicitly submits.** Loading bookmarks and changes is the only network activity on mount.
- **Double-submit prevention:** While a submission is in progress, additional `Ctrl+S` presses are ignored.
- **Server validation errors (422):** Field-level errors from the server are mapped to inline field errors and the first errored field is focused.
- **Change order preservation:** Changes are submitted in the order they appear in the selector (position_in_stack corresponds to the visual order in the changes list).
- **Bookmark filter is case-insensitive.** Typing in the bookmark selector filter matches bookmarks regardless of case.
- **Long bookmark names are truncated** with ellipsis at the selector boundary.
- **Long change descriptions are truncated** to (terminal width - change ID width - padding) characters with ellipsis.

## Design

### Screen Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Landings > New Landing Request │ ● connected│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ Title ────────────────────────────────────────────────────────┐  │
│  │ [text input, single line]                                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│  ⚠ Title is required                          (if validation)       │
│                                                                      │
│  ┌─ Description ──────────────────────────────────────────────────┐  │
│  │ <scrollbox>                                                    │  │
│  │   [textarea, multi-line, markdown]                             │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  Target Bookmark:  [single-select dropdown]       ▸ main            │
│  Source Bookmark:  [text input, optional]          ▸                 │
│  Changes (jj):     [multi-select list]             ▸ 0 selected     │
│                                                                      │
│  [ Submit ]   [ Cancel ]                                             │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ Tab:next field │ Ctrl+S:submit │ Esc:cancel                │ ?:help  │
└──────────────────────────────────────────────────────────────────────┘
```

### Changes Selector Expanded View

```
┌──────────────────────────────────────────────────────────────────────┐
│  Changes (jj):     [multi-select]                   ▸ 2 selected    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ☑ yzrkltnqvqpz  Fix auth middleware error handling            │  │
│  │ ☑ kmqolsnoptpq  Add rate limiting to landing API              │  │
│  │ ☐ rlwmpuqxvsmz  Update test fixtures for landing flow         │  │
│  │ ☐ ⚠ xknqrwzlst  Refactor conflict detection [conflict]       │  │
│  │   /:filter                                                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
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
        <input value={title} onChange={setTitle} maxLength={255} placeholder="Landing request title" focused={focusIndex === 0} />
        {titleError && <text color="error">⚠ {titleError}</text>}
      </box>

      <box flexDirection="column">
        <text bold>Description</text>
        <scrollbox height={bodyHeight}>
          <input multiline value={body} onChange={setBody} placeholder="Describe the changes (markdown supported)" focused={focusIndex === 1} />
        </scrollbox>
      </box>

      <box flexDirection="row" gap={2}>
        <text bold width={18}>Target Bookmark</text>
        <select options={bookmarkOptions} value={selectedTargetBookmark} onChange={setSelectedTargetBookmark} placeholder="Select target bookmark..." focused={focusIndex === 2} />
      </box>
      {targetBookmarkError && <text color="error">⚠ {targetBookmarkError}</text>}

      <box flexDirection="row" gap={2}>
        <text bold width={18}>Source Bookmark</text>
        <input value={sourceBookmark} onChange={setSourceBookmark} placeholder="Optional source bookmark" focused={focusIndex === 3} />
      </box>

      <box flexDirection="row" gap={2}>
        <text bold width={18}>Changes (jj)</text>
        <select multiple options={changeOptions} value={selectedChangeIds} onChange={setSelectedChangeIds} placeholder="Select changes..." focused={focusIndex === 4} renderOption={renderChangeOption} />
      </box>
      {changesError && <text color="error">⚠ {changesError}</text>}

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

**Source bookmark input:** Same keybindings as title input.

**Target bookmark selector (when open):** `Enter` (open/confirm), `j`/`Down` (next option), `k`/`Up` (prev option), `/` (filter options), `Esc` (close dropdown without change).

**Changes selector (when open):** `Enter` (open/confirm), `j`/`Down` (next option), `k`/`Up` (prev option), `Space` (toggle selection), `/` (filter options), `Esc` (close dropdown without change).

**Buttons:** `Enter`/`Space` (activate).

### Responsive Behavior

| Size | Body Height | Field Labels | Selectors | Gap |
|------|-------------|--------------|-----------|-----|
| 80×24 | 4 lines | Abbreviated ("Target", "Source", "Changes") | Inline summary | 0 |
| 120×40 | 8 lines | Full ("Target Bookmark", "Source Bookmark", "Changes (jj)") | Overlay (8 items) | 1 line |
| 200×60 | 14 lines | Full with description | Overlay (14 items) | 1 line + padding |

Resize triggers synchronous re-layout via `useOnResize()`. Focus index and form values preserved.

### Data Hooks

| Hook | Purpose |
|------|----------|
| `useCreateLanding()` | Mutation for `POST /api/repos/:owner/:repo/landings`. Returns `{ mutate, isLoading, error }`. |
| `useBookmarks(owner, repo)` | Fetches repository bookmarks for target bookmark selector. |
| `useChanges(owner, repo)` | Fetches repository changes for change selector. Returns `{ items, isLoading, error, fetchMore }`. |
| `useKeyboard()` | Registers form-level keybinding handlers. |
| `useTerminalDimensions()` | Returns `{ columns, rows }` for responsive layout decisions. |
| `useOnResize()` | Triggers re-render on terminal resize events. |

### Navigation Flow

1. Entry: `c` from landing list OR command palette "Create Landing" / "New Landing Request."
2. Screen push: `LandingCreateForm` pushed onto navigation stack.
3. Success: Form screen replaced with new landing request detail view (landing request number in breadcrumb).
4. Cancel: Form screen popped; user returns to previous screen.

## Permissions & Security

### Authorization

- **Required permission:** Write access to the repository. The API endpoint `POST /api/repos/:owner/:repo/landings` checks `requireWriteAccess()` server-side.
- **Read-only users** who navigate to the create form see the form rendered but receive a 403 error on submission. The error displays: "You do not have permission to create landing requests in this repository."
- **Unauthenticated users** (expired or missing token) receive a 401, triggering: "Session expired. Run `codeplane auth login` to re-authenticate."

### Token-based Auth

- The TUI reads the auth token from the CLI keychain (stored by `codeplane auth login`) or from the `CODEPLANE_TOKEN` environment variable.
- Token attached as `Authorization: token <token>` on all API requests.
- No interactive login flow in the TUI. Auth failures require CLI re-authentication.

### Rate Limiting

- Landing request creation is subject to server-side rate limiting (same limits as web UI and CLI).
- 429 Too Many Requests displays: "Rate limit exceeded. Please wait and try again." with `Retry-After` value if present.
- No auto-retry on 429.

### Input Sanitization

- Title, body, and bookmark names are sent as-is to the server. Server-side sanitization handles injection concerns.
- The TUI does not render HTML; markdown in the body field is plain text during editing.
- Change IDs are validated as non-empty strings; the TUI does not validate their format beyond non-emptiness (the server validates change ID structure).

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.landing_create_form.opened` | Form screen pushed onto stack | `repo_owner`, `repo_name`, `entry_point` ("keybinding" | "command_palette" | "go_to"), `terminal_columns`, `terminal_rows` |
| `tui.landing_create_form.submitted` | User submits the form | `repo_owner`, `repo_name`, `has_body`, `change_count`, `title_length`, `body_length`, `target_bookmark`, `has_source_bookmark` |
| `tui.landing_create_form.succeeded` | API returns 2xx | `repo_owner`, `repo_name`, `landing_number`, `change_count`, `duration_ms` |
| `tui.landing_create_form.failed` | API returns non-2xx or network error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.landing_create_form.cancelled` | User cancels the form | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` |
| `tui.landing_create_form.validation_error` | Client-side validation fails | `repo_owner`, `repo_name`, `field` ("title" | "target_bookmark" | "changes"), `error_type` ("empty" | "missing") |
| `tui.landing_create_form.changes_loaded` | Changes list fetched successfully | `repo_owner`, `repo_name`, `change_count`, `conflicted_count`, `duration_ms` |
| `tui.landing_create_form.bookmarks_loaded` | Bookmarks list fetched successfully | `repo_owner`, `repo_name`, `bookmark_count`, `duration_ms` |

### Success Indicators

- **Completion rate:** % of `form.opened` → `form.succeeded`. Target: >65%.
- **Abandonment rate:** % of `form.opened` → `form.cancelled` with `was_dirty=true`. Target: <15%.
- **Error rate:** % of `form.submitted` → `form.failed`. Target: <3%.
- **Time to submit:** Median duration from open to success. Benchmark: <90s (landing requests are more complex than issues).
- **Change selection accuracy:** Average number of changes selected per landing request (tracks typical stack size).
- **Conflict awareness:** % of submissions where at least one change has `has_conflict: true` (tracks whether users acknowledge conflicts before landing).

## Observability

### Logging

| Level | Event | Details |
|-------|-------|----------|
| `debug` | Form mounted | `{ screen: "landing_create", repo: "owner/repo" }` |
| `debug` | Bookmarks loaded | `{ count, duration_ms }` |
| `debug` | Changes loaded | `{ count, conflicted_count, duration_ms }` |
| `info` | Form submitted | `{ repo, title_length, has_body, change_count, target_bookmark, has_source_bookmark }` |
| `info` | Landing created | `{ repo, landing_number, change_count, duration_ms }` |
| `warn` | Bookmark fetch failed | `{ error_code, error_message }` |
| `warn` | Changes fetch failed | `{ error_code, error_message }` |
| `warn` | Submission with conflicted changes | `{ repo, conflicted_change_ids }` |
| `error` | Landing creation failed | `{ repo, status_code, error_message, request_duration_ms }` |
| `error` | Auth failure | `{ repo, status_code: 401 }` |
| `debug` | Form cancelled | `{ was_dirty, fields_filled }` |

### Error Cases and Recovery

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout during submission | Fetch timeout or `AbortError` | "Request timed out. Press `R` to retry." Form re-enables with data preserved. |
| SSE disconnect while form is open | SSE context reports disconnection | Status bar updates. Form unaffected (uses REST, not SSE). |
| Terminal resize during submission | `useOnResize` fires while `submitting=true` | Layout recalculates. Submission continues. "Creating…" preserved. |
| Terminal resize below minimum | `columns < 80 \|\| rows < 24` | "Terminal too small" shown. Form state preserved; re-enlarging restores form. |
| Bookmark data fails to load | Fetch error on mount | Target bookmark selector shows "Failed to load bookmarks (R to retry)". Other fields remain functional. Submission blocked until bookmarks load. |
| Changes data fails to load | Fetch error on mount | Changes selector shows "Failed to load changes (R to retry)". Other fields remain functional. Submission blocked until changes load. |
| Auth token expired | 401 response | Auth error message. No retry. User re-authenticates via CLI. |
| Server 422 validation error | Response with field errors | Map to inline field errors. Focus first errored field. |
| Rapid double-submit | `Ctrl+S` while `submitting=true` | Ignored. Button shows "Creating…". |
| Content too large | 413 response | "Content too large. Please shorten the description." |
| No bookmarks in repository | Empty bookmarks list | Target bookmark selector shows "(no bookmarks)". Submit button disabled. |
| No changes in repository | Empty changes list | Changes selector shows "(no changes)". Submit button disabled. |
| Change ID no longer valid | Server rejects change ID (404/422) | Error shown: "One or more selected changes no longer exist. Refresh and reselect." |

### Health Signals

- Form render time: <100ms from screen push to first interactive frame.
- Bookmarks load: <500ms.
- Changes load: <1000ms (larger dataset than bookmarks).
- Submission round-trip: <2000ms at p95.

## Verification

### Terminal Snapshot Tests

- `TUI_LANDING_CREATE_FORM > renders empty form at 120x40` — Snapshot of initial form state at standard size. Title focused, all fields empty, target bookmark placeholder visible, Submit and Cancel visible.
- `TUI_LANDING_CREATE_FORM > renders empty form at 80x24` — Minimum size. Abbreviated labels, reduced body height, collapsed selectors.
- `TUI_LANDING_CREATE_FORM > renders empty form at 200x60` — Large size. Wider fields, more body lines, expanded padding.
- `TUI_LANDING_CREATE_FORM > renders title validation error` — Error message "⚠ Title is required" visible below title input after empty submit.
- `TUI_LANDING_CREATE_FORM > renders target bookmark validation error` — Error message "⚠ Target bookmark is required" visible below target bookmark selector.
- `TUI_LANDING_CREATE_FORM > renders changes validation error` — Error message "⚠ At least one change is required" visible below changes selector.
- `TUI_LANDING_CREATE_FORM > renders all validation errors simultaneously` — All three required field errors shown after submit with everything empty.
- `TUI_LANDING_CREATE_FORM > renders server error banner` — Red error banner at top after failed API call.
- `TUI_LANDING_CREATE_FORM > renders submitting state` — Submit button shows "Creating…", fields dimmed/non-interactive.
- `TUI_LANDING_CREATE_FORM > renders target bookmark selector expanded` — Target bookmark dropdown open with bookmark list.
- `TUI_LANDING_CREATE_FORM > renders target bookmark selector with filter` — Bookmark dropdown with filter text entered and filtered results.
- `TUI_LANDING_CREATE_FORM > renders changes selector expanded` — Changes dropdown open with change ID + description list.
- `TUI_LANDING_CREATE_FORM > renders changes selector with conflicted change` — Changes list showing ⚠ indicator on conflicted change.
- `TUI_LANDING_CREATE_FORM > renders changes selector with filter` — Changes dropdown with filter text and filtered results.
- `TUI_LANDING_CREATE_FORM > renders selected changes count` — "3 selected" shown after selecting three changes.
- `TUI_LANDING_CREATE_FORM > renders discard confirmation` — Inline "Discard changes? (y/n)" prompt.
- `TUI_LANDING_CREATE_FORM > renders breadcrumb correctly` — Breadcrumb shows "Dashboard > owner/repo > Landings > New Landing Request".
- `TUI_LANDING_CREATE_FORM > renders help overlay` — Help overlay showing all form keybindings.
- `TUI_LANDING_CREATE_FORM > renders no bookmarks state` — Target bookmark selector shows "(no bookmarks)".
- `TUI_LANDING_CREATE_FORM > renders no changes state` — Changes selector shows "(no changes)".
- `TUI_LANDING_CREATE_FORM > renders bookmark load error` — Selector shows "Failed to load bookmarks (R to retry)".
- `TUI_LANDING_CREATE_FORM > renders changes load error` — Selector shows "Failed to load changes (R to retry)".

### Keyboard Interaction Tests

- `TUI_LANDING_CREATE_FORM > Tab cycles through form fields` — `Tab` × 7 cycles Title → Body → Target Bookmark → Source Bookmark → Changes → Submit → Cancel → Title.
- `TUI_LANDING_CREATE_FORM > Shift+Tab cycles backward` — `Shift+Tab` × 2 from Title: Title → Cancel → Submit.
- `TUI_LANDING_CREATE_FORM > typing in title updates value` — Type "Land auth changes"; title displays "Land auth changes".
- `TUI_LANDING_CREATE_FORM > Enter inserts newline in body` — Focus body, type "line1", Enter, "line2"; body contains "line1\nline2".
- `TUI_LANDING_CREATE_FORM > typing in source bookmark updates value` — Tab to source bookmark, type "feature/auth"; source bookmark displays "feature/auth".
- `TUI_LANDING_CREATE_FORM > Ctrl+S submits from title field` — Fill required fields, Ctrl+S from title; API called with correct payload.
- `TUI_LANDING_CREATE_FORM > Ctrl+S submits from body field` — Fill required fields, Tab to body, type, Ctrl+S; API called.
- `TUI_LANDING_CREATE_FORM > Ctrl+S with empty title shows validation error` — Ctrl+S with empty title; error shown, API not called.
- `TUI_LANDING_CREATE_FORM > Ctrl+S without target bookmark shows validation error` — Fill title, Ctrl+S without bookmark; error shown, API not called.
- `TUI_LANDING_CREATE_FORM > Ctrl+S without changes shows validation error` — Fill title and bookmark, Ctrl+S without changes; error shown, API not called.
- `TUI_LANDING_CREATE_FORM > Esc on clean form pops immediately` — Open form, Esc; form popped, no confirmation.
- `TUI_LANDING_CREATE_FORM > Esc on dirty form shows confirmation` — Type in title, Esc; confirmation shown.
- `TUI_LANDING_CREATE_FORM > Esc confirmation y discards` — Dirty form, Esc, y; form popped.
- `TUI_LANDING_CREATE_FORM > Esc confirmation n returns to form` — Dirty form, Esc, n; form still active, focus restored.
- `TUI_LANDING_CREATE_FORM > target bookmark selector opens with Enter` — Tab to target bookmark, Enter; dropdown opens.
- `TUI_LANDING_CREATE_FORM > target bookmark selector j/k navigates` — Open target bookmark dropdown, j then k; highlight moves.
- `TUI_LANDING_CREATE_FORM > target bookmark selector Enter selects` — Open dropdown, j to item, Enter; bookmark selected, dropdown closes.
- `TUI_LANDING_CREATE_FORM > target bookmark selector filter with /` — Open dropdown, /, type "main"; options filtered to matching bookmarks.
- `TUI_LANDING_CREATE_FORM > target bookmark selector Esc closes without change` — Open dropdown, Esc; dropdown closes, previous value preserved.
- `TUI_LANDING_CREATE_FORM > target bookmark filter is case-insensitive` — Open dropdown, /, type "MAIN"; matches "main" bookmark.
- `TUI_LANDING_CREATE_FORM > changes selector opens with Enter` — Tab to changes, Enter; changes overlay opens.
- `TUI_LANDING_CREATE_FORM > changes selector j/k navigates` — Open changes, j then k; highlight moves.
- `TUI_LANDING_CREATE_FORM > changes selector Space toggles` — Open changes, Space; first item toggled.
- `TUI_LANDING_CREATE_FORM > changes selector multi-select` — Open changes, Space on two items, Enter; "2 selected" shown.
- `TUI_LANDING_CREATE_FORM > changes selector filter with /` — Open changes, /, type text; options filtered by description or change ID.
- `TUI_LANDING_CREATE_FORM > changes selector shows conflict indicator` — Open changes with conflicted change; ⚠ indicator visible.
- `TUI_LANDING_CREATE_FORM > successful submit navigates to landing detail` — Fill required fields, Ctrl+S, API 201; navigates to landing detail with correct number.
- `TUI_LANDING_CREATE_FORM > failed submit shows error and re-enables form` — Fill required fields, Ctrl+S, API 500; error shown, form re-enabled.
- `TUI_LANDING_CREATE_FORM > 403 shows permission error` — Fill and submit; API 403; error shows "You do not have permission to create landing requests in this repository."
- `TUI_LANDING_CREATE_FORM > double submit is prevented` — Ctrl+S twice quickly; only one API call made.
- `TUI_LANDING_CREATE_FORM > c keybinding from landing list opens form` — On landing list, press c; form pushed.
- `TUI_LANDING_CREATE_FORM > command palette create landing` — `:`, type "create landing", Enter; form pushed.
- `TUI_LANDING_CREATE_FORM > title max length enforced` — Type 256 chars; only 255 accepted.
- `TUI_LANDING_CREATE_FORM > R retries after error` — Submit, error, R; re-submits.
- `TUI_LANDING_CREATE_FORM > submit payload includes all fields` — Fill all fields, submit; API called with `{ title, body, target_bookmark, source_bookmark, change_ids }`.
- `TUI_LANDING_CREATE_FORM > submit with only required fields` — Fill title, select bookmark and one change, submit; API called with empty body and source_bookmark.
- `TUI_LANDING_CREATE_FORM > 422 maps field errors inline` — Submit, server returns 422 with field-level errors; errors appear inline under respective fields.

### Responsive Tests

- `TUI_LANDING_CREATE_FORM > responsive 80x24 collapses body height` — Body textarea = 4 lines at 80×24.
- `TUI_LANDING_CREATE_FORM > responsive 80x24 abbreviates labels` — Field labels read "Target", "Source", "Changes".
- `TUI_LANDING_CREATE_FORM > responsive 80x24 selectors show inline summary` — Selectors show summary text, no overlay dropdown.
- `TUI_LANDING_CREATE_FORM > responsive 80x24 truncates long bookmark name` — Selected bookmark name truncated with ellipsis at 80 columns.
- `TUI_LANDING_CREATE_FORM > responsive 120x40 standard layout` — Full labels, 8-line body, dropdown overlays with 8 visible items.
- `TUI_LANDING_CREATE_FORM > responsive 120x40 change descriptions visible` — Change selector shows change ID + truncated description.
- `TUI_LANDING_CREATE_FORM > responsive 200x60 expanded layout` — 14-line body, wider inputs, full change descriptions, extra padding.
- `TUI_LANDING_CREATE_FORM > responsive 200x60 extended change metadata` — Change selector shows change ID + description + timestamp.
- `TUI_LANDING_CREATE_FORM > resize from 120x40 to 80x24 preserves state` — Values and focus preserved through resize.
- `TUI_LANDING_CREATE_FORM > resize from 80x24 to 120x40 expands layout` — Body grows, labels expand, data preserved.
- `TUI_LANDING_CREATE_FORM > resize below minimum shows warning` — 60×20: "terminal too small" shown.
- `TUI_LANDING_CREATE_FORM > resize back above minimum restores form` — 60×20 → 80×24: form restored with state intact.
- `TUI_LANDING_CREATE_FORM > resize during submission` — Submit at 120×40, resize to 80×24; submission completes normally, "Creating…" still visible.
