# Engineering Specification: `tui-workflow-run-detail`

## Implement workflow run detail with step list, inline log expansion, and SSE streaming

**Ticket ID:** `tui-workflow-run-detail`
**Type:** Feature
**Feature Group:** `TUI_WORKFLOW_RUN_DETAIL`
**Dependencies:**
- `tui-workflow-screen-scaffold` — `ScreenName.WorkflowRunDetail` enum entry, screen registry, `WorkflowRunDetailScreen` placeholder, deep-link wiring
- `tui-workflow-data-hooks` — `useWorkflowRunDetail()`, `useWorkflowRunCancel()`, `useWorkflowRunRerun()`, `useWorkflowRunResume()`, workflow types
- `tui-workflow-sse-hooks` — `useWorkflowLogStream()` with SSE reconnection, deduplication, batched flush
- `tui-workflow-ui-utils` — `getRunStatusIcon()`, `getStepStatusIcon()`, `formatDuration()`, `formatRelativeTime()`, `abbreviateSHA()`
- `tui-detail-view-component` — `DetailView`, `DetailHeader`, `DetailSection`, `useDetailNavigation()`
- `tui-modal-component` — `Modal`, `useModal()`, `ConfirmDialog`, focus trapping, responsive sizing

---

## 1. Overview

This ticket replaces the `WorkflowRunDetailScreen` placeholder component (created in `tui-workflow-screen-scaffold`) with a fully functional workflow run detail screen. The screen renders run metadata, a navigable step list with inline log expansion, real-time SSE streaming for live runs, and action controls (cancel, rerun, resume) with confirmation overlays.

The implementation targets `apps/tui/src/screens/Workflows/WorkflowRunDetailScreen.tsx` as the primary file, with supporting sub-components and hooks co-located in the `Workflows/` directory. E2E tests target `e2e/tui/workflows.test.ts`.

### 1.1 Scope Boundaries

**In scope:**
- Run metadata header with status badge, timing, trigger info
- Step list with status icons, names, durations, j/k navigation
- Inline log expansion per step with ANSI passthrough, line numbers, auto-follow
- SSE streaming for live log events and status transitions
- Cancel, rerun, resume actions with confirmation overlays
- Dispatch inputs section for manually-dispatched runs
- Full responsive behavior at all three breakpoints
- Deep-link entry via `--screen workflow-run --repo owner/repo --run 42`
- Command palette entry via `:run <id>`
- Navigation to full-screen log viewer via `l` key

**Out of scope:**
- Full-screen log viewer implementation (separate ticket: `tui-workflow-log-viewer`)
- Artifact/cache views (separate tickets: `tui-workflow-artifacts-view`, `tui-workflow-cache-view`)
- Mermaid DAG visualization (future enhancement)

---

## 2. Current State Assessment

### 2.1 Production files (in `apps/tui/src/`)

