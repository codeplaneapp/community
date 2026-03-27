# Engineering Specification: TUI_WORKFLOW_RUN_LIST

## Overview

The Workflow Run List screen (`TUI_WORKFLOW_RUN_LIST`) is the primary interface for monitoring CI/CD pipeline execution directly in the Codeplane terminal client. It displays all runs for a given workflow definition, adapts to terminal capabilities (colors, dimensions), and provides robust keyboard navigation, optimistic mutations, and real-time Server-Sent Events (SSE) updates for running workflows.

This specification details the technical implementation required to build this feature within the constraints of the OpenTUI-based React architecture.

---

## Implementation Plan

### Step 1: Scaffold Screen and Route Registration
1. **File Creation**: Create the main screen file at `apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx`.
2. **Screen Registry**: Update `apps/tui/src/navigation/registry.ts` to include `WorkflowRuns`.
   - **Type**: `ScreenName.WorkflowRuns`
   - **Params definition**: Requires `repoContext` (owner/repo) and `workflowId`.
3. **Command Palette Integration**: Update `apps/tui/src/commands/registry.ts` to add the `:workflow-runs <name>` command, which parses the arguments and pushes to the screen stack.

### Step 2: Shared Utilities & Formatting
1. **Format Utilities (`apps/tui/src/utils/format.ts`)**:
   - Implement `formatDuration(ms: number)` to output concise strings ("45s", "1m 23s", "2h 5m", "—").
   - Implement `formatRelativeTime(date: Date | string)` for max 6ch timestamps ("now", "12m", "3d").
2. **Color Constants (`apps/tui/src/screens/Workflows/utils.ts`)**:
   - Define status to icon mappings: `success` (✓), `failure` (✗), `running` (◎, animated), `queued` (◌), `cancelled` (✕).
   - Create a `getDurationColor(durationMs: number)` helper returning `theme.success` (<1m), `default` (1-5m), `theme.warning` (5-15m), and `theme.error` (>15m).

### Step 3: Component Implementation: `WorkflowRunRow`
Create `apps/tui/src/screens/Workflows/WorkflowRunRow.tsx` to handle the rendering of a single list item.
1. **Layout & Responsiveness**: 
   - Consume `useLayout()` to conditionally render columns based on breakpoints.
   - **80x24**: icon (2), ID (8), ref (fill), timestamp (4).
   - **120x40**: icon (2), ID (8), event (12), ref (25), SHA (9), duration (8), timestamp (4).
   - **200x60**: Adds step count (8), expands columns.
2. **Animation**: 
   - For `running` workflows, consume OpenTUI's `useTimeline(250)` hook to animate the spinner frame (◐ → ◓ → ◑ → ◒) when the row is focused or visible within the scrollbox viewport.
3. **Live Duration**:
   - For `running` workflows, use a `useEffect` with `setInterval(..., 1000)` to update a local `elapsedMs` state, rerendering the duration column every second without fetching from the API.

### Step 4: Component Implementation: `WorkflowRunListScreen` (Main)
1. **State Management**:
   - `statusFilter`: string cycling through ("All", "Running", "Queued", "Success", "Failure", "Cancelled", "Finished").
   - `searchQuery`: string populated via the `/` keybinding.
2. **Data Fetching**:
   - Use `@codeplane/ui-core`'s `useWorkflowRuns({ owner, repo, definitionId, state: statusFilter })`.
   - Plumb pagination to `ScrollableList` component (trigger `fetchMore` at 80% scroll depth). Implements a soft memory cap to truncate items over `500`.
3. **SSE Real-time Updates**:
   - Consume `useWorkflowRunSSE()` to subscribe to events for currently visible runs.
   - On SSE message (e.g., `status_changed`), update the corresponding run in the cached list data to reflect the new state immediately.
4. **Header & Filter Toolbar**:
   - Use `<box>` layout to build the header: `{workflow_name} › Runs ({count})`.
   - Underneath, display the filter toolbar indicating the current filter state and search input (hidden until `/` is pressed).
5. **Keybindings**:
   - Use `useScreenKeybindings` to map all required inputs:
     - `j`/`k`, `Enter`, `g g`, `G`, `Ctrl+D`, `Ctrl+U` (list navigation).
     - `f` (cycle filter), `/` (search).
     - `Ctrl+R` (force refetch).

### Step 5: Actions and Optimistic Updates
Implement `c` (cancel), `r` (rerun), and `m` (resume) handlers within the screen using optimistic UI patterns.
1. Map keybindings to respective `@codeplane/ui-core` mutation API endpoints (`POST /cancel`, `/rerun`, `/resume`).
2. Update local state immediately to the expected outcome (e.g., `running` -> `cancelled`).
3. If the server request fails (e.g., `403 Permission Denied`), revert the local state, and trigger a status bar flash via `useStatusBarHints`.

---

## Unit & Integration Tests

All tests target `e2e/tui/workflows.test.ts` utilizing `@microsoft/tui-test`. Ensure the backend provides predictable fixture data.

### 1. Terminal Snapshot Tests (SNAP-WFR-001 to SNAP-WFR-032)
Capture the screen output and compare against golden baseline files.
- **Responsiveness**: Verify breakpoints at 80x24, 120x40, and 200x60 ensure columns collapse, expand, and truncate correctly.
- **States**: Empty states ("No runs found"), Loading states ("Loading runs..."), and API Error states ("Press R to retry").
- **Styling**: Verify focused row reverse video logic, status icon colors (green/red/yellow/cyan/gray), and the live spinner frames. 
- **Duration UI**: Verify color coding breakpoints for `<1m`, `1-5m`, `5-15m`, and `>15m`.

### 2. Keyboard Interaction Tests (KEY-WFR-001 to KEY-WFR-050)
Simulate key events and assert TUI behavior.
- **Navigation**: Send `j`/`k`, `G`, `g g`, `Ctrl+D`/`U` and evaluate that row focus highlights appropriately update.
- **Filtering**: Send `f` repeatedly and verify the server request parameter changes. Send `/`, type characters, and assert the search input traps focus and filters the local dataset.
- **Actions (`c`, `r`, `m`)**: Focus specific run rows, issue key presses, and evaluate optimistic local state transitions. Ensure invalid actions (e.g., pressing `c` on an already cancelled run) do not trigger API requests and instead show a status bar error.

### 3. Responsive Edge Case Tests (RESP-WFR-001 to RESP-WFR-016)
Trigger `useOnResize` simulate events.
- Validate layout stability when resizing during search input.
- Validate layout stability when `running` spinner is active and `useTimeline` is actively forcing re-renders.

### 4. Integration Tests (INT-WFR-001 to INT-WFR-025)
Validate end-to-end functionality involving mocked system responses.
- **SSE Validation**: Push a simulated SSE event through the `SSEProvider` context and assert the target run automatically updates its icon and status without user interaction.
- **Pagination**: Scroll down until the 80% boundary is hit, ensure `fetchMore` is invoked, and assert that the 500-item maximum bounds correctly truncates older/newer entries.
- **Error Propagation**: Simulate `401 Unauthorized` and `429 Rate Limit` network errors when performing list fetches, ensuring the respective TUI fallbacks ("Rate limited. Retry in Xs.") appear.