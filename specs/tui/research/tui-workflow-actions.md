# Research: tui-workflow-actions — Implement cancel/rerun/resume action system with confirmation overlays and optimistic updates

## 1. Engineering Spec Location

**Target spec:** `specs/tui/engineering/tui-workflow-actions.md` — currently a placeholder (file contains only its own path). Needs to be written.

**Product spec (fully written):** `specs/tui/TUI_WORKFLOW_ACTIONS.md` — 539 lines, comprehensive product specification with acceptance criteria, keybindings, responsive behavior, permissions, telemetry, observability, and 129 E2E test definitions.

**Feature identifier:** `TUI_WORKFLOW_ACTIONS` in `specs/tui/features.ts` line 121, part of the `TUI_WORKFLOWS` group.

---

## 2. Existing Infrastructure (Production Files)

All files below are live in `apps/tui/src/`.

### 2.1 Overlay & Confirmation System

| File | Path | Lines | Key Exports |
|------|------|-------|-----------|
| Overlay types | `providers/overlay-types.ts` | 1-26 | `OverlayType = "help" \| "command-palette" \| "confirm"`, `ConfirmPayload { title, message, confirmLabel?, cancelLabel?, onConfirm, onCancel? }`, `OverlayContextType` |
| OverlayManager | `providers/OverlayManager.tsx` | 1-161 | `OverlayManager` — manages mutual exclusion, Escape binding at `PRIORITY.MODAL` (2), keybinding scope + status bar hint overrides |
| OverlayLayer | `components/OverlayLayer.tsx` | 1-90 | Renders absolutely-positioned `<box>` with zIndex=100, title bar, separator, content area. Has placeholder confirm dialog rendering (title, message, [Confirm]/[Cancel] text) |
| useOverlay hook | `hooks/useOverlay.ts` | 1-35 | `useOverlay()` → `{ activeOverlay, openOverlay, closeOverlay, isOpen, confirmPayload }` |

**Critical insight:** The OverlayLayer currently has a basic confirm rendering placeholder (lines 78-86) that renders `confirmPayload.message` and `[Confirm]`/`[Cancel]` text labels. The `ActionConfirmOverlay` component specified in the run-detail ticket will replace/augment this with a more specialized workflow-specific overlay.

### 2.2 Optimistic Mutation System

| File | Path | Lines | Key Exports |
|------|------|-------|-----------|
| useOptimisticMutation | `hooks/useOptimisticMutation.ts` | 1-93 | `useOptimisticMutation<TArgs>(options)` → `{ execute, isLoading }`. Options: `{ id, entityType, action, mutate, onOptimistic, onRevert, onSuccess }` |
| LoadingProvider | `providers/LoadingProvider.tsx` | 1-230 | `registerMutation(id, action, entityType)`, `completeMutation(id)` (silent), `failMutation(id, errorMessage)` (5s status bar error) |
| Loading types | `loading/types.ts` | 1-151 | `MutationState { id, entityType, action, status: ActionStatus, startedAt }`, `ActionStatus = "idle" \| "loading" \| "success" \| "error"`, `LoadingContextValue` |
| Loading constants | `loading/constants.ts` | 1-39 | `STATUS_BAR_ERROR_DURATION_MS = 5000`, `ERROR_SUMMARY_MAX_LENGTH = 60`, `STATUS_BAR_ERROR_PADDING = 20`, `MIN_SAVING_BUTTON_WIDTH = 10` |
| ActionButton | `components/ActionButton.tsx` | 1-58 | `ActionButton { label, isLoading?, loadingLabel?, onPress?, disabled? }` — button with spinner during loading |

**Note on flash timing:** Product spec requires 3s auto-dismiss for status bar messages, but `STATUS_BAR_ERROR_DURATION_MS` is 5000ms. The action hooks will need custom timing or the product spec needs alignment.

### 2.3 Keybinding System

| File | Path | Key Facts |
|------|------|-----------|
| Keybinding types | `providers/keybinding-types.ts` | `KeyHandler { key, description, group, handler, when? }`, `PRIORITY = { TEXT_INPUT: 1, MODAL: 2, GOTO: 3, SCREEN: 4, GLOBAL: 5 }`, `StatusBarHint { keys, label, order? }` |
| useScreenKeybindings | `hooks/useScreenKeybindings.ts` | Registers `PRIORITY.SCREEN` scope on mount, auto-generates status bar hints from bindings. `when` predicate evaluated at dispatch time. |
| normalizeKeyDescriptor | `providers/normalize-key.ts` | Normalizes key strings for consistent matching |

