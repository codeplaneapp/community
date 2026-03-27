# Implementation Plan: `tui-workflow-run-detail`

This document provides a step-by-step implementation plan for the `tui-workflow-run-detail` ticket, implementing the workflow run detail screen with a step list, inline log expansion, and SSE streaming.

## 1. Create Hooks

Create the state management and logic hooks in `apps/tui/src/screens/Workflows/hooks/`.

### 1.1 `useElapsedTime.ts`
**Path:** `apps/tui/src/screens/Workflows/hooks/useElapsedTime.ts`
- Implement a `useElapsedTime` hook taking `startedAt`, `completedAt`, and `isLive`.
- Use a `setInterval(1000)` internally to update the elapsed time in seconds.
- Return the elapsed time as a `number | null`.
- Make sure to clear the interval on unmount or when `isLive` becomes false.

### 1.2 `useStepNavigation.ts`
**Path:** `apps/tui/src/screens/Workflows/hooks/useStepNavigation.ts`
- Implement `useStepNavigation` taking `nodes: WorkflowRunNode[]`.
- Manage `focusedId`, `focusedIndex`, `expandedIds` (Set), and `expandOrder` (Array).
- Expose methods: `focusNext`, `focusPrev`, `focusFirst`, `focusLast`, `toggleExpand(id?)`, `collapseLatest`, `collapseAll`, `pageDown`, `pageUp`.
- `collapseLatest()` must return a boolean indicating if an item was actually collapsed (for the Esc priority chain).

### 1.3 `useRunActions.ts`
**Path:** `apps/tui/src/screens/Workflows/hooks/useRunActions.ts`
- Implement `useRunActions` taking `repo: RepoIdentifier`, `runId: number`, and `status: WorkflowRunStatus`.
- Integrate `@codeplane/ui-core` mutations (or TUI wrappers): `useWorkflowRunCancel`, `useWorkflowRunRerun`, `useWorkflowRunResume`.
- Manage state for action confirmation (`pendingAction: "cancel" | "rerun" | "resume" | null`).
- Expose functions to initiate an action (`requestAction(type)`), confirm (`confirmAction()`), and dismiss (`dismissAction()`), plus loading/error states.

### 1.4 `useRunDetailState.ts`
**Path:** `apps/tui/src/screens/Workflows/hooks/useRunDetailState.ts`
- Create the orchestrator hook `useRunDetailState` taking `repo`, `runId`.
- Call `useWorkflowRunDetail` to fetch data.
- Derive `isLive` based on `run.status` and `TERMINAL_STATUSES`.
- Call `useWorkflowLogStream` if `isLive` is true.
- Call `useElapsedTime`, `useStepNavigation`, and `useRunActions`.
- Merge SSE status (`runStatus`, `steps` map) with API data to compute `effectiveRunStatus` and effective node states.
- Return a combined state object for the screen component.

### 1.5 Export Hooks
**Path:** `apps/tui/src/screens/Workflows/hooks/index.ts`
- Barrel export the newly created hooks.

## 2. Create Sub-Components

Create the UI sub-components in `apps/tui/src/screens/Workflows/components/`.

### 2.1 `RunHeader.tsx`
**Path:** `apps/tui/src/screens/Workflows/components/RunHeader.tsx`
- Props: `run`, `workflow`, `elapsed`, `breakpoint`.
- Render run status badge (using `getRunStatusIcon`), workflow name, run number, head branch, commit SHA (`abbreviateSHA`), and elapsed time (`formatDuration`).
- Adjust layout between minimum (1 line) and standard/large (2 lines) breakpoints.

### 2.2 `StepRow.tsx`
**Path:** `apps/tui/src/screens/Workflows/components/StepRow.tsx`
- Props: `node`, `focused` (boolean), `expanded` (boolean), `breakpoint`, `spinnerFrame`.
- Render a row with the step status icon (`getStepStatusIcon`), step name, and duration.
- Apply reverse video or primary background color if `focused`.
- Truncate name and omit duration at `minimum` breakpoint.

