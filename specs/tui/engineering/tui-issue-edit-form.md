# TUI_ISSUE_EDIT_FORM — Engineering Specification

## 1. Overview

The Issue Edit Form is a full-screen overlay in the Codeplane TUI that allows developers to update an existing issue's title, body, labels, assignees, and milestone. It relies on the OpenTUI component primitives (`<box>`, `<input>`, `<textarea>`, `<select>`) and `@codeplane/ui-core` data hooks to interact with the API. The form is designed for keyboard-first navigation, implementing robust dirty-tracking to generate minimal delta `PATCH` requests.

## 2. System Architecture Integration

### Navigation & Context
The screen pushes onto the stack via the `NavigationProvider`. It requires `owner`, `repo`, and `number` parameters.
- **Entry Points:** 
  - Issue Detail View (`e` keybinding)
  - Issue List View (`e` keybinding on focused row)
  - Command Palette (`:edit issue`)
- **Breadcrumb:** `Dashboard > {owner}/{repo} > Issues > #{number} > Edit`

### Data Layer (`@codeplane/ui-core`)
- `useIssue(owner, repo, number)`: Fetches initial state and populates the form.
- `useUpdateIssue(owner, repo, number)`: Executes the `PATCH` request. Must only be sent fields that differ from the initial `useIssue` payload.
- `useLabels(owner, repo)`: Fetches labels for the multi-select overlay.
- `useCollaborators(owner, repo)`: Fetches users for the assignee multi-select overlay.
- `useMilestones(owner, repo)`: Fetches milestones for the single-select overlay.

### Layout & Responsive Breakpoints
Driven by `useTerminalDimensions()` and the TUI's internal layout definitions:
- **Minimum (80x24):** Single column. `textarea` locked to 6 lines. Labels abbreviated (`Lbl:`, `Asgn:`, `MS:`). Metadata selectors truncate text heavily.
- **Standard (120x40):** Full labels. `textarea` 12 lines. Inline metadata rendering accommodates up to 5 label badges before overflowing to `+N more`.
- **Large (200x60+):** `textarea` up to 20 lines. Title input width capped at 80% to avoid extreme stretch.

## 3. State Management & Interaction Model

### Form State
The local state must track both the *current* form values and the *original* values to compute dirtiness.
```typescript
interface IssueFormState {
  title: string;
  body: string;
  labels: Set<string>; // ID or Name references
  assignees: Set<string>; // Usernames
  milestone: string | null; // Milestone ID or null
}
```
- **Dirty Check:** Computed synchronously: `isDirty = current.title !== original.title || ...`
- **Delta Payload:** On submit, build a partial object of `IssueFormState` containing only keys where `current[key] !== original[key]`.

### Focus Management
The screen maintains a `focusedFieldIndex` (0 to 6) representing:
0: Title (`<input>`)
1: Body (`<textarea>`)
2: Labels (Interactive `<text>` block)
3: Assignees (Interactive `<text>` block)
4: Milestone (Interactive `<text>` block)
5: Save Button
6: Cancel Button

### Keybinding Priority Stack
Handled via the standard `KeybindingProvider` priority system:
1. **Text Input:** When Title or Body is focused, printable characters are consumed. `Esc`, `Ctrl+S`, `Tab`, `Shift+Tab` propagate up.
2. **Modal Overlays:** If a select overlay or discard confirmation is open, it traps focus. `Esc` dismisses it. `j/k`, `Space`, `Enter` navigate options.
3. **Screen Scope:**
   - `Tab` / `Shift+Tab`: Increments/decrements `focusedFieldIndex` (modulo 7).
   - `Ctrl+S`: Triggers `onSubmit`.
   - `Enter`: If focus is on index 2, 3, or 4, opens corresponding Select Overlay. If 5, submits. If 6, triggers cancel flow.
   - `Esc`: Triggers cancel flow (checks `isDirty`).

## 4. Component Design

### `IssueEditScreen`
The root component for this view.
- Wraps the UI in `<box flexDirection="column">`.
- Manages `useIssue` query. Renders a loading skeleton until the initial data is ready.
- Defines `useScreenKeybindings` for the form.
- Manages the visual focus indicator (primary border color and `▸` prefix).

### Select Overlays
Built using the TUI `ModalSystem` (`<box position="absolute" zIndex={10}>`).
- **`LabelSelectOverlay`**: Uses `<scrollbox>` with a list of labels. Supports multi-select via `Space`. Pre-selects items based on current form state.
- **`AssigneeSelectOverlay`**: Similar to labels. Includes an explicit "Unassigned" toggle to clear all.
- **`MilestoneSelectOverlay`**: Single-select. Navigating and pressing `Enter` closes the modal and updates state. Includes "None" option.

### Discard Confirmation Dialog
Rendered conditionally when `cancelFlow` is triggered and `isDirty === true`.
- Centers a small modal: `Discard unsaved changes? [y/N]`.
- Captures `y` (pop screen) and `n`/`Esc` (close dialog, return to form).

## 5. Error Handling & Resilience

- **API Errors (4xx/5xx):** Handled during the mutation. If `useUpdateIssue` throws, set a local `error` state. Render a red `<text>` block above the Title field. Re-enable form inputs.
- **409 Conflict:** Specifically parsed. Render: `"Error: Issue modified by another user. Press R to reload or Esc to discard."`
- **Validation Errors:** If Title is empty, client-side validation prevents submission and highlights the Title border in red.
- **Metadata API Failures:** If `useLabels` fails, the Label field gracefully degrades (disabled, or shows an error inline when focused) but does not block editing other fields.

## 6. Telemetry

- `tui.issue.edit_form.opened`: Fired on mount.
- `tui.issue.edit_form.saved`: Fired on successful mutation. Include `fields_changed` array and `duration_ms`.
- `tui.issue.edit_form.save_failed`: Include `error_code`.
- `tui.issue.edit_form.discard_confirmed`: Track aborted workflows.

## 7. Implementation Plan

1.  **Scaffolding & Routing:** 
    - Add `IssueEdit` to the ScreenRegistry.
    - Implement `IssueEditScreen.tsx` with basic parameters extraction (`owner`, `repo`, `number`).
    - Wire up `e` keybindings in `IssueDetailScreen` and `IssueListScreen` to push this screen.
2.  **State & Data Loading:**
    - Implement `useIssue` data fetching with a full-screen loading state.
    - Create the local state tracker that seeds from `useIssue` data.
3.  **Form Layout & Navigation:**
    - Render the vertical flex layout.
    - Implement Title (`<input>`) and Body (`<textarea>`).
    - Build the `focusedFieldIndex` state and wire `Tab` / `Shift+Tab` bindings.
    - Implement active field highlighting (ANSI 33 primary border vs ANSI 240 border).
4.  **Metadata Fields & Overlays:**
    - Implement the inline visual representation for Labels, Assignees, and Milestones, obeying breakpoint truncation rules.
    - Implement the three Modal overlays.
    - Wire `Enter` key on metadata fields to open the respective modal, and handle state updates on modal confirmation.
5.  **Submission Logic:**
    - Implement the `Ctrl+S` and Save button `Enter` handlers.
    - Build the delta calculator to strip unmodified fields.
    - Execute `useUpdateIssue`. Handle loading state (disable inputs, change Save button text).
    - On success, `pop()` navigation stack and invalidate issue cache.
6.  **Cancel & Discard Flow:**
    - Implement the `Esc` and Cancel button handlers.
    - Wire up the dirty check.
    - Implement the `DiscardConfirmDialog` modal and its keybindings (`y`, `n`, `Esc`).
7.  **Error Handling & Polish:**
    - Add inline error banners for mutation failures.
    - Handle client-side validation (empty title).
    - Test responsive resize triggers (`useOnResize`).

## 8. Unit & Integration Tests

All tests target `e2e/tui/issues-edit.test.ts` using `@microsoft/tui-test`.

### Snapshot Tests
- `TUI_ISSUE_EDIT_FORM — renders edit form at 120x40 with all fields pre-populated`
- `TUI_ISSUE_EDIT_FORM — renders edit form at 80x24 minimum size` (asserts abbreviated labels and 6-line textarea)
- `TUI_ISSUE_EDIT_FORM — renders edit form at 200x60 large size`
- `TUI_ISSUE_EDIT_FORM — renders label select overlay`
- `TUI_ISSUE_EDIT_FORM — renders discard confirmation dialog`
- `TUI_ISSUE_EDIT_FORM — renders title validation error for empty title`

### Interaction Tests
- `TUI_ISSUE_EDIT_FORM — Tab cycles through all form fields in order`
- `TUI_ISSUE_EDIT_FORM — Shift+Tab cycles backward through fields`
- `TUI_ISSUE_EDIT_FORM — Enter on labels opens overlay, Space toggles, Enter confirms`
- `TUI_ISSUE_EDIT_FORM — Esc with no changes pops screen immediately`
- `TUI_ISSUE_EDIT_FORM — Esc with changes shows discard dialog, n returns to form`
- `TUI_ISSUE_EDIT_FORM — y in discard dialog discards and pops`
- `TUI_ISSUE_EDIT_FORM — Ctrl+S from body field submits form and pops on success`
- `TUI_ISSUE_EDIT_FORM — only modified fields included in PATCH payload` (assert against mock API interceptor)
- `TUI_ISSUE_EDIT_FORM — 409 on save shows conflict error banner`