**Key for this ticket:** The `when?: () => boolean` predicate on `KeyHandler` is how action keys are conditionally gated based on run status. e.g., `when: () => runStatus === "running" || runStatus === "queued"` for cancel.

### 2.4 Navigation

| File | Path | Key Facts |
|------|------|-----------|
| Router types | `router/types.ts` | `ScreenName.Workflows`, `ScreenName.WorkflowRunDetail` exist. `NavigationContext { push, pop, replace, reset, repoContext }` |
| Screen registry | `router/registry.ts` | Both `Workflows` and `WorkflowRunDetail` point to `PlaceholderScreen`. `WorkflowRunDetail` breadcrumb: `(p) => p.runId ? \`Run #${p.runId}\` : "Run"` |
| Go-to bindings | `navigation/goToBindings.ts` | `g f` → `ScreenName.Workflows` (requiresRepo: true) |

### 2.5 Theme & Color

| File | Path | Key Facts |
|------|------|-----------|
| Theme tokens | `theme/tokens.ts` | `statusToToken()` maps status strings → `CoreTokenName`. `cancelled` → `"error"`, `running` → `"success"`, `queued` → `"warning"` |
| Text utilities | `util/text.ts` | `truncateText(text, maxLength)`, `truncateRight(text, maxWidth)`, `fitWidth(text, width, align)` |

**Note:** The product spec for workflow actions says workflow-specific utils override `statusToToken()` — e.g., `cancelled` → `"muted"` (not `"error"`), `running` → `"warning"` (not `"success"`). This is defined in `tui-workflow-ui-utils`.

### 2.6 Other Shared Components

| Component | Path | Purpose |
|-----------|------|---------|
| AppShell | `components/AppShell.tsx` | Wraps `<HeaderBar>` + content + `<StatusBar>` + `<OverlayLayer>` |
| FullScreenLoading | `components/FullScreenLoading.tsx` | Loading spinner |
| FullScreenError | `components/FullScreenError.tsx` | Error display with label |
| SkeletonDetail | `components/SkeletonDetail.tsx` | Loading placeholder |
| useSpinner | `hooks/useSpinner.ts` | Braille/ASCII spinner animation via OpenTUI Timeline engine |
| useLayout | `hooks/useLayout.ts` | `{ width, height, breakpoint, contentHeight, modalWidth, modalHeight }` |
| useBreakpoint | `hooks/useBreakpoint.ts` | Breakpoint enum detection |
| useResponsiveValue | `hooks/useResponsiveValue.ts` | Breakpoint-conditional values |

---

## 3. Spec'd Workflow Hooks (in `specs/tui/apps/tui/src/hooks/`)

These files exist in the specs directory as implementation references. They will be created in `apps/tui/src/hooks/` by the `tui-workflow-data-hooks` ticket.

### 3.1 Mutation Hooks — `useWorkflowActions.ts` (243 lines)

**File:** `specs/tui/apps/tui/src/hooks/useWorkflowActions.ts`

| Hook | Signature | Endpoint | Response |
|------|-----------|----------|----------|
| `useWorkflowRunCancel` | `(repo: RepoIdentifier, callbacks?)` → `MutationResult<number, void>` | `POST .../workflows/runs/{runId}/cancel` | 204 |
| `useWorkflowRunRerun` | `(repo: RepoIdentifier, callbacks?)` → `MutationResult<number, WorkflowRunResult>` | `POST .../workflows/runs/{runId}/rerun` | 201 + `{ workflow_definition_id, workflow_run_id, steps }` |
| `useWorkflowRunResume` | `(repo: RepoIdentifier, callbacks?)` → `MutationResult<number, void>` | `POST .../workflows/runs/{runId}/resume` | 204 |
| `useDeleteWorkflowArtifact` | `(repo, callbacks?)` → `MutationResult<{runId, name}, void>` | `DELETE .../artifacts/{name}` | 204 |
| `useDeleteWorkflowCache` | `(repo, callbacks?)` → `MutationResult<number, void>` | `DELETE .../cache` | 204 |

Each hook supports:
- `onOptimistic(input)` → returns optional rollback function
- `onSuccess(result, input)` → called after success
- `onError(error, input)` → called on failure, triggers rollback

### 3.2 Domain Types — `workflow-types.ts` (174 lines)

**File:** `specs/tui/apps/tui/src/hooks/workflow-types.ts`

