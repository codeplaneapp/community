# TUI_WORKSPACE_CREATE_FORM

Specification for TUI_WORKSPACE_CREATE_FORM.

## High-Level User POV

When a terminal user wants to create a new workspace for a repository, they activate the workspace create form from one of two entry points: pressing `c` from the workspace list screen, or opening the command palette (`:`) and typing "create workspace." Either action pushes a new screen onto the navigation stack titled "New Workspace," and the breadcrumb updates to reflect the path — for example, `Dashboard > owner/repo > Workspaces > New Workspace`.

The form occupies the full content area between the header bar and the status bar. At the top sits a single-line text input for the workspace name, pre-focused so the user can start typing immediately. The name field accepts a human-readable identifier for the workspace — something like "feature-auth-flow" or "debug-pipeline." Below the name input, a single-select dropdown labeled "Snapshot" allows the user to optionally select an existing workspace snapshot to restore from. The snapshot selector lists all available snapshots for the repository, each showing the snapshot name and creation date. When no snapshot is selected, the workspace is created from a blank state. If no snapshots exist for the repository, the selector displays "(no snapshots)" as disabled placeholder text and is non-interactive. At the bottom of the form, two buttons — **Create** and **Cancel** — sit side by side.

The user moves between form fields using `Tab` (forward) and `Shift+Tab` (backward). The status bar always shows a keybinding hint strip relevant to the currently focused field. Pressing `Ctrl+S` from anywhere in the form submits it. Pressing `Esc` cancels the form and pops the screen, returning the user to the previous view. If the form has unsaved content (the name field has been typed into or a snapshot has been selected), an inline confirmation prompt appears: "Discard changes? (y/n)."

On submission, the form performs client-side validation — the name field must not be empty and must conform to workspace naming rules (lowercase alphanumeric and hyphens, no leading/trailing hyphens, no consecutive hyphens). An inline validation error renders below the name input if validation fails, with focus returned to the name field. When the name is valid, the Create button text changes to "Creating…" and the form fields become non-interactive. Workspace provisioning may take several seconds as the container is initialized, so a progress indicator appears below the button row showing "Provisioning workspace…" with a braille spinner.

On success, the TUI pops the form screen and navigates to the newly created workspace's detail view, which begins streaming the workspace status as it transitions from "starting" to "running." On server error, the form re-enables, an error message renders at the top of the form in red, and the user can correct their input and retry with `R` or `Ctrl+S`.

At minimum terminal size (80×24), the form renders with compact spacing and abbreviated labels. At standard size (120×40), all fields render with comfortable spacing, full labels, and the snapshot selector shows a dropdown overlay with up to 8 visible items. The form never requires horizontal scrolling.

## Acceptance Criteria

