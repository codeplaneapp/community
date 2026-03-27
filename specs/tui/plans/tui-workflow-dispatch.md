# Implementation Plan: `tui-workflow-dispatch`

This document outlines the step-by-step implementation plan for the `tui-workflow-dispatch` ticket, which introduces a workflow dispatch modal with dynamic form generation, ref selection, and input type resolution to the Codeplane TUI.

## Prerequisites

Before implementing the dispatch overlay, ensure the following foundational dependencies are present in the `apps/tui/src/` directory. If they only exist as specifications in `specs/tui/`, they must be copied or implemented first:
- **`tui-workflow-data-hooks`**: Ensure `workflow-types.ts`, `useDispatchWorkflow.ts`, and `useWorkflowDefinitions.ts` are available in `apps/tui/src/hooks/`.
- **`tui-modal-component`**: Ensure `<Modal>` component (`components/Modal.tsx`) and `useModal` hook (`hooks/useModal.ts`) are implemented.
- **`tui-workflow-list-screen`**: Ensure `WorkflowListScreen.tsx` exists as the integration point.

## Step 1: Define Dispatch Overlay Types
**Target:** `apps/tui/src/screens/Workflows/components/DispatchOverlay.types.ts`

1.  Create the `DispatchOverlay.types.ts` file.
2.  Define the `DispatchInputType` union type (`"string" | "boolean" | "choice"`).
3.  Define the `ParsedDispatchInput` interface capturing `key`, `type`, `defaultValue`, `description`, and `options`.
4.  Define the `DispatchOverlayProps` interface for the modal component's props.
5.  Define the internal `DispatchFormState` interface managing `ref`, `inputValues`, `errors`, `focusIndex`, `isSubmitting`, and `submitError`.
6.  Export constants: `MAX_RENDERED_INPUTS` (20), `MAX_REF_LENGTH` (255), `MAX_INPUT_VALUE_LENGTH` (1000), and `STATUS_FLASH_DURATION_MS` (3000).

## Step 2: Implement Input Type Resolution Hook
**Target:** `apps/tui/src/screens/Workflows/hooks/useDispatchInputs.ts`

1.  Create `useDispatchInputs.ts`.
2.  Implement the `resolveInputType` helper to map `workflow.config` shapes to `DispatchInputType` (e.g., boolean, choice with options, string fallback).
3.  Implement the `resolveDefaultValue` helper to extract appropriate string representations of default values based on the resolved type.
4.  Implement and export the `useDispatchInputs` hook:
    - Safely parse `workflow.config` (handling both JSON string and object).
    - Gracefully degrade to an empty inputs array if parsing fails or `workflow_dispatch` trigger is absent.
    - Return `inputs` (sliced to `MAX_RENDERED_INPUTS`), `totalInputCount`, `isDispatchable`, and `isTruncated`.

## Step 3: Implement Form State Management Hook
**Target:** `apps/tui/src/screens/Workflows/hooks/useDispatchForm.ts`

1.  Create `useDispatchForm.ts`.
2.  Implement an internal `validateRef` function to ensure the ref meets bookmark name rules (no `..`, no control characters, no leading/trailing slashes, max length).
3.  Implement and export `useDispatchForm` hook:
    - Initialize form state for `ref`, `inputValues` (from parsed defaults), `errors`, and `focusIndex`.
    - Setup the `useDispatchWorkflow` mutation, handling `onSuccess` and `onError` callbacks.
    - Use a stable `useRef` (`isSubmittingRef`) to prevent double submissions synchronously.
    - Implement setter functions (`setRef`, `setInputValue`) with value clamping based on maximum lengths.
    - Implement focus navigation helpers (`focusNext`, `focusPrev`).
    - Implement `handleSubmit` logic to construct the API payload, resolving boolean strings to actual booleans, and defaulting an empty ref to `"main"`.
    - Implement `handleApiError` to map HTTP status codes (400, 401, 403, 404, 409, 429, 500) to user-facing strings.

## Step 4: Implement Status Flash Hook
**Target:** `apps/tui/src/screens/Workflows/hooks/useStatusFlash.ts`

1.  Create `useStatusFlash.ts`.
2.  Implement `useStatusFlash` hook to manage short-lived status bar notifications.
3.  Provide a `showFlash` function accepting a message, color (`"success" | "warning" | "error"`), and duration in milliseconds.
4.  Manage standard `setTimeout` cleanup to prevent memory leaks and dangling state.