| File | State | Relevance |
|------|-------|----------|
| `screens/Workflows/WorkflowRunDetailScreen.tsx` | Placeholder (from scaffold) | **Replace** — current implementation renders param dump only |
| `hooks/workflow-types.ts` | Implemented (200 lines) | Consumed — `WorkflowRun`, `WorkflowRunNode`, `WorkflowRunDetailResponse`, `WorkflowRunStatus`, `TERMINAL_STATUSES`, `MutationResult`, `QueryResult` |
| `hooks/workflow-stream-types.ts` | Implemented (116 lines) | Consumed — `LogLine`, `StatusEvent`, `DoneEvent`, `WorkflowLogStreamState`, `ConnectionHealth`, `StepState` |
| `hooks/useWorkflowRunDetail.ts` | Implemented | Consumed — fetches `GET /api/repos/:owner/:repo/workflows/runs/:id` |
| `hooks/useWorkflowActions.ts` | Implemented | Consumed — `useWorkflowRunCancel()`, `useWorkflowRunRerun()`, `useWorkflowRunResume()` |
| `hooks/useWorkflowLogStream.ts` (TUI wrapper) | Implemented | Consumed — wraps `@codeplane/ui-core` hook with `spinnerFrame` |
| `screens/Workflows/utils.ts` | Implemented | Consumed — `getRunStatusIcon()`, `getStepStatusIcon()`, `formatDuration()`, `formatRelativeTime()`, `abbreviateSHA()` |
| `components/DetailView.tsx` | Implemented (from `tui-detail-view-component`) | Consumed — `<DetailView>`, `<DetailHeader>`, `<DetailSection>` |
| `components/Modal.tsx` | Implemented (from `tui-modal-component`) | Consumed — `<Modal>`, focus trapping, Esc dismiss, responsive sizing |
| `components/ActionButton.tsx` | Implemented (58 lines) | Consumed — button with spinner during loading |
| `components/FullScreenError.tsx` | Implemented (52 lines) | Consumed — error state with screen label |
| `components/FullScreenLoading.tsx` | Implemented | Consumed — loading spinner state |
| `components/SkeletonDetail.tsx` | Implemented (64 lines) | Consumed — loading placeholder before data arrives |
| `hooks/useScreenKeybindings.ts` | Implemented (55 lines) | Consumed — PRIORITY.SCREEN scope registration |
| `hooks/useSpinner.ts` | Implemented (178 lines) | Consumed — braille/ASCII spinner for animated running status |
| `hooks/useLayout.ts` | Implemented (110 lines) | Consumed — breakpoint detection, content dimensions |
| `hooks/useBreakpoint.ts` | Implemented | Consumed — responsive breakpoint enum |
| `hooks/useResponsiveValue.ts` | Implemented | Consumed — breakpoint-conditional values |
| `providers/NavigationProvider.tsx` | Implemented | Consumed — `push()`, `pop()`, `repoContext` |
| `providers/KeybindingProvider.tsx` | Implemented (165 lines) | Consumed — scope registration, priority dispatch |
| `providers/OverlayManager.tsx` | Implemented | Consumed — overlay mutual exclusion |
| `theme/tokens.ts` | Implemented (263 lines) | Consumed — `CoreTokenName`, `ThemeTokens`, `TextAttributes` |

### 2.2 Absent from production

| File | Purpose |
|------|--------|
| `screens/Workflows/WorkflowRunDetailScreen.tsx` | Full implementation (replaces placeholder) |
| `screens/Workflows/components/RunHeader.tsx` | Run metadata header sub-component |
| `screens/Workflows/components/StepRow.tsx` | Individual step row with status, name, duration |
| `screens/Workflows/components/InlineLogPanel.tsx` | Expanded log panel below step row |
| `screens/Workflows/components/DispatchInputsSection.tsx` | Collapsible dispatch inputs display |
| `screens/Workflows/components/ActionConfirmOverlay.tsx` | Confirmation modal for cancel/rerun/resume |
| `screens/Workflows/components/index.ts` | Barrel export for sub-components |
| `screens/Workflows/hooks/useRunDetailState.ts` | Screen-level state orchestrator hook |
| `screens/Workflows/hooks/useStepNavigation.ts` | Step list navigation (focus, expand, collapse) |
| `screens/Workflows/hooks/useRunActions.ts` | Action confirmation state machine |
| `screens/Workflows/hooks/useElapsedTime.ts` | 1s-tick elapsed time for active runs |
| `screens/Workflows/hooks/index.ts` | Barrel export for hooks |

---

## 3. File Inventory

### 3.1 Source files (all under `apps/tui/src/`)