- **Name field is required.** Submitting with an empty or whitespace-only name must display an inline validation error (`⚠ Workspace name is required`) and prevent the API call.
- **Name field validates format.** The name must match `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$` (lowercase alphanumeric, hyphens allowed in the middle, no leading/trailing hyphens, no consecutive hyphens). Invalid names display: `⚠ Name must be lowercase alphanumeric with hyphens (e.g., my-workspace)`.
- **Name field maximum display length is 63 characters.** Characters beyond 63 are rejected at input time (input stops accepting characters). This aligns with container name constraints.
- **Name field minimum length is 1 character** (after trimming whitespace).
- **Snapshot selector is optional.** If no snapshot is selected, the workspace is created from a blank state (no `snapshot_id` sent to the API).
- **Snapshot selector loads repository snapshots on mount** and allows single selection (or "None"). If no snapshots are returned, the selector shows "(no snapshots)" as disabled placeholder text.
- **Snapshot selector displays snapshot name and relative creation date** for each option (e.g., `base-env — 3 days ago`).
- **Tab order is deterministic:** Name → Snapshot → Create → Cancel.
- **`Ctrl+S` submits from any focused field.**
- **`Esc` triggers the discard confirmation if any field has been modified;** if no field has been modified, it pops immediately.
- **Optimistic navigation:** On successful creation, the TUI navigates to the new workspace detail view (pushed onto the screen stack with the form screen replaced).
- **On API error (4xx, 5xx, network), the form re-enables and shows the error message in a red `<text>` element at the top of the form.**
- **On 401 error, the form shows "Session expired. Run `codeplane auth login` to re-authenticate." and does not retry.**
- **On 403 error, the form shows "You do not have permission to create workspaces in this repository." and does not retry.**
- **On 409 error (name conflict), the form shows the inline field error: `⚠ A workspace with this name already exists` and focuses the name field.**
- **Form state is not persisted across screen pops.** Navigating away and returning starts a fresh form.
- **Provisioning indicator:** After submission, a braille spinner with "Provisioning workspace…" appears below the button row. This persists until the API responds.
- **At 80×24 (minimum):** Snapshot selector collapses to a single-line summary. Field labels are abbreviated ("Name" stays "Name"; "Snapshot" stays "Snap"). Spacing between fields is reduced to 0 gap.
- **At <80×24 (unsupported):** The form is not rendered; the "terminal too small" message is shown.
- **Rapid key input:** All keystrokes are buffered and processed in order; no keystrokes are dropped.
- **Terminal resize during form interaction:** Layout recalculates synchronously; focus position and form state are preserved.
- **No-color terminals (`NO_COLOR=1`):** Form renders without color; validation errors use bold or reverse video instead of red.
- **Form does not make API calls until the user explicitly submits.** Loading the snapshot list is the only network activity on mount.
- **Double-submit prevention:** While a submission is in progress, additional `Ctrl+S` presses are ignored.
- **Server validation errors (422):** Field-level errors from the server are mapped to inline field errors and the first errored field is focused.
- **Workspace creation requires repository context.** The form cannot be opened without a repository selected. Attempting to do so via the command palette shows: "Select a repository first."
- **Name field input restricts characters in real-time.** Only lowercase letters (`a-z`), digits (`0-9`), and hyphens (`-`) are accepted. Uppercase letters are silently lowered. All other characters are rejected at keystroke time.

## Design

### Screen Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Dashboard > owner/repo > Workspaces > New Workspace │ ● conn │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Name ───────────────────────────────────────────────┐   │
│  │ [text input, single line]                            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ⚠ Workspace name is required          (if validation)      │
│                                                             │
│  ┌─ Snapshot (optional) ────────────────────────────────┐   │
│  │ ▸ None                                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  [ Create ]   [ Cancel ]                                    │
│                                                             │
│  ⣾ Provisioning workspace…          (if submitting)         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Tab:next field │ Ctrl+S:create │ Esc:cancel      │ ?:help   │
└─────────────────────────────────────────────────────────────┘
```

### Snapshot Selector Expanded

```
  ┌─ Snapshot (optional) ────────────────────────────────┐
  │ ▸ None                                               │
  ├──────────────────────────────────────────────────────┤
  │   None                                               │
  │ ▸ base-env                        — 3 days ago       │
  │   feature-checkpoint              — 1 week ago       │
  │   pre-refactor                    — 2 weeks ago      │
  └──────────────────────────────────────────────────────┘
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
        <text bold>Name</text>
        <input
          value={name}
          onChange={handleNameChange}
          maxLength={63}
          placeholder="my-workspace"
          focused={focusIndex === 0}
        />
        {nameError && <text color="error">⚠ {nameError}</text>}
      </box>

      <box flexDirection="column">
        <text bold>Snapshot <text color="muted">(optional)</text></text>
        <select
          options={snapshotOptions}
          value={selectedSnapshot}
          onChange={setSelectedSnapshot}
          placeholder="None"
          focused={focusIndex === 1}
        />
      </box>

      <box flexDirection="row" gap={2} marginTop={1}>
        <button focused={focusIndex === 2} onPress={handleSubmit}>
          {submitting ? "Creating…" : "Create"}
        </button>
        <button focused={focusIndex === 3} onPress={handleCancel}>
          Cancel
        </button>
      </box>

      {submitting && (
        <box marginTop={1}>
          <text color="muted">⣾ Provisioning workspace…</text>
        </box>
      )}
    </box>
  </scrollbox>
