# Engineering Plan: TUI_WORKFLOW_RUN_LIST

## Overview

The Workflow Run List screen (`TUI_WORKFLOW_RUN_LIST`) is the primary interface for monitoring CI/CD pipeline execution within the Codeplane terminal client. It displays all runs for a specific workflow definition, adapting dynamically to terminal dimensions. It provides keyboard navigation, optimistic UI updates for run actions (cancel, rerun, resume), and real-time Server-Sent Events (SSE) updates coupled with animated braille spinners for running tasks.

This plan details the steps to implement this feature using the OpenTUI-based React architecture, leveraging existing shared hooks and patterns defined in the Codeplane specifications.

---

## Step-by-Step Implementation Plan

### Step 1: Scaffold Route Registration & Deep Links

1. **Update Screen Enums**:
   - File: `apps/tui/src/router/types.ts`
   - Action: Add `WorkflowRunList = "WorkflowRunList"` to the `ScreenName` enum.

2. **Register Screen**:
   - File: `apps/tui/src/router/registry.ts`
   - Action: Add `ScreenName.WorkflowRunList` to the registry, pointing it temporarily to `PlaceholderScreen` (to be updated later) or importing `WorkflowRunListScreen`. Include `requiresRepo: true` and a `breadcrumbLabel` function: `(p) => p.workflowName ? `${p.workflowName} Runs` : "Runs"`.

3. **Map Deep Link**:
   - File: `apps/tui/src/navigation/deepLinks.ts`
   - Action: Add `"workflow-runs": ScreenName.WorkflowRunList` to the `resolveScreenName()` map.

### Step 2: Implement Shared Workflow Hooks & Types

Copy the reference implementations from `specs/tui/apps/tui/src/hooks/` to `apps/tui/src/hooks/`. These provide the foundational data layer.

1. **Types**:
   - Create `apps/tui/src/hooks/workflow-types.ts` with definitions for `WorkflowRun`, `WorkflowRunStatus`, `TERMINAL_STATUSES`, and `WorkflowRunFilters`.
   - Create `apps/tui/src/hooks/workflow-stream-types.ts` with definitions for `StatusEvent` and `WorkflowRunSSEState`.

2. **Data Hooks**:
   - Create `apps/tui/src/hooks/useWorkflowRuns.ts` to fetch paginated runs via `GET /api/repos/:owner/:repo/workflows/runs` using `@codeplane/ui-core/hooks/internal/usePaginatedQuery`.
   - Create `apps/tui/src/hooks/useWorkflowRunSSE.ts` by re-exporting the core hook to manage SSE status streams for active runs.
   - Create `apps/tui/src/hooks/useWorkflowActions.ts` exposing `useWorkflowRunCancel`, `useWorkflowRunRerun`, and `useWorkflowRunResume` with optimistic update wrappers.

3. **Barrel Export**:
   - Update `apps/tui/src/hooks/index.ts` to export all newly created workflow hooks and types.

### Step 3: Implement Shared Screen Utilities

1. **Utility Functions**:
   - Create `apps/tui/src/screens/Workflows/utils.ts` (copying from `specs/tui/apps/tui/src/screens/Workflows/utils.ts`).
   - Ensure it includes:
     - `getRunStatusIcon(status: WorkflowRunStatus)`: Returns `{ icon, color, bold }` mappings (e.g., success → ✓ green, failure → ✗ red).
     - `formatDuration(seconds: number | null)`: Formats seconds to "1m 23s" format.
     - `getDurationColor(seconds: number | null)`: Maps duration thresholds to theme colors (success < 60s, error > 900s).
     - `formatRelativeTime(timestamp: string | null)`: Returns concise strings like "3m" or "2h".
     - `abbreviateSHA(sha: string | null)`: Truncates SHAs to 7 characters.

### Step 4: Implement `WorkflowRunRow` Component

1. **Component Creation**:
   - Create `apps/tui/src/screens/Workflows/WorkflowRunRow.tsx`.
   - Accept props: `run: WorkflowRun`, `isFocused: boolean`, `isActiveSpinner: boolean`.

