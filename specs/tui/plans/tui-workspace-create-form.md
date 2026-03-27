# Implementation Plan: TUI Workspace Creation Form (`tui-workspace-create-form`)

This document outlines the step-by-step implementation plan for the Workspace Creation Form in the Codeplane TUI. It adheres strictly to the provided engineering specifications, leveraging OpenTUI components, `@codeplane/ui-core` data hooks, and `@microsoft/tui-test` for end-to-end testing.

## Step 1: Implement Workspace Name Validation Module
**File:** `apps/tui/src/screens/Workspaces/validation.ts`

Create a pure, framework-agnostic validation module for workspace names to be used for real-time input filtering and pre-flight validation.

- Define constants: `WORKSPACE_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/`, `WORKSPACE_NAME_MAX_LENGTH = 63`, `ALLOWED_CHARS_REGEX = /^[a-z0-9-]$/`.
- Implement `validateWorkspaceName(name: string): ValidationResult` to ensure the name is not empty, within length limits, and matches the regex.
- Implement `filterNameCharacter(char: string): string | null` to filter single keystrokes (lowercasing and rejecting invalid characters).
- Implement `sanitizeNameInput(input: string): string` to process pasted text or full values.

## Step 2: Implement Form State Hook
**File:** `apps/tui/src/screens/Workspaces/useWorkspaceCreateForm.ts`

Create a custom React hook to encapsulate the form's state and business logic.

- Maintain state for `name`, `selectedSnapshotId`, `nameError`, `formError`, `submitting`, and `focusIndex`.
- Implement a `setName` action that utilizes `sanitizeNameInput` for real-time validation.
- Compute an `isDirty` boolean flag based on user input.
- Manage focus cycling (`focusNext`, `focusPrev`) across the 4 form fields (Name, Snapshot, Create, Cancel).
- Implement the `submit` action with double-submit prevention via `useRef(false)`.
- Handle API responses and map errors (e.g., HTTP 401, 403, 409, 422, 429) to user-friendly messages in `formError` or `nameError`.

## Step 3: Implement the Screen Component
**File:** `apps/tui/src/screens/Workspaces/WorkspaceCreateScreen.tsx`

Develop the primary UI component using OpenTUI primitives and connect it to the data hooks.

- **Data Fetching:** Use `useCreateWorkspace` and `useWorkspaceSnapshots` from `@codeplane/ui-core`.
- **UI Layout:** Use OpenTUI's `<box>`, `<scrollbox>`, `<text>`, `<input>`, and `<select>` components to build the form layout. Display form and field errors prominently using `theme.error`.
- **Responsiveness:** Utilize `useResponsiveValue` to adjust `fieldGap`, labels, and `snapshotDropdownHeight` across minimum (80x24), standard (120x40), and large (200x60) terminal sizes.
- **Keybindings:** Register form navigation (`Tab`, `Shift+Tab`), submission (`Ctrl+S`), cancellation (`Esc`), and retry (`R`) using `useScreenKeybindings`.
- **Cancellation Flow:** If `isDirty` is true, trigger a confirmation dialog using `openOverlay("confirm", ...)` before popping the screen.
- **Telemetry & Logging:** Emit lifecycle events (opened, submitted, succeeded, failed, cancelled) using the `emit` function, and log milestones using `logger`.
- **Navigation:** On success, call `replace(ScreenName.WorkspaceDetail, { workspaceId })`.

## Step 4: Setup Barrel Export and Screen Registry
**File 1:** `apps/tui/src/screens/Workspaces/index.ts`
- Export `WorkspaceCreateScreen`, `useWorkspaceCreateForm`, and validation utilities to provide a clean public API for the module.

**File 2:** `apps/tui/src/router/registry.ts`
- Import `WorkspaceCreateScreen`.
- Replace the existing placeholder component for `WorkspaceCreate` with `WorkspaceCreateScreen`.
- Update the registry entry to set `requiresRepo: true`, ensuring navigation requires an owner and repo context.

## Step 5: Implement Entry Point Keybinding
**File:** `apps/tui/src/screens/Workspaces/WorkspaceListKeybindings.ts`

Create a keybinding factory to allow users to navigate to the create form from the workspace list.

- Export `createWorkspaceKeybinding(push, repoContext)` that listens for the `c` key.
- The handler should invoke `push(ScreenName.WorkspaceCreate, { owner, repo, entry_point: "keybinding" })`.
- Ensure the keybinding is only active (`when`) if `repoContext` is not null.

## Step 6: Write Comprehensive E2E Tests
**File:** `e2e/tui/workspaces.test.ts`

Implement end-to-end tests using `@microsoft/tui-test` to validate the UI, keyboard interactions, and responsive design against a real API server.

- **Snapshot Tests:** Verify rendering at 80x24, 120x40, and 200x60 breakpoints. Validate empty state, validation errors, server errors, submitting state, and dropdown expanded state. Check that breadcrumbs render correctly.
- **Keyboard Interaction Tests:** Test `Tab`/`Shift+Tab` cycling, real-time input sanitization (lowercasing, rejecting invalid characters), `Ctrl+S` submission flows (from different fields), and `Esc` confirmation logic. Verify successful navigation to the detail screen on success.
- **Responsive Tests:** Validate layout changes when resizing the terminal (e.g., from 120x40 to 80x24 and below the minimum threshold). Ensure form state is preserved during resizing.
- **Error Handling Tests:** Simulate 401, 409 (name conflicts), and quota exceeded errors to ensure appropriate feedback is displayed.