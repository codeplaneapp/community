# Implementation Plan: TUI Agent Session Create

**Ticket:** `tui-agent-session-create`
**Goal:** Implement agent session creation (inline + modal) for the Codeplane TUI using React 19, OpenTUI components, and `@codeplane/ui-core` hooks.

This plan breaks down the implementation into vertical, testable slices. All TUI code will be placed in `apps/tui/src/` and E2E tests in `e2e/tui/`.

## Step 1: Types and Constants

**Target File:** `apps/tui/src/screens/Agents/types.ts`

Append the required types for the session creation domain to the existing types file. This ensures all agent-related models are co-located.

- Add `InlineCreateState` union type (`"hidden" | "editing" | "submitting" | "error"`).
- Add `InlineSessionCreateProps` interface.
- Add `AgentSessionCreateModalProps` interface.
- Add `CreateErrorType` union for telemetry and error handling.

## Step 2: Utilities

**Target File 1:** `apps/tui/src/screens/Agents/utils/classifyCreateError.ts`
- Implement a pure function `classifyCreateError(error: unknown)` that maps API errors from `useCreateAgentSession` (400, 401, 403, 409, 429, etc.) to user-facing messages and `CreateErrorType`.

**Target File 2:** `apps/tui/src/screens/Agents/utils/createLayoutConfig.ts`
- Implement `getCreateLayoutConfig(breakpoint: Breakpoint)` to return padding, modal width/height, and placeholder truncation settings based on terminal size (`minimum`, `standard`, `large`).
- Implement `computeModalWidth(terminalWidth: number, percent: number)`.

## Step 3: Inline Session Create Component

**Target File:** `apps/tui/src/screens/Agents/components/InlineSessionCreate.tsx`

Implement the inline creation form that renders at the top of the session list.

- **State:** Use `useState` for title, state machine (`InlineCreateState`), and errors. Use `useRef` to prevent double-submissions.
- **Data Fetching:** Consume `useCreateAgentSession(owner, repo)` from `@codeplane/ui-core`.
- **Keyboard Handling:** Use `@opentui/react`'s `useKeyboard` to handle `Enter` (submit) and `Escape` (cancel).
- **Rendering:** Use OpenTUI's `<box>`, `<text>`, and `<input>`.
- **Productionization:** Use `Intl.Segmenter` to safely enforce a 255 grapheme maximum length on the input title.

## Step 4: Modal Session Create Component

**Target File:** `apps/tui/src/screens/Agents/AgentSessionCreateModal.tsx`

Implement the modal overlay triggered via the Command Palette.

- **Layout:** Use `<box position="absolute" top="center" left="center" ...>` to center the modal over the current screen.
- **Focus Management:** Implement focus trapping using a `focusIndex` state (0: Input, 1: Create button, 2: Cancel button). Handle `Tab` and `Shift+Tab` to cycle focus. Consume all `Tab` events to prevent them from bubbling.
- **Submission:** Share the same validation, submission logic, and minimum 100ms display time as the inline component.

## Step 5: Command Palette Registration

**Target File:** `apps/tui/src/commands/agentCommands.ts`

- Update or create the `create-agent-session` command entry to use the modal overlay.
- Action: `context.openModal("agent-session-create", { owner, repo })`.
- Ensure it requires repository context and write access.

## Step 6: Session List Integration & Routing

**Target File 1:** `apps/tui/src/screens/Agents/AgentSessionListScreen.tsx`
- Add local state `showInlineCreate`.
- Replace the stubbed `handleCreate` to toggle `showInlineCreate`.
- Render `<InlineSessionCreate>` conditionally above the list.
- Dim the `<scrollbox>` (e.g., `opacity={showInlineCreate ? 0.5 : 1.0}`) when the inline input is active.
- Pass `isInlineCreateActive={showInlineCreate}` to `useSessionListKeybindings`.

**Target File 2:** `apps/tui/src/screens/Agents/hooks/useSessionListKeybindings.ts`
- Update the hook signature to accept `isInlineCreateActive: boolean`.
- Early-return/noop all list navigation and action keys (j, k, /, etc.) when `isInlineCreateActive` is true, allowing the `<input>` to receive them.

**Target File 3:** `apps/tui/src/router/screens.ts`
- Add `AgentChat: "AgentChat"` to `SCREEN_IDS`.
- Register `AgentChat` in `screenRegistry` using a placeholder component so the router can successfully navigate to it upon creation.

**Target File 4:** Exports
- Add `export { InlineSessionCreate }` in `apps/tui/src/screens/Agents/components/index.ts`.
- Add `export { AgentSessionCreateModal }` in `apps/tui/src/screens/Agents/index.ts`.

## Step 7: End-to-End Testing

**Target File:** `e2e/tui/agents.test.ts`

Implement the full suite of E2E tests using `@microsoft/tui-test`. Do not mock the API; let them fail if the backend is unimplemented.

- **Snapshot Tests:** Capture Golden terminal outputs for inline and modal components across different states (empty, typing, creating, error) and dimensions (80x24, 120x40, 200x60).
- **Interaction Tests:** Verify keyboard flows (e.g., `n` to open inline, `Esc` to cancel, `Enter` to submit). Verify focus cycling in the modal (`Tab`/`Shift+Tab`).
- **Integration Tests:** Verify navigation to the `AgentChat` screen on success. Verify error handling (400, 401, 403, 429, 500).
- **Edge Cases:** Verify whitespace-only inputs are ignored, max length enforcement, and rapid double-submit prevention.