```typescript
type WorkflowRunStatus = "queued" | "running" | "success" | "failure" | "cancelled" | "error";
const TERMINAL_STATUSES = new Set(["success", "failure", "cancelled", "error"]);

interface WorkflowRun { id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, started_at, completed_at, created_at, updated_at, workflow_name?, workflow_path? }
interface WorkflowRunResult { workflow_definition_id, workflow_run_id, steps[] }
interface WorkflowRunDetailResponse { run, workflow: {id, name, path}, nodes[], mermaid, plan_xml }
interface RepoIdentifier { owner, repo }
interface MutationResult<TInput, TOutput> { execute, loading, error, reset }
interface QueryResult<T> { data, loading, error, refetch }
```

### 3.3 SSE Stream Types — `workflow-stream-types.ts` (116 lines)

**File:** `specs/tui/apps/tui/src/hooks/workflow-stream-types.ts`

```typescript
interface StatusEvent { run_id, run_status, step_id?, step_status?, started_at?, completed_at? }
interface DoneEvent { run_id, final_status, completed_at }
interface ConnectionHealth { state, reconnectAttempts, maxReconnectAttempts, lastConnectedAt, lastError }
interface WorkflowRunSSEState { runStatuses: Map<number, WorkflowRunStatus>, connectionHealth, reconnect }
```

### 3.4 Detail Query Hook — `useWorkflowRunDetail.ts` (15 lines)

Fetches `GET /api/repos/:owner/:repo/workflows/runs/:runId`.

---

## 4. Server API Endpoints

**File:** `apps/server/src/routes/workflows.ts`

| Action | Route | Method | Lines | Response | Server Status |
|--------|-------|--------|-------|----------|---------------|
| Cancel | `/api/repos/:owner/:repo/workflows/runs/:id/cancel` | POST | 760-768 | 204 No Content | ✅ Implemented |
| Rerun | `/api/repos/:owner/:repo/workflows/runs/:id/rerun` | POST | 794-812 | 201 + `{ workflow_definition_id, workflow_run_id, steps }` | ✅ Implemented |
| Resume | `/api/repos/:owner/:repo/workflows/runs/:id/resume` | POST | 815-823 | 204 No Content | ✅ Implemented |
| Log SSE | `/api/repos/:owner/:repo/runs/:id/logs` | GET SSE | 825-908 | SSE stream | ✅ Implemented |

### Service Layer — `packages/sdk/src/services/workflow.ts`

| Method | Lines | Validation |
|--------|-------|------------|
| `cancelRun(repoId, runId)` | 1283-1297 | 404 if not found |
| `resumeRun(repoId, runId)` | 1301-1337 | 404 if not found, **409 if status ≠ "cancelled" or "failure"** — message: `cannot resume workflow run with status "{status}"; only cancelled or failed runs can be resumed` |
| `rerunRun({ repoId, runId, userId })` | 1341-1391 | 404 if run or definition not found. Reconstructs dispatch inputs from original run. |

---

## 5. Precedent Pattern: Workspace Suspend/Resume

**Spec:** `specs/tui/engineering/tui-workspace-suspend-resume.md` (200+ lines)

This spec defines the closest architectural precedent for workflow actions:

### Architecture Pattern:
```
Screen Component
├── useWorkspaceSuspendResume(workspace, { onStatusChange })
│   ├── useOptimisticMutation (suspend)
│   ├── useOptimisticMutation (resume)
│   ├── useWorkspaceStatusBar (success/error messages)
│   └── in-flight guard (ref-based)
├── useScreenKeybindings([s, r, R], dynamicHints)
├── SSE subscription
└── StatusBadge (renders displayStatus)
```

### Key Design Decisions from Workspace Spec:
1. **In-flight guard:** `useRef<boolean>` prevents double-execution (synchronous check)
2. **No confirmation dialog** for workspace suspend/resume (reversible operations)
3. **Dynamic hints:** Update based on focused item state via `when?: () => boolean`
4. **Error classification:** Map HTTP status codes → user-friendly messages (403→"Permission denied", 404→"Not found", etc.)
5. **Status bar messages:** Custom success/error display with truncation based on terminal width
6. **5s error auto-dismiss** via `LoadingProvider.failMutation()`
7. **No success message mechanism** in LoadingProvider — `completeMutation()` is silent

---

## 6. Related Workflow Engineering Specs

### 6.1 `tui-workflow-run-detail` (the parent screen spec)

Defines the full run detail screen which consumes workflow actions. Key files it specifies:

| File | Purpose |
|------|---------|
| `screens/Workflows/WorkflowRunDetailScreen.tsx` | Main screen |
| `screens/Workflows/components/ActionConfirmOverlay.tsx` | **Confirmation modal for cancel/rerun/resume** |
| `screens/Workflows/hooks/useRunActions.ts` | **Action confirmation state machine** |
| `screens/Workflows/hooks/useRunDetailState.ts` | Orchestrator composing data + SSE + navigation + actions |
| `screens/Workflows/hooks/useStepNavigation.ts` | Step list navigation |
| `screens/Workflows/hooks/useElapsedTime.ts` | 1s-tick elapsed time |