| File | Purpose | Action |
|------|---------|--------|
| `screens/Workflows/WorkflowRunDetailScreen.tsx` | Screen component — orchestrates layout, hooks, sub-components | **Replace** (overwrite placeholder) |
| `screens/Workflows/components/RunHeader.tsx` | Run status badge, metadata, timing display | **New** |
| `screens/Workflows/components/StepRow.tsx` | Step row with status icon, name, duration, focus highlight | **New** |
| `screens/Workflows/components/InlineLogPanel.tsx` | Log lines with line numbers, ANSI passthrough, auto-follow | **New** |
| `screens/Workflows/components/DispatchInputsSection.tsx` | Key-value display for dispatch inputs | **New** |
| `screens/Workflows/components/ActionConfirmOverlay.tsx` | Confirmation modal for cancel/rerun/resume | **New** |
| `screens/Workflows/components/index.ts` | Barrel export | **New** |
| `screens/Workflows/hooks/useRunDetailState.ts` | State orchestrator — composes data, SSE, navigation | **New** |
| `screens/Workflows/hooks/useStepNavigation.ts` | Step focus, expand/collapse, Esc priority chain | **New** |
| `screens/Workflows/hooks/useRunActions.ts` | Action confirmation flow — state machine, API calls | **New** |
| `screens/Workflows/hooks/useElapsedTime.ts` | useTimeline-based 1s tick for running elapsed time | **New** |
| `screens/Workflows/hooks/index.ts` | Barrel export | **New** |
| `screens/Workflows/index.ts` | Barrel export | **Modify** (add WorkflowRunDetailScreen re-export) |

### 3.2 Test files (all under `e2e/tui/`)

| File | Purpose | Action |
|------|---------|--------|
| `workflows.test.ts` | E2E tests — 132 tests across snapshot, keyboard, responsive, integration, and edge case categories | **Modify** (append run detail tests to existing workflow test suite) |

---

## 4. Architecture

### 4.1 Component Hierarchy

```
WorkflowRunDetailScreen
├── useRunDetailState()                    ← orchestrator hook
│   ├── useWorkflowRunDetail(repo, runId)  ← data fetch
│   ├── useWorkflowLogStream(owner, repo, runId)  ← SSE streaming
│   ├── useStepNavigation(nodes)           ← focus/expand state
│   ├── useRunActions(repo, runId, status) ← action confirmation
│   └── useElapsedTime(startedAt, isLive)  ← 1s tick
├── Loading state → <FullScreenLoading label="Loading run…" />
├── Error state → <FullScreenError screenLabel="Workflow Run" error={error} />
├── 404 state → <FullScreenError screenLabel="Run #{runId}" error={{...}} />
├── Data loaded:
│   ├── <scrollbox ref={scrollboxRef}>
│   │   ├── <RunHeader run={run} workflow={workflow} elapsed={elapsed} breakpoint={bp} />
│   │   ├── <DispatchInputsSection inputs={run.dispatch_inputs} visible={showInputs} breakpoint={bp} />
│   │   ├── {nodes.map(node => (
│   │   │   <box flexDirection="column" key={node.id}>
│   │   │     <StepRow node={node} focused={focusedId === node.id} expanded={expandedIds.has(node.id)} breakpoint={bp} spinnerFrame={spinnerFrame} />
│   │   │     {expandedIds.has(node.id) && (
│   │   │       <InlineLogPanel stepId={node.id} logs={logs.get(node.step_id)} stepState={steps.get(node.step_id)} autoFollow={autoFollow} breakpoint={bp} />
│   │   │     )}
│   │   │   </box>
│   │   │ ))}
│   │   └── </scrollbox>
│   └── <ActionConfirmOverlay action={pendingAction} onConfirm={confirm} onDismiss={dismiss} isLoading={actionLoading} error={actionError} />
```

### 4.2 Data Flow

```
WorkflowRunDetailScreen (entry.params: { runId, owner, repo })
  │
  ├── useWorkflowRunDetail(repo, runId)
  │   └── GET /api/repos/:owner/:repo/workflows/runs/:id
  │       └── Returns: { run, workflow, nodes[], mermaid, plan_xml }
  │
  ├── useWorkflowLogStream(owner, repo, runId, { enabled: isLive })
  │   └── SSE: GET /api/repos/:owner/:repo/runs/:id/logs
  │       ├── "log" events → logs Map<stepId, LogLine[]> (batched, deduped)
  │       ├── "status" events → steps Map<stepId, StepState>, runStatus
  │       └── "done" event → connectionState="completed", final status
  │
  ├── useWorkflowRunCancel(repo) → POST .../cancel → 204
  ├── useWorkflowRunRerun(repo) → POST .../rerun → 201 { workflow_run_id }
  └── useWorkflowRunResume(repo) → POST .../resume → 204
```