2. **Responsive Layout**:
   - Consume `useLayout()` to determine visible columns.
   - **Minimum (<80 cols)**: Show Status Icon, Run ID, Duration, Relative Time.
   - **Standard (80-120 cols)**: Add Workflow Name (truncated), Trigger Ref (truncated).
   - **Large (>120 cols)**: Expand columns, add Commit SHA.

3. **Animation & Live Duration**:
   - Use `useSpinner(isActiveSpinner)` for runs in `running` or `queued` state to replace the static status icon with animated braille frames.
   - For `running` workflows, implement a local `useEffect` timer (1-second interval) to increment a local `elapsedSeconds` state to live-update the duration column without API fetches.

### Step 5: Implement `WorkflowRunListScreen` Component

1. **Main Screen Implementation**:
   - Create `apps/tui/src/screens/Workflows/WorkflowRunListScreen.tsx`.
   - Extract `owner`, `repo`, and `definitionId` from the navigation parameters.

2. **State Management & Data Fetching**:
   - Maintain local state for `statusFilter` (default "All") and `searchQuery`.
   - Call `useWorkflowRuns({ owner, repo, definitionId, state: statusFilter })`.
   - Map data to an array of `WorkflowRun` objects. Render using OpenTUI `<scrollbox>` and map to `WorkflowRunRow` components.
   - Use `SkeletonList` for initial loading.
   - Wire up `onScroll` to trigger `loadMore()` for cursor-based pagination at 80% scroll depth. Include `PaginationIndicator` at the bottom.

3. **Real-time SSE Status Merging**:
   - Identify non-terminal run IDs: `runs.filter(r => !TERMINAL_STATUSES.has(r.status)).map(r => r.id)`.
   - Subscribe via `useWorkflowRunSSE(owner, repo, nonTerminalRunIds)`.
   - Merge SSE statuses: `const displayStatus = runStatuses.get(run.id) ?? run.status`.

4. **Keybindings & Actions**:
   - Use `useScreenKeybindings` to map:
     - `j` / `k` / `g g` / `G` / `Ctrl+D` / `Ctrl+U`: List navigation and focus tracking.
     - `f`: Cycle `statusFilter` (`All` → `Queued` → `Running` → `Success` → `Failure` → `Cancelled` → `Error`).
     - `Enter`: `push(ScreenName.WorkflowRunDetail, { runId })`.
     - `c`: Invoke `cancelRun` mutation if `!TERMINAL_STATUSES.has(status)`.
     - `r`: Invoke `rerunRun` mutation.
     - `m`: Invoke `resumeRun` mutation if status is `failed` or `cancelled`.

5. **Header & Filter Toolbar**:
   - Display a `<box>` at the top indicating breadcrumb context.
   - Display current filter status `[Filter: ${statusFilter}]`.

6. **Barrel Export**:
   - Create `apps/tui/src/screens/Workflows/index.ts` exporting the screen component, and update the registry to point to it.

### Step 6: End-to-End Testing

Update `e2e/tui/workflows.test.ts` to include robust test cases using `@microsoft/tui-test`.

1. **Responsive Snapshot Tests**:
   - Capture snapshots for `HOOK-RSP-001` (80x24) and `HOOK-RSP-002` (200x60) ensuring column collapsing and truncation behaves perfectly.

2. **List Rendering & Data Tests**:
   - `HOOK-WFR-001`: Validates correct columns load.
   - `HOOK-WFR-003`: Verifies enriched `workflow_name` and `workflow_path` render correctly.
   - `HOOK-WFR-005`: Asserts empty state ("No runs match filter") renders when data is empty.

3. **Interaction & State Tests**:
   - `HOOK-WFR-002`: Simulate `f` keypresses, validating the API refetches from page 1 and the filter label updates.
   - `HOOK-WFR-004`: Simulate `G` (scroll to bottom), verifying `PaginationIndicator` shows and `loadMore()` triggers.

4. **Mutation & Action Tests**:
   - `HOOK-WFA-001` (Cancel): Simulate `c` on a running row, assert status icon updates to cancelled instantly (optimistic UI).
   - `HOOK-WFA-002` (Cancel gating): Simulate `c` on a terminal run, verify an error hint appears in the status bar.
   - `HOOK-WFA-003` (Rerun): Simulate `r` on a completed run.
   - `HOOK-WFA-004` (Resume): Simulate `m` on a failed run.