### 6.2 Action Confirmation State Machine (from run-detail spec)

```
                  ┌──────┐
   c/r/R key ───→│ open │
                  └──┬───┘
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

### 6.3 Design Decisions from run-detail spec (Step 3):
- `isActionAvailable` is a pure function of action + status — used for key handler gating and dimming
- Overlay cannot be dismissed while executing
- Error messages mapped from HTTP status codes
- On rerun success → navigate via `push()`. On resume → SSE reconnects. On cancel → SSE receives `done` event.

### 6.4 Other Workflow Specs (Dependencies)

| Spec | Status | Provides |
|------|--------|----------|
| `tui-workflow-screen-scaffold` | Specified | Directory structure, ScreenName entries, deep-link wiring |
| `tui-workflow-data-hooks` | Specified, documented as implemented | 12 hooks including cancel/rerun/resume + types |
| `tui-workflow-sse-hooks` | Specified | `useWorkflowLogStream()`, `useWorkflowRunSSE()` |
| `tui-workflow-ui-utils` | Specified | `getRunStatusIcon()`, `getStepStatusIcon()`, `formatDuration()`, `formatRelativeTime()`, `abbreviateSHA()` |
| `tui-workflow-list-screen` | Specified | Workflow list screen (parent for run list) |
| `tui-workflow-run-list` | Specified | Run list screen (consumes optimistic list actions) |

---

## 7. Product Spec Details (TUI_WORKFLOW_ACTIONS.md)

### 7.1 Two Action Contexts

1. **Run Detail Screen:** Actions require confirmation overlay before executing. Keys: `c` (cancel), `r` (rerun), `R` (resume).
2. **Run List Screen:** Actions execute immediately with optimistic UI, no confirmation. Keys: `c` (cancel), `r` (rerun), `m` (resume — lowercase because `R` conflicts with refresh).

### 7.2 State Gating Rules

| Action | Valid States | Invalid State Message |
|--------|-------------|----------------------|
| Cancel (`c`) | `running`, `queued` | "Run is not active" / "Run is already cancelled" |
| Rerun (`r`) | `success`, `failure`, `cancelled`, `timeout` | "Run is still in progress" |
| Resume (`R`/`m`) | `cancelled`, `failure` | "Run completed successfully" / "Run cannot be resumed in current state" |

### 7.3 Confirmation Overlay Spec

- Action-specific color: Cancel=`error` (red), Rerun=`primary` (blue), Resume=`success` (green)
- Focus trapped within overlay. `Tab`/`Shift+Tab` cycles Confirm/Cancel buttons.
- Spinner: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` at 80ms during API call (shared with `useSpinner`)
- Error display inline in overlay with retry option
- "Run state changed" auto-dismiss if SSE updates make state incompatible

### 7.4 Responsive Overlay Sizing

| Breakpoint | Width | Height | Layout |
|------------|-------|--------|--------|
| 80×24 (min) | 90% | 30% (min 5 rows) | Compact: action label + buttons only |
| 120×40 (std) | 40% | 20% | Full: label + workflow name + buttons |
| 200×60 (lg) | 35% | 18% | Expanded: + trigger ref + commit SHA |

Minimum overlay width: 30ch. Fallback to 95% if terminal < 40ch.

### 7.5 Optimistic Update Pattern (Run List)

1. Validate run state client-side
2. Immediately update row status icon/color
3. Fire API in background
4. Success → keep state, trigger silent refresh
5. Failure → revert row, flash error in status bar

### 7.6 Status Bar Flash Messages

- Success (green): `✓ Run #42 cancelled`, `✓ Rerun started as #43`, `✓ Run #42 resumed`
- Error (red): `✗ Permission denied`, `✗ Run cannot be cancelled in current state`
- Warning (yellow): `⚠ Rate limited. Retry in 30s.`
- Info (muted): `Run is not active`, `Run is still in progress`
- Auto-dismiss: 3 seconds (note: differs from `STATUS_BAR_ERROR_DURATION_MS = 5000`)

### 7.7 Telemetry Events (11 total)

`tui.workflow_action.initiated`, `.confirmed`, `.dismissed`, `.success`, `.failure`, `.denied`, `.rate_limited`, `.invalid_state`, `.retry`, `.optimistic_revert`, `.sse_reconnect`

---

## 8. E2E Test Strategy