### 4.3 State Machine: Run Detail Screen

```
                                  ┌──────────┐
                     mount ──────→│ loading  │
                                  └────┬─────┘
                                       │
                       ┌───────────────┼───────────────┐
                       ▼               ▼               ▼
                   ┌───────┐     ┌──────────┐    ┌──────────┐
                   │ error │     │ not_found│    │  ready   │
                   └───┬───┘     └──────────┘    └────┬─────┘
                       │                              │
                  R: refetch                  SSE + user interaction
                       │                              │
                       └──────────────────────────────┘
```

Ready sub-states:
- `live` — run is running/queued, SSE connected, elapsed time ticking
- `terminal` — run completed/failed/cancelled/errored, SSE disconnected, static display
- `action_pending` — confirmation overlay visible, awaiting user confirm/cancel

### 4.4 State Machine: Step Navigation

```
Steps: [S1, S2, S3, S4]
Focus: S2
Expanded: {S1, S3}

j → Focus: S3
Enter (on S3) → Expanded: {S1}  (collapse S3)
Enter (on S3) → Expanded: {S1, S3}  (expand S3)
l (on S2) → push("workflow-log-viewer", { stepId: S2.step_id, stepName: S2.name })
Esc → collapse most recently expanded → collapse S3 → Expanded: {S1}
Esc (nothing expanded) → pop screen
```

### 4.5 State Machine: Action Confirmation

```
                  ┌──────┐
   c/r/R key ───→│ open │
                  └──┬───┘
                     │
            ┌────────┼────────┐
            ▼        ▼        ▼
        ┌───────┐  ┌────┐  ┌─────────┐
        │confirm│  │esc │  │tab focus│
        └───┬───┘  └──┬─┘  └─────────┘
            │         │
            ▼         ▼
       ┌─────────┐  closed
       │executing│
       └────┬────┘
            │
       ┌────┼──────┐
       ▼           ▼
   ┌───────┐  ┌───────┐
   │success│  │ error │
   └───┬───┘  └───┬───┘
       │          │
       ▼          ▼
   navigate    show error
   or refresh  in overlay
```

---

## 5. Implementation Plan

### Step 1: Create `hooks/useElapsedTime.ts`

**File:** `apps/tui/src/screens/Workflows/hooks/useElapsedTime.ts`

A hook that produces a 1-second-updating elapsed time value for active runs.

```typescript
import { useState, useEffect, useRef, useCallback } from "react";

export function useElapsedTime(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  isLive: boolean,
): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const computeElapsed = useCallback(() => {
    if (!startedAt) return null;
    if (completedAt) {
      return Math.max(0, Math.floor(
        (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
      ));
    }
    return Math.max(0, Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000
    ));
  }, [startedAt, completedAt]);

  useEffect(() => {
    setElapsed(computeElapsed());
  }, [computeElapsed]);

  useEffect(() => {
    if (isLive && startedAt && !completedAt) {
      intervalRef.current = setInterval(() => {
        setElapsed(computeElapsed());
      }, 1000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setElapsed(computeElapsed());
  }, [isLive, startedAt, completedAt, computeElapsed]);

  return elapsed;
}
```

**Design decisions:**
- Uses `setInterval(1000)` rather than `useTimeline()` because the elapsed time tick does not need sub-frame animation.
- Returns `number | null` — null when no `startedAt` available (queued runs).
- `Math.max(0, ...)` prevents negative elapsed times from clock skew.

---

### Step 2: Create `hooks/useStepNavigation.ts`

**File:** `apps/tui/src/screens/Workflows/hooks/useStepNavigation.ts`