### 2.3 `InlineLogPanel.tsx`
**Path:** `apps/tui/src/screens/Workflows/components/InlineLogPanel.tsx`
- Props: `stepId`, `logs`, `stepState`, `autoFollow`, `breakpoint`.
- Use `<box>` with a left border. If stderr is detected or step failed, make the border red.
- Map `logs` to `<text>` or `<code>` elements.
- Render line numbers on the left (width varies by breakpoint: 4/6/8 chars).
- Include an auto-scroll mechanism or prompt if `autoFollow` is on.

### 2.4 `DispatchInputsSection.tsx`
**Path:** `apps/tui/src/screens/Workflows/components/DispatchInputsSection.tsx`
- Props: `inputs`, `visible`, `breakpoint`.
- Render a key-value list of dispatch inputs if `visible` is true.

### 2.5 `ActionConfirmOverlay.tsx`
**Path:** `apps/tui/src/screens/Workflows/components/ActionConfirmOverlay.tsx`
- Props: `action`, `onConfirm`, `onDismiss`, `isLoading`, `error`.
- Use `<Modal>` component.
- Display appropriate title/message based on `action` ("Cancel Run?", "Rerun Workflow?", "Resume Run?").
- Include a submit button showing spinner if `isLoading`. Display `error` text if present.

### 2.6 Export Components
**Path:** `apps/tui/src/screens/Workflows/components/index.ts`
- Barrel export the newly created components.

## 3. Implement Main Screen

### 3.1 `WorkflowRunDetailScreen.tsx`
**Path:** `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx`
- Replace the existing placeholder file.
- Use `useLayout` to get the current terminal dimensions and `breakpoint`.
- Extract `entry.params` (`runId`, `owner`, `repo`).
- Call `useRunDetailState` to get all orchestrated state.
- Render `<FullScreenLoading>` if fetching.
- Render `<FullScreenError>` if error or 404.
- If ready, render the main layout:
  - Header (`<RunHeader>`)
  - Dispatch inputs (`<DispatchInputsSection>`)
  - List of steps mapped over `nodes`, rendering `<StepRow>` and conditionally `<InlineLogPanel>` below it if expanded.
  - Wrap the content in a `<scrollbox>` with `ref`.
- Render `<ActionConfirmOverlay>` conditionally or manage it via `useOverlay` context.
- Call `useScreenKeybindings` with the following bindings:
  - `j`/`k` / `Down`/`Up`: `focusNext`, `focusPrev`
  - `Enter`: `toggleExpand()`
  - `l`: push to `workflow-log-viewer` if step focused
  - `f`: toggle auto-follow
  - `e`: toggle dispatch inputs
  - `c`: request 'cancel'
  - `r`: request 'rerun'
  - `R`: request 'resume'
  - `Esc`: `collapseLatest()`, if false, `navigation.pop()`
  - `G`, `g g`, `Ctrl+D`, `Ctrl+U`: pagination/jump
- Update status bar hints based on state.

## 4. End-to-End Tests

### 4.1 `workflows.test.ts`
**Path:** `e2e/tui/workflows.test.ts`
- Create the test file if it doesn't exist, or append to it.
- Add Snapshot Tests (`SNAP-WRD-...`):
  - Standard layout rendering.
  - Expanded step log panel.
  - Minimum breakpoint truncation.
- Add Keyboard Interaction Tests (`KEY-WRD-...`):
  - `j/k` navigation.
  - `Enter` toggles expansion.
  - `Esc` priority chain (collapse then pop).
- Add Responsive Tests (`RSP-WRD-...`):
  - Resize to 80x24 and verify sidebar/columns hide.
- Add Integration Tests (`INT-WRD-...`):
  - SSE simulated updates.
  - Action confirmation flows (cancel/rerun/resume).
- Add Edge Case Tests (`EDGE-WRD-...`):
  - 404 run not found.
  - Reconnection failure.