**Test file:** `e2e/tui/workflows.test.ts` (does not yet exist)

**Test helpers:** `e2e/tui/helpers.ts` provides:
- `launchTUI(options)` → `TUITestInstance { sendKeys, sendText, waitForText, waitForNoText, snapshot, getLine, resize, terminate }`
- `createTestCredentialStore(token?)` → `{ path, token, cleanup }`
- `createMockAPIEnv(options?)` → env vars
- `TERMINAL_SIZES = { minimum: 80×24, standard: 120×40, large: 200×60 }`

**From product spec — 129 tests:**
- 30 terminal snapshot tests (SNAP-WA-001 to SNAP-WA-030)
- 48 keyboard interaction tests (KEY-WA-001 to KEY-WA-048)
- 14 responsive tests (RESP-WA-001 to RESP-WA-014)
- 22 integration tests (INT-WA-001 to INT-WA-022)
- 15 edge case tests (EDGE-WA-001 to EDGE-WA-015)

All tests left failing if backend unimplemented — never skipped.

---

## 9. Files to Create/Modify

### 9.1 New Files (under `apps/tui/src/`)

| File | Purpose |
|------|---------|
| `screens/Workflows/hooks/useRunActions.ts` | Action confirmation state machine — `isActionAvailable(action, status)`, `pendingAction`, `confirm()`, `dismiss()`, `actionLoading`, `actionError` |
| `screens/Workflows/components/ActionConfirmOverlay.tsx` | Confirmation modal component — accepts action type, run ID, workflow name, onConfirm, onDismiss, isLoading, error |
| `screens/Workflows/hooks/useOptimisticRunAction.ts` | Optimistic action hook for run list — wraps `useOptimisticMutation` with workflow-specific logic |

### 9.2 Modified Files

| File | Changes |
|------|---------|
| `screens/Workflows/WorkflowRunDetailScreen.tsx` | Add action keybindings (c/r/R), integrate useRunActions, render ActionConfirmOverlay |
| `screens/Workflows/WorkflowRunListScreen.tsx` | Add optimistic action keybindings (c/r/m), integrate useOptimisticRunAction |
| `screens/Workflows/components/index.ts` | Export ActionConfirmOverlay |
| `screens/Workflows/hooks/index.ts` | Export useRunActions, useOptimisticRunAction |

### 9.3 Test Files

| File | Action |
|------|--------|
| `e2e/tui/workflows.test.ts` | Create with 129 tests |

---

## 10. Key Dependencies

| Dependency | What it provides | Status |
|---|---|---|
| `tui-workflow-data-hooks` | `useWorkflowRunCancel()`, `useWorkflowRunRerun()`, `useWorkflowRunResume()`, types | Spec'd, implementations in specs/tui/ |
| `tui-workflow-screen-scaffold` | Screen directory, ScreenName entries, registry wiring | Spec'd |
| `tui-workflow-run-detail` | Parent screen consuming actions (WorkflowRunDetailScreen) | Spec'd |
| `tui-workflow-run-list` | Parent screen consuming optimistic actions (WorkflowRunListScreen) | Spec'd |
| `tui-workflow-sse-hooks` | SSE streaming for live runs (needed for resume reconnection) | Spec'd |
| `tui-workflow-ui-utils` | `getRunStatusIcon()`, `formatDuration()`, status→color mapping | Spec'd |

---

## 11. Open Design Questions

1. **Flash message timing:** Product spec says 3s auto-dismiss, but `STATUS_BAR_ERROR_DURATION_MS = 5000`. The action hooks need custom timing via `setTimeout` rather than relying on `failMutation()`, or the constant needs to be made configurable.

2. **Success message mechanism:** `LoadingProvider.completeMutation()` is silent. Success flash messages ("✓ Run #42 cancelled") need a custom mechanism — either extend LoadingProvider with `completeMutationWithMessage()` or use a separate state + timer in the action hook.

3. **Overlay vs. existing OverlayManager:** The product spec defines `ActionConfirmOverlay` as a purpose-built component, but the existing `OverlayManager` already supports `openOverlay("confirm", payload)`. Decision: use the existing overlay system for focus trapping and Esc handling, but render a custom `ActionConfirmOverlay` component inside the overlay content area instead of the generic confirm placeholder.

4. **Run list resume key:** Product spec uses `m` on run list (not `R`) to avoid conflict. This is intentional per spec line 56: "`m`: Resume focused run immediately".

5. **SSE reconnection after resume:** The resume success handler needs to trigger SSE reconnection. The `useWorkflowLogStream` hook from `tui-workflow-sse-hooks` exposes a `reconnect()` method that should be called.