Manages step focus index, expanded step set, and the Esc priority chain.

```typescript
import { useState, useCallback, useRef } from "react";
import type { WorkflowRunNode } from "../../../hooks/workflow-types.js";

export interface StepNavigationState {
  focusedId: string | null;
  focusedIndex: number;
  expandedIds: ReadonlySet<string>;
  expandOrder: readonly string[];
  focusNext: () => void;
  focusPrev: () => void;
  focusFirst: () => void;
  focusLast: () => void;
  toggleExpand: (id?: string) => void;
  collapseLatest: () => boolean;
  collapseAll: () => void;
  pageDown: (pageSize: number) => void;
  pageUp: (pageSize: number) => void;
}

export function useStepNavigation(nodes: WorkflowRunNode[]): StepNavigationState { ... }
```

**Design decisions:**
- `expandOrder` tracks insertion order for Esc-based collapse. Most recently expanded step collapses first.
- `collapseLatest()` returns `boolean` so the Esc handler knows whether a collapse occurred.
- Focus index clamped to `[0, nodes.length - 1]`.

---

### Step 3: Create `hooks/useRunActions.ts`

State machine for action confirmation flow.

**Design decisions:**
- `isActionAvailable` is a pure function of action + status — used for key handler gating and dimming.
- Overlay cannot be dismissed while executing.
- Error messages mapped from HTTP status codes.
- On rerun success, caller navigates via `push()`. On resume, SSE reconnects. On cancel, SSE receives `done` event.

---

### Step 4: Create `hooks/useRunDetailState.ts`

Orchestrator hook composing all data, streaming, navigation, and action hooks.

**Design decisions:**
- Single orchestrator prevents prop-drilling.
- `effectiveRunStatus` merges SSE status with API data.
- `isLive` drives SSE `enabled`.
- Nodes sorted by `position` once via `useMemo`.

---

### Step 5: Create `components/RunHeader.tsx`

Renders two-row metadata header (compact single-line at minimum breakpoint).

---

### Step 6: Create `components/StepRow.tsx`

Individual step row with status icon, name, iteration, duration, focus highlight.

---

### Step 7: Create `components/InlineLogPanel.tsx`

Log lines with line numbers, ANSI passthrough via `<code>`, auto-follow, stderr red border.

---

### Step 8: Create `components/DispatchInputsSection.tsx`

Collapsible key-value display for dispatch inputs.

---

### Step 9: Create `components/ActionConfirmOverlay.tsx`

Confirmation modal for cancel/rerun/resume actions.

---

### Step 10-11: Barrel exports

---

### Step 12: Implement `WorkflowRunDetailScreen.tsx`

Main screen component with keybinding registration, Esc priority chain, status bar hints.

---

### Step 13: Update `screens/Workflows/index.ts`

---

## 6. Telemetry Integration

All telemetry events from the product spec are emitted at documented emission points.

---

## 7. Observability

All log output writes to stderr. Level gated by `CODEPLANE_LOG_LEVEL`.

---

## 8. Unit & Integration Tests

### Test count summary

| Category | Count |
|----------|-------|
| Terminal snapshot tests | 32 |
| Keyboard interaction tests | 45 |
| Responsive tests | 16 |
| Integration tests | 24 |
| Edge case tests | 15 |
| **Total** | **132** |

All 132 tests left failing if backend unimplemented — never skipped.

---

## 9. Error Handling Matrix

Covers 401, 403, 404, 409, 429, 500, network timeout, SSE disconnect, SSE reconnect failure, log buffer overflow, component crash.

---

## 10. Performance Considerations

- Render budget: <16ms for most operations
- Memory budget: <20MB typical
- SSE optimization: batched flush, FIFO eviction, dedup pruning

---

## 11. Accessibility & Terminal Compatibility

Non-Unicode fallback icons, 16-color degradation, NO_COLOR support.

---

## 12. Source of Truth

Maintained alongside TUI PRD, design spec, features.ts, and all dependency engineering specs.