## Step 5: Implement Boolean Toggle Component
**Target:** `apps/tui/src/screens/Workflows/components/BooleanToggle.tsx`

1.  Create `BooleanToggle.tsx`.
2.  Implement the `BooleanToggle` presentation component rendering `[true]` or `[false]` strings.
3.  Use OpenTUI's `<box>` and `<text>` primitives to layout the label, the toggle box, and an optional description.
4.  Apply `theme.primary` border color when the component is focused and `theme.border` when unfocused.

## Step 6: Implement Dispatch Overlay Component
**Target:** `apps/tui/src/screens/Workflows/components/DispatchOverlay.tsx`

1.  Create `DispatchOverlay.tsx`.
2.  Initialize the necessary hooks: `useTheme`, `useLayout`, `useSpinner`, `useDispatchInputs`, and `useDispatchForm`.
3.  Implement `handleEnter` and `handleSpace` keybinding logic specifically checking the type of the currently focused field (e.g., executing dispatch on buttons, toggling booleans, but ignoring events on standard string/choice inputs).
4.  Construct the `KeyHandler` array for the `<Modal>` component to intercept `Tab`, `Shift+Tab`, `Ctrl+S`, `Enter`, and `Space` at `PRIORITY.MODAL`.
5.  Build the UI structure:
    - Wrap the content in the `<Modal>` component with responsive width (90% minimum, 50% standard/large) and `height="auto"`.
    - Render the workflow name and the Ref input field.
    - Wrap the dynamic inputs in a `<scrollbox scrollY={true} flexGrow={1}>`.
    - Loop over `inputs` to render `<BooleanToggle>`, OpenTUI `<select>` (for choice), or OpenTUI `<input>` (for string) based on the resolved type.
    - Hide descriptions conditionally if `layout.breakpoint === "minimum"`.
    - Render the "Dispatch" and "Cancel" action buttons, utilizing the spinner frame when submitting.
    - Render inline errors below the buttons if `submitError` is present.

## Step 7: Wire Dispatch Overlay into WorkflowListScreen
**Target:** `apps/tui/src/screens/Workflows/WorkflowListScreen.tsx`

1.  Open `WorkflowListScreen.tsx`.
2.  Initialize `useModal` and `useStatusFlash`.
3.  Locate the currently focused workflow definition in the list state.
4.  Implement the `handleDispatchPress` function:
    - Verify write access and show a `warning` status flash if denied.
    - Call `useDispatchInputs` on the focused workflow and verify `isDispatchable`. Show a `warning` status flash if it lacks a `workflow_dispatch` trigger.
    - Open the modal if validation passes.
5.  Register the `d` keybinding via `useScreenKeybindings` at `PRIORITY.SCREEN`, ensuring the `when` predicate suppresses the key if the modal is currently open.
6.  Render the `<DispatchOverlay>` component in the return tree, passing the modal state, workflow, repository context, and a success callback that triggers a `workflowRuns.refetch()` and shows a `success` status flash.

## Step 8: Implement E2E Tests
**Target:** `e2e/tui/workflows.test.ts`

1.  Open `e2e/tui/workflows.test.ts`.
2.  Add fixture data: `DISPATCHABLE_WORKFLOW`, `NON_DISPATCHABLE_WORKFLOW`, and `createManyInputsWorkflow` helper in `e2e/tui/helpers/workflows.ts`.
3.  Implement Snapshot Tests (16 tests, `SNAP-WFD-*`): Validate the visual layout of the overlay across different terminal breakpoints (80x24, 120x40, 200x60), spinner states, inline errors, and dropdown menus.
4.  Implement Keyboard Interaction Tests (28 tests, `KEY-WFD-*`): Simulate sequence of inputs verifying `d` opening logic, `Esc`/Cancel logic, form cyclical navigation with `Tab`/`Shift+Tab`, toggle mechanics with `Space`/`Enter`, and submission bindings.
5.  Implement Responsive Tests (8 tests, `RESP-WFD-*`): Validate that dynamic resizing handles truncation gracefully and dismisses the overlay or displays "Terminal too small" effectively.
6.  Implement Integration Tests (14 tests, `INT-WFD-*`): Ensure successful `POST` operations refresh the list context appropriately, test handling of empty optional inputs, and validate all inline error mappings (400, 401, 403, 404, 409, 429, and timeouts).
7.  Implement Edge Case Tests (10 tests, `EDGE-WFD-*`): Verify input truncation over 20 fields, handling of malformed JSON strings, string length clamping, missing options fallbacks, and invalid unicode behaviors.