</box>
```

### Keybindings

**Form-level:** `Tab` (next field), `Shift+Tab` (prev field), `Ctrl+S` (submit), `Esc` (cancel with confirmation if dirty), `?` (help overlay), `:` (command palette from non-input fields).

**Name input:** Printable chars matching `[a-z0-9-]` (insert; uppercase letters auto-lowered; other chars rejected), `Backspace`/`Delete` (delete), `Left`/`Right` (cursor move), `Home`/`Ctrl+A` (start of line), `End`/`Ctrl+E` (end of line), `Ctrl+K` (kill to end), `Ctrl+U` (kill to start).

**Snapshot selector (when open):** `Enter` (open/confirm), `j`/`Down` (next option), `k`/`Up` (prev option), `/` (filter options), `Esc` (close dropdown without changing selection).

**Buttons:** `Enter`/`Space` (activate).

**Discard confirmation:** `y`/`Y` (discard and pop), `n`/`N`/`Esc` (return to form).

### Responsive Behavior

| Size | Field Gap | Labels | Snapshot Selector | Provisioning Indicator |
|------|-----------|--------|-------------------|----------------------|
| 80×24 | 0 | Abbreviated ("Name", "Snap") | Inline summary | Single line, truncated |
| 120×40 | 1 line | Full ("Name", "Snapshot (optional)") | Overlay (8 items) | Full line with spinner |
| 200×60 | 1 line + padding | Full with description text | Overlay (12 items) | Full line with spinner + elapsed time |

Resize triggers synchronous re-layout via `useOnResize()`. Focus index and form values preserved.

### Data Hooks

| Hook | Purpose |
|------|--------|
| `useCreateWorkspace(owner, repo)` | Mutation for `POST /api/repos/:owner/:repo/workspaces`. Returns `{ mutate, isLoading, error }`. |
| `useWorkspaceSnapshots(owner, repo)` | Fetches repository workspace snapshots for snapshot selector. |
| `useKeyboard()` | Registers form-level keybinding handlers. |
| `useTerminalDimensions()` | Returns `{ columns, rows }` for responsive decisions. |
| `useOnResize()` | Triggers re-render on terminal resize. |

### Navigation Flow

1. Entry: `c` from workspace list OR command palette "Create Workspace".
2. Screen push: `WorkspaceCreateForm` pushed onto navigation stack.
3. Success: Form screen replaced with new workspace detail view (which streams status via SSE).
4. Cancel: Form screen popped; user returns to previous screen.

## Permissions & Security

### Authorization

- **Required permission:** Write access to the repository. The API endpoint `POST /api/repos/:owner/:repo/workspaces` checks `requireWriteAccess()` server-side.
- **Read-only users** who navigate to the create form see the form rendered but receive a 403 error on submission. The error displays: "You do not have permission to create workspaces in this repository."
- **Unauthenticated users** (expired or missing token) receive a 401, triggering: "Session expired. Run `codeplane auth login` to re-authenticate."
- **Workspace quotas:** If the server enforces per-user or per-repo workspace limits, a 403 or 422 response is returned with a descriptive message displayed in the error banner (e.g., "Workspace limit reached. Suspend or delete an existing workspace.").

### Token-based Auth

- The TUI reads the auth token from the CLI keychain (stored by `codeplane auth login`) or from `CODEPLANE_TOKEN` environment variable.
- Token attached as `Authorization: token <token>` on all API requests.
- No interactive login flow in the TUI. Auth failures require CLI re-authentication.

### Rate Limiting

- Workspace creation is subject to server-side rate limiting (same limits as web UI and CLI).
- 429 Too Many Requests displays: "Rate limit exceeded. Please wait and try again." with `Retry-After` value if present.
- No auto-retry on 429.

### Input Sanitization

- Name is validated client-side for format constraints before sending.
- Server-side validation is the authoritative check; client-side validation is defensive.
- The snapshot ID is sent as an opaque string; server validates snapshot ownership and existence.

## Telemetry & Product Analytics

### Key Business Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `tui.workspace_create_form.opened` | Form screen pushed onto stack | `repo_owner`, `repo_name`, `entry_point` ("keybinding" \| "command_palette"), `terminal_columns`, `terminal_rows`, `snapshot_count` (number available) |
| `tui.workspace_create_form.submitted` | User submits the form | `repo_owner`, `repo_name`, `name_length`, `has_snapshot`, `snapshot_id` (if selected) |
| `tui.workspace_create_form.succeeded` | API returns 2xx | `repo_owner`, `repo_name`, `workspace_id`, `duration_ms`, `has_snapshot` |
| `tui.workspace_create_form.failed` | API returns non-2xx or network error | `repo_owner`, `repo_name`, `error_code`, `error_message`, `duration_ms` |
| `tui.workspace_create_form.cancelled` | User cancels the form | `repo_owner`, `repo_name`, `was_dirty`, `fields_filled` (array of modified field names) |
| `tui.workspace_create_form.validation_error` | Client-side validation fails | `repo_owner`, `repo_name`, `field`, `error_type` ("empty" \| "format" \| "length") |
| `tui.workspace_create_form.discard_confirmed` | User confirms discard of dirty form | `repo_owner`, `repo_name`, `name_length` |

### Success Indicators

- **Completion rate:** % of `form.opened` → `form.succeeded`. Target: >75%.
- **Abandonment rate:** % of `form.opened` → `form.cancelled` with `was_dirty=true`. Target: <10%.
- **Error rate:** % of `form.submitted` → `form.failed`. Target: <3%.
- **Time to submit:** Median duration from open to success. Benchmark: <30s (form is simpler than issue create).
- **Snapshot utilization:** % of successful creations using a snapshot. Tracks snapshot feature discovery and adoption.
- **Name validation rejection rate:** % of submissions blocked by client-side name validation. Target: <5% (indicates good UX guidance).

## Observability

### Logging

| Level | Event | Details |
|-------|-------|--------|
| `debug` | Form mounted | `{ screen: "workspace_create", repo: "owner/repo" }` |
| `debug` | Snapshot data loaded | `{ snapshot_count, duration_ms }` |
| `info` | Form submitted | `{ repo, name_length, has_snapshot }` |
| `info` | Workspace created | `{ repo, workspace_id, duration_ms, has_snapshot }` |
| `warn` | Snapshot data fetch failed | `{ error_code, error_message }` |
| `warn` | Name validation failed | `{ name_length, error_type }` |
| `error` | Workspace creation failed | `{ repo, status_code, error_message, request_duration_ms }` |
| `error` | Auth failure | `{ repo, status_code: 401 }` |
| `debug` | Form cancelled | `{ was_dirty, fields_filled }` |

### Error Cases and Recovery

| Error Case | Detection | Recovery |
|------------|-----------|----------|
| Network timeout during submission | Fetch timeout or `AbortError` | "Request timed out. Press `R` to retry." Form re-enables with data preserved. |
| SSE disconnect while form is open | SSE context reports disconnection | Status bar updates. Form unaffected (uses REST, not SSE). |
| Terminal resize during submission | `useOnResize` fires while `submitting=true` | Layout recalculates. Submission continues. "Creating…" and provisioning spinner preserved. |
| Terminal resize below minimum | `columns < 80 || rows < 24` | "Terminal too small" shown. Form state preserved; re-enlarging restores form. |
| Snapshot list fails to load | Fetch error on mount | Selector shows "Failed to load (retry)". Name field remains functional. User can still create without snapshot. |
| Auth token expired | 401 response | Auth error message. No retry. User re-authenticates via CLI. |
| Workspace name conflict | 409 response | Inline error on name field: "A workspace with this name already exists." Focus name field. |
| Server 422 validation error | Response with field errors | Map to inline field errors. Focus first errored field. |
| Rapid double-submit | `Ctrl+S` while `submitting=true` | Ignored. Button shows "Creating…" |
| Workspace quota exceeded | 403/422 with quota message | Error banner: "Workspace limit reached. Suspend or delete an existing workspace." |
| Container provisioning timeout | API returns 504 or long-running request | "Workspace provisioning timed out. The workspace may still be starting. Check the workspace list." Form re-enables. |
| Snapshot not found | 404 when submitting with deleted snapshot | Error banner: "Selected snapshot no longer exists." Snapshot selector refreshed. |

### Health Signals

- Form render time: <100ms from screen push to first interactive frame.
- Snapshot list load: <500ms.
- Submission round-trip (API response, not full provisioning): <5000ms at p95.
- Full provisioning (from submit to workspace "running"): tracked but not blocked on by the form.

## Verification

### Terminal Snapshot Tests

- `TUI_WORKSPACE_CREATE_FORM > renders empty form at 120x40` — Snapshot of initial form state at standard size. Name focused, snapshot set to "None", Create and Cancel visible.
- `TUI_WORKSPACE_CREATE_FORM > renders empty form at 80x24` — Minimum size. Abbreviated labels, reduced spacing, collapsed snapshot selector.
- `TUI_WORKSPACE_CREATE_FORM > renders empty form at 200x60` — Large size. Wider fields, extra padding, description text below labels.
- `TUI_WORKSPACE_CREATE_FORM > renders name validation error for empty name` — Error message "⚠ Workspace name is required" visible below name input after empty submit.
- `TUI_WORKSPACE_CREATE_FORM > renders name validation error for invalid format` — Error message "⚠ Name must be lowercase alphanumeric with hyphens (e.g., my-workspace)" visible after submitting "My Workspace!".
- `TUI_WORKSPACE_CREATE_FORM > renders server error banner` — Red error banner at top after failed API call.
- `TUI_WORKSPACE_CREATE_FORM > renders submitting state with provisioning indicator` — Create button shows "Creating…", fields dimmed, braille spinner with "Provisioning workspace…" visible.
- `TUI_WORKSPACE_CREATE_FORM > renders snapshot selector expanded` — Snapshot dropdown open with snapshot list showing names and relative dates.
- `TUI_WORKSPACE_CREATE_FORM > renders snapshot selector with no snapshots` — Snapshot selector shows "(no snapshots)" as disabled placeholder.
- `TUI_WORKSPACE_CREATE_FORM > renders discard confirmation` — Inline "Discard changes? (y/n)" prompt.
- `TUI_WORKSPACE_CREATE_FORM > renders breadcrumb correctly` — Breadcrumb shows "Dashboard > owner/repo > Workspaces > New Workspace".
- `TUI_WORKSPACE_CREATE_FORM > renders help overlay` — Help overlay showing all form keybindings.
- `TUI_WORKSPACE_CREATE_FORM > renders name conflict error inline` — Inline error "⚠ A workspace with this name already exists" on name field after 409 response.
- `TUI_WORKSPACE_CREATE_FORM > renders 401 auth error` — Auth error message displayed, no retry option.

### Keyboard Interaction Tests

- `TUI_WORKSPACE_CREATE_FORM > Tab cycles through form fields` — `Tab` × 4 cycles Name → Snapshot → Create → Cancel → Name.
- `TUI_WORKSPACE_CREATE_FORM > Shift+Tab cycles backward` — `Shift+Tab` × 2 from Name: Name → Cancel → Create.
- `TUI_WORKSPACE_CREATE_FORM > typing in name updates value` — Type "my-workspace"; name displays "my-workspace".
- `TUI_WORKSPACE_CREATE_FORM > uppercase letters are lowered in name` — Type "My-Workspace"; name displays "my-workspace".
- `TUI_WORKSPACE_CREATE_FORM > invalid characters rejected in name` — Type "my workspace!"; name displays "myworkspace" (space and exclamation rejected).
- `TUI_WORKSPACE_CREATE_FORM > Ctrl+S submits from name field` — Type valid name, Ctrl+S; API called.
- `TUI_WORKSPACE_CREATE_FORM > Ctrl+S submits from snapshot selector` — Tab to snapshot, Ctrl+S; API called with name only (no snapshot).
- `TUI_WORKSPACE_CREATE_FORM > Ctrl+S with empty name shows validation error` — Ctrl+S with empty name; error shown, API not called.
- `TUI_WORKSPACE_CREATE_FORM > Ctrl+S with invalid name format shows validation error` — Type "-invalid-", Ctrl+S; format error shown, API not called.
- `TUI_WORKSPACE_CREATE_FORM > Esc on clean form pops immediately` — Open form, Esc; form popped, no confirmation.
- `TUI_WORKSPACE_CREATE_FORM > Esc on dirty form shows confirmation` — Type in name, Esc; confirmation shown.
- `TUI_WORKSPACE_CREATE_FORM > Esc confirmation y discards` — Dirty form, Esc, y; form popped.
- `TUI_WORKSPACE_CREATE_FORM > Esc confirmation n returns to form` — Dirty form, Esc, n; form still active, content preserved.
- `TUI_WORKSPACE_CREATE_FORM > snapshot selector opens with Enter` — Tab to snapshot, Enter; dropdown opens.
- `TUI_WORKSPACE_CREATE_FORM > snapshot selector j/k navigates` — Open snapshot, j then k; highlight moves between options.
- `TUI_WORKSPACE_CREATE_FORM > snapshot selector Enter confirms selection` — Open snapshot, j, Enter; snapshot selected, dropdown closes.
- `TUI_WORKSPACE_CREATE_FORM > snapshot selector Esc cancels without change` — Open snapshot, j, Esc; selection unchanged.
- `TUI_WORKSPACE_CREATE_FORM > snapshot selector filter with /` — Open snapshot, /, type text; options filtered by name.
- `TUI_WORKSPACE_CREATE_FORM > successful submit navigates to workspace detail` — Fill name, Ctrl+S, API 201; navigates to workspace detail view.
- `TUI_WORKSPACE_CREATE_FORM > successful submit with snapshot` — Fill name, select snapshot, Ctrl+S, API 201; workspace created with snapshot_id.
- `TUI_WORKSPACE_CREATE_FORM > failed submit shows error and re-enables form` — Fill name, Ctrl+S, API 500; error shown, form re-enabled.
- `TUI_WORKSPACE_CREATE_FORM > double submit is prevented` — Ctrl+S twice quickly; only one API call.
- `TUI_WORKSPACE_CREATE_FORM > c keybinding from workspace list opens form` — On workspace list, press c; form pushed.
- `TUI_WORKSPACE_CREATE_FORM > command palette create workspace` — `:`, type "create workspace", Enter; form pushed.
- `TUI_WORKSPACE_CREATE_FORM > name max length enforced` — Type 64 chars; only 63 accepted.
- `TUI_WORKSPACE_CREATE_FORM > R retries after error` — Submit, error, R; re-submits.
- `TUI_WORKSPACE_CREATE_FORM > 409 name conflict shows inline error` — Submit, API 409; inline "already exists" error on name field, name field focused.
- `TUI_WORKSPACE_CREATE_FORM > workspace quota exceeded shows error banner` — Submit, API 403 with quota message; error banner displayed.

### Responsive Tests

- `TUI_WORKSPACE_CREATE_FORM > responsive 80x24 compact layout` — Abbreviated labels, 0 gap, inline snapshot summary.
- `TUI_WORKSPACE_CREATE_FORM > responsive 80x24 snapshot selector inline` — Snapshot selector shows selected value as single-line text, no dropdown overlay.
- `TUI_WORKSPACE_CREATE_FORM > responsive 120x40 standard layout` — Full labels, 1-line gap, dropdown overlay for snapshot.
- `TUI_WORKSPACE_CREATE_FORM > responsive 200x60 expanded layout` — Extra padding, wider inputs, overlay shows up to 12 snapshot items.
- `TUI_WORKSPACE_CREATE_FORM > resize from 120x40 to 80x24 preserves state` — Values and focus preserved through resize.
- `TUI_WORKSPACE_CREATE_FORM > resize from 80x24 to 120x40 expands layout` — Layout expands, labels expand, data preserved.
- `TUI_WORKSPACE_CREATE_FORM > resize below minimum shows warning` — 60×20: "terminal too small" shown.
- `TUI_WORKSPACE_CREATE_FORM > resize back above minimum restores form` — 60×20 → 80×24: form restored with state intact.
- `TUI_WORKSPACE_CREATE_FORM > resize during submission` — Submit at 120×40, resize to 80×24; submission continues normally, provisioning indicator still visible.
