# Implementation Plan: `tui-workflow-log-stream`

This plan breaks down the implementation of the full-screen workflow log viewer for the Codeplane TUI, incorporating the design constraints, SSE streaming logic, and architectural findings from the research phase.

## Phase 1: Types and Utilities

**Step 1: Create Log Viewer Types**
- **File:** `apps/tui/src/screens/Workflows/log-viewer-types.ts`
- **Action:** Define `SearchMatch`, `StepSelectorBarProps`, `LogContentPanelProps`, `SearchOverlayProps`, `GUTTER_WIDTHS`, and `STREAM_COLUMN_WIDTH`.

**Step 2: Create ANSI Stripping Utility**
- **File:** `apps/tui/src/screens/Workflows/strip-ansi.ts`
- **Action:** Implement `stripAnsi(text: string): string` using the regex `\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[^\[\]]` to strip ANSI escape sequences (used strictly for search matching to ensure color codes don't break textual search).

**Step 3: Create Search Utilities**
- **File:** `apps/tui/src/screens/Workflows/search-utils.ts`
- **Action:** Implement `findSearchMatches(lines: LogLine[], query: string): SearchMatch[]` (case-insensitive literal matching on ANSI-stripped text) and `getMatchLineIndex(matches, matchIndex)`.

**Step 4: Create Elapsed Time Hook**
- **File:** `apps/tui/src/screens/Workflows/useElapsedTime.ts`
- **Action:** Implement `useElapsedTime(runStatus, startedAt, completedAt)` using `setInterval` to tick every second for in-progress runs, and returning a static delta for terminal statuses.

## Phase 2: Log Viewer Sub-Components

**Step 5: Create Connection Health Dot**
- **File:** `apps/tui/src/screens/Workflows/ConnectionHealthDot.tsx`
- **Action:** Implement the `ConnectionHealthDot` component. It should render `●` (success/error), `○` (idle), or the `spinnerFrame` (connecting/reconnecting) based on `WorkflowStreamConnectionState`, coloring it via `useTheme()` tokens.

**Step 6: Create Search Overlay**
- **File:** `apps/tui/src/screens/Workflows/SearchOverlay.tsx`
- **Action:** Implement the `SearchOverlay` using `<box>`, `<text>`, and `<input>`. Include the match count indicator (e.g., `1/5`).

**Step 7: Create Step Selector Bar**
- **File:** `apps/tui/src/screens/Workflows/StepSelectorBar.tsx`
- **Action:** Implement the `StepSelectorBar` adapting to `"minimum"`, `"standard"`, and `"large"` breakpoints. Show truncated step names, `getStepStatusIcon`, and the `RunStatusBadge`.

**Step 8: Create Log Content Panel**
- **File:** `apps/tui/src/screens/Workflows/LogContentPanel.tsx`
- **Action:** 
  - Implement manual virtual scrolling by slicing the `lines` array based on `scrollOffset` and `viewportHeight`.
  - Render `LogLineRow` components containing the gutter (line numbers), stream indicator (`stdout`/`stderr`), and the log text.
  - Implement ANSI passthrough by directly passing `content` (replacing non-printable chars with `\uFFFD` except for ANSI escapes) into OpenTUI's `<text>` component.
  - Manage the `autoFollow` ref scroll jumping logic.

## Phase 3: Main Screen Component

**Step 9: Create WorkflowLogViewer Screen**
- **File:** `apps/tui/src/screens/Workflows/WorkflowLogViewer.tsx`
- **Action:** 
  - Orchestrate all sub-components, state (`selectedStepIndex`, `autoFollow`, `searchActive`), and refs (`scrollPositionsRef`).
  - Call `useWorkflowLogStream(owner, repo, runId, ...)`. 
  - *Crucial Fix:* Call `useWorkflowRunDetail({ owner, repo }, runId)` using the correct object signature discovered during research.
  - Register screen keybindings via `useScreenKeybindings`. 
  - *Crucial Fix:* For the jump-to-top binding, use `key: "gg"` to correctly hook into the go-to mode compound sequence normalized by the KeybindingProvider.

## Phase 4: Integration and Routing

**Step 10: Wire Screen Navigation**
- **File:** `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx`
  - **Action:** Add the `l` keybinding to push `ScreenName.WorkflowLogViewer` with `owner`, `repo`, and `runId` params.
- **File:** `apps/tui/src/router/registry.ts`
  - **Action:** Update the `ScreenName.WorkflowLogViewer` entry to use the real component and set `breadcrumbLabel: (params) => \`Run #${params.runId ?? "?"} Logs\``. 
- **File:** `apps/tui/src/navigation/deepLinks.ts`
  - **Action:** Add `"workflow-log": ScreenName.WorkflowLogViewer` alias support to deep links to satisfy `codeplane tui --screen workflow-log`.
- **File:** `apps/tui/src/screens/Workflows/index.ts`
  - **Action:** Export `WorkflowLogViewer`, sub-components, and utils.

## Phase 5: Testing

**Step 11: Implement Unit Tests**
- **Files:** `apps/tui/src/screens/Workflows/__tests__/strip-ansi.test.ts`, `search-utils.test.ts`, `useElapsedTime.test.ts`
- **Action:** Implement the pure function logic tests outlined in the engineering spec.

**Step 12: Implement E2E Test Helpers**
- **File:** `e2e/tui/helpers/workflows.ts`
- **Action:** Create reusable functions `navigateToWorkflowRunDetail(terminal, runIndex?)` and `waitForLogStreaming(terminal, timeoutMs?)`.

**Step 13: Implement E2E Test Suite**
- **File:** `e2e/tui/workflows.test.ts`
- **Action:** Implement the exhaustive 93 LOG-* tests specified in the engineering spec using `@microsoft/tui-test`. Cover SSE lifecycle, real-time streaming, auto-follow, step navigation, search, reconnection, responsive layouts, error handling, edge cases, and snapshot tests.
