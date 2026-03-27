# Implementation Plan: `tui-issue-create-form`

This document outlines the step-by-step implementation plan for the full-screen issue creation form within the Codeplane TUI, fulfilling the `tui-issue-create-form` specification.

## 1. Core State Hooks

### 1.1 Form State Management (`apps/tui/src/hooks/useFormState.ts`)
- **Action:** Create `useFormState.ts`.
- **Description:** Implement a generic, reusable form state manager that tracks values, validation errors, focus index, submission state, and dirty state.
- **Key Features:**
  - Track `values` and `errors` with TypeScript generics.
  - Handle focus indexing (`focusNext`, `focusPrev`) supporting modular arithmetic.
  - Provide a `validate()` function that checks `required` fields and custom validation functions, setting focus to the first errored field.
  - Maintain `isDirty`, `isSubmitting`, and `submissionError` states.

### 1.2 Selector State Management (`apps/tui/src/hooks/useSelectorState.ts`)
- **Action:** Create `useSelectorState.ts`.
- **Description:** Implement `useSingleSelector` and `useMultiSelector` hooks to manage dropdown state for assignees, labels, and milestones.
- **Key Features:**
  - Manage `isOpen`, `highlightIndex`, `filterQuery`, and `selected` items (string or Set).
  - Filter options based on the `filterQuery`.
  - Provide navigation and selection helpers: `moveHighlightUp`, `moveHighlightDown`, `selectHighlighted`, `confirmSelection`.

## 2. Reusable UI Components

### 2.1 Selector Dropdown (`apps/tui/src/components/SelectorDropdown.tsx`)
- **Action:** Create `SelectorDropdown.tsx`.
- **Description:** A visual dropdown overlay rendered inline for selector fields.
- **Key Features:**
  - Renders an OpenTUI `<box>` with a `<scrollbox>` showing filtered options up to a `maxVisible` limit.
  - Displays a filter input query if active.
  - Highlights the actively focused item using the theme's `primary` color.
  - For multi-select, displays `[✓]` or `[ ]` indicators.
  - Supports optional colored dots (`showColorDot`) for labels.

### 2.2 Component Barrel Exports (`apps/tui/src/components/index.ts`)
- **Action:** Update `apps/tui/src/components/index.ts`.
- **Description:** Export `SelectorDropdown`.

### 2.3 Hook Barrel Exports (`apps/tui/src/hooks/index.ts`)
- **Action:** Update `apps/tui/src/hooks/index.ts`.
- **Description:** Export `useFormState`, `useSingleSelector`, `useMultiSelector`, and associated types.

## 3. Screen Implementation

### 3.1 Issue Create Form Screen (`apps/tui/src/screens/Issues/IssueCreateForm.tsx`)
- **Action:** Create `IssueCreateForm.tsx`.
- **Description:** Build the main full-screen React component for issue creation.
- **Key Integration Points:**
  - **Data:** Consume `@codeplane/ui-core` hooks (`useCreateIssue`, `useRepoLabels`, `useRepoMilestones`, `useRepoCollaborators`).
  - **Layout:** Use `useLayout()` to adapt body height and label truncation based on breakpoints (`compact`, `standard`, `large`).
  - **Form State:** Initialize `useFormState` with title, body, assignees, labels, and milestone fields.
  - **Keybindings:** Use `useScreenKeybindings` to map form-level controls (`Tab`, `Shift+Tab`, `Ctrl+S`, `Esc`, `Enter`, `Space`, `/`, `j`, `k`, `R`, `y`, `n`).
  - **Telemetry & Logging:** Emit `tui.issue_create_form.opened`, `submitted`, `succeeded`, `failed`, `cancelled`, and `validation_error` events using `emit()`. Log lifecycle events using `logger`.
  - **Error Handling:** Map 401, 403, 413, 422, and 429 API errors to appropriate user-facing messages. Display a discard confirmation banner when canceling a dirty form.

### 3.2 Screen Exports (`apps/tui/src/screens/Issues/index.ts`)
- **Action:** Create or update `index.ts` in the `Issues` directory.
- **Description:** Export `IssueCreateForm`.

## 4. Routing and Navigation

### 4.1 Update Router Registry (`apps/tui/src/router/registry.ts`)
- **Action:** Modify `registry.ts`.
- **Description:** Replace the `PlaceholderScreen` mapped to `ScreenName.IssueCreate` with the new `IssueCreateForm` component.

### 4.2 Command Palette Registration (`apps/tui/src/commands/issue-commands.ts`)
- **Action:** Create or append to `issue-commands.ts`.
- **Description:** Register the `issue.create` command so users can launch the form via the `:` command palette, dispatching `nav.push(ScreenName.IssueCreate, ...)`.

## 5. End-to-End Testing

### 5.1 Create E2E Test Suite (`e2e/tui/issues.test.ts`)
- **Action:** Implement E2E tests using `@microsoft/tui-test`.
- **Description:** Ensure terminal snapshots and keyboard interactions are robustly verified.
- **Test Coverage:**
  - **Snapshots:** Empty form at `120x40`, `80x24`, `200x60`, validation errors, server error banners, and selector dropdown expansions.
  - **Interactions:** `Tab`/`Shift+Tab` cycling, `Enter` to insert body newlines, `Ctrl+S` submission states, `Esc` discard confirmation flows, and `Space` selection toggling.
  - **Responsiveness:** Verify the form degrades gracefully to abbreviated labels and compact fields at `80x24`, and scales up properly at larger bounds.
  - **Backend Stubs:** Tests relying on missing backend endpoints will intentionally result in failing API calls which the form error handling will process and render, matching the snapshot expectations for failures.