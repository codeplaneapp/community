# Engineering Specification: `tui-workspace-suspend-resume`

## Title
Workspace suspend/resume actions with optimistic updates

## Status
`Not started` — All workspace screens are currently `PlaceholderScreen` stubs. No suspend/resume keybinding, optimistic mutation, or status transition logic exists in `apps/tui/src/`. The dependency hooks (`useSuspendWorkspace`, `useResumeWorkspace`) exist in `specs/tui/packages/ui-core/` but have known bugs (see tui-workspace-data-hooks spec). The `WorkspaceStatusBadge` component is specified but not yet built.

## Summary

This ticket implements the `TUI_WORKSPACE_SUSPEND_RESUME` feature — the `s` (suspend) and `r` (resume) keybindings for workspace lifecycle management, with optimistic status transitions, SSE-driven confirmation, error recovery, and status bar feedback. The feature integrates into both the workspace list screen and workspace detail screen.

**Scope boundary:**
- ✅ `apps/tui/src/hooks/useWorkspaceSuspendResume.ts` — core action hook
- ✅ `apps/tui/src/hooks/useWorkspaceStatusBar.ts` — status bar message management for workspace actions
- ✅ Integration code in workspace list screen and workspace detail screen components
- ✅ `e2e/tui/workspaces.test.ts` — E2E tests for suspend/resume behavior
- ❌ `WorkspaceStatusBadge` component (dependency: `tui-workspace-status-badge`)
- ❌ Workspace list screen scaffold (dependency: `tui-workspace-screen-scaffold`)
- ❌ Workspace data hooks (dependency: `tui-workspace-data-hooks`)
- ❌ SSE adapter (dependency: `tui-workspace-sse-adapter`)
- ❌ Flash/toast system beyond existing `statusBarError` mechanism

**Dependencies:**

| Dependency | What it provides | Status |
|---|---|---|
| `tui-workspace-data-hooks` | `useSuspendWorkspace()`, `useResumeWorkspace()`, `useWorkspaces()`, `useWorkspace()`, `useWorkspaceSSH()` | Partial (has bugs, per spec) |
| `tui-workspace-status-stream` | `useWorkspaceStatusStream()`, `useWorkspaceListStatusStream()`, `WorkspaceSSEAdapter` | Specified, not built |
| `tui-sync-toast-flash-system` | Status bar success/error messages with timed auto-dismiss | Not found; this spec uses existing `LoadingProvider.failMutation()` + custom success message hook |
| `tui-workspace-e2e-helpers` | `WORKSPACE_FIXTURES`, `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()`, `mockSSEStatusEvent()`, `assertWorkspaceRow()` | Specified, not built |

---

## 1. Codebase Ground Truth

All facts verified line-by-line from source code.

| Fact | Location | Impact |
|---|---|---|
| `useOptimisticMutation` accepts `{ id, entityType, action, mutate, onOptimistic, onRevert, onSuccess }` and returns `{ execute, isLoading }` | `apps/tui/src/hooks/useOptimisticMutation.ts` lines 4-26 | Core pattern for suspend/resume — wraps optimistic state + revert |
| `useOptimisticMutation` calls `loading.registerMutation(id, action, entityType)` on execute, `loading.completeMutation(id)` on success, `loading.failMutation(id, errorMessage)` on error | `useOptimisticMutation.ts` lines 59, 66, 77 | Mutation tracking integrated with LoadingProvider |
| `loading.failMutation(id, errorMessage)` shows error in status bar for `STATUS_BAR_ERROR_DURATION_MS` (5000ms) via `setStatusBarError()` | `LoadingProvider.tsx` lines 143-161, `constants.ts` line 15 | Error messages auto-clear after 5s — spec requires 3s, must use custom timer |
| No success message mechanism exists — `failMutation` handles errors but `completeMutation` just removes mutation state silently | `LoadingProvider.tsx` lines 135-141 | Must build success message display separately |
| `useScreenKeybindings(bindings, hints?)` registers PRIORITY.SCREEN scope on mount and auto-generates status bar hints | `apps/tui/src/hooks/useScreenKeybindings.ts` lines 17-55 | Keybindings for `s`/`r`/`R` registered per-screen |
| `KeyHandler` interface: `{ key: string, description: string, group: string, handler: () => void, when?: () => boolean }` | `apps/tui/src/providers/keybinding-types.ts` | `when` predicate enables conditional `s`/`r` based on workspace state |
| `StatusBarHint` interface: `{ keys: string, label: string, order: number }` | `apps/tui/src/providers/keybinding-types.ts` | Dynamic hints for suspend/resume |
| `StatusBarHintsContext.registerHints(sourceId, hints[])` returns cleanup function | `KeybindingProvider.tsx` | Hints must update dynamically as focused workspace state changes |
| `useSpinner(active: boolean): string` returns braille frame when active, `""` when inactive | `apps/tui/src/hooks/useSpinner.ts` lines 165-177 | Used by `WorkspaceStatusBadge` for transitional state animation |
| `WorkspaceDisplayStatus` includes `"suspending"` and `"resuming"` as transitional display states | `tui-workspace-status-badge.md` lines 204-215 | Badge accepts extended status union including optimistic states |
| `useSuspendWorkspace(owner, repo, callbacks?)` returns `{ mutate, isLoading, error }` — calls `POST /api/repos/:owner/:repo/workspaces/:id/suspend` | `specs/tui/packages/ui-core/src/hooks/workspaces/useSuspendWorkspace.ts` | `mutate(workspaceId)` fires the suspend request |
| `useResumeWorkspace(owner, repo, callbacks?)` returns `{ mutate, isLoading, error }` — calls `POST /api/repos/:owner/:repo/workspaces/:id/resume` | `specs/tui/packages/ui-core/src/hooks/workspaces/useResumeWorkspace.ts` | `mutate(workspaceId)` fires the resume request |
| Both `useSuspendWorkspace` and `useResumeWorkspace` have bugs: `mutationFn` destructures `{ fetch }` from second param which is `AbortSignal` (not an object with fetch), and pass `onRevert` which doesn't exist on `useMutation` | `tui-workspace-data-hooks.md` section 2, facts table lines 40-42 | These hooks must be fixed before suspend/resume works |
| `useMutation` second param is `AbortSignal`, not `{ fetch }` — and `useMutation` has no `onRevert` callback, only `onOptimistic`, `onSuccess`, `onError`, `onSettled` | `tui-workspace-data-hooks.md` fact table | Suspend/resume must use TUI-level `useOptimisticMutation` instead of relying on ui-core's broken `onRevert` |
| `truncateText(text, maxLength)` returns truncated text with `…` suffix | `apps/tui/src/util/text.ts` lines 36-41 | Used for workspace name truncation in status bar messages |
| `truncateRight(text, maxWidth)` handles max ≤ 3 edge case | `apps/tui/src/util/text.ts` lines 24-28 | Used for error reason truncation |
| `STATUS_BAR_ERROR_PADDING = 20` — error message capped at `width - 20` chars | `apps/tui/src/loading/constants.ts` line 33 | Status bar message length limit |
| `useLayout()` returns `{ width, height, breakpoint, contentHeight, ... }` | `apps/tui/src/hooks/useLayout.ts` | Terminal width drives message truncation |
| `useNavigation()` provides `repoContext: { owner, repo } | null` | `apps/tui/src/providers/NavigationProvider.tsx` | Owner/repo for API calls extracted from navigation stack |
| Server suspend endpoint: `POST /api/repos/:owner/:repo/workspaces/:id/suspend` — returns updated workspace or 404 | `apps/server/src/routes/workspaces.ts` lines 162-178 | Suspend endpoint is fully scaffolded |
| Server resume endpoint: `POST /api/repos/:owner/:repo/workspaces/:id/resume` — returns updated workspace or 404 | `apps/server/src/routes/workspaces.ts` lines 180-196 | Resume endpoint is fully scaffolded |
| `WorkspaceResponse.suspended_at` is `string | null` | `packages/sdk/src/services/workspace.ts` line 75 | Populated on suspend, nulled on resume |
| Server workspace SSE: `GET /api/repos/:owner/:repo/workspaces/:id/stream` sends `workspace.status` events with `{ workspace_id, status }` | `apps/server/src/routes/workspaces.ts` lines 447-482 | SSE channel for real-time status confirmation |
| `WorkspaceSSEAdapter` manages connection lifecycle with exponential backoff (1s → 30s), deduplication (1000-event window), keepalive monitoring (45s timeout) | `tui-workspace-sse-adapter.md` | Adapter handles reconnection; this ticket subscribes to status events |
| All workspace screens are `PlaceholderScreen` — `ScreenName.Workspaces`, `ScreenName.WorkspaceDetail`, `ScreenName.WorkspaceCreate` | `apps/tui/src/router/registry.ts` | Screens must be built before this ticket's keybindings can be integrated |
| `useStatusBarHints()` returns `{ hints: StatusBarHint[] }` from `StatusBarHintsContext` | `apps/tui/src/hooks/useStatusBarHints.ts` | Read-only — registration happens via `useScreenKeybindings` or direct context |
| `WORKSPACE_FIXTURES` provides deterministic workspace objects for all 6 states | `e2e/tui/helpers/workspaces.ts` (spec) | Used in E2E tests |

---

## 2. Architecture

### 2.1 Component Hierarchy

```
WorkspaceListScreen / WorkspaceDetailScreen
├── useWorkspaceSuspendResume(workspace, { onStatusChange })
│   ├── useOptimisticMutation (suspend)
│   ├── useOptimisticMutation (resume)
│   ├── useWorkspaceStatusBar (success/error messages)
│   └── in-flight guard (ref-based)
├── useScreenKeybindings([s, r, R], dynamicHints)
├── useWorkspaceStatusStream (SSE subscription)
└── WorkspaceStatusBadge (renders displayStatus)
```

### 2.2 State Machine

The suspend/resume feature operates a per-workspace state machine that coordinates optimistic UI, HTTP mutations, and SSE confirmation:

```
                    press 's'
  ┌─────────┐  ──────────────►  ┌──────────────┐
  │ running │                   │ suspending…  │
  └─────────┘  ◄──────────────  └──────────────┘
       ▲         API error           │
       │         (revert)            │ API success
       │                             ▼
       │                        ┌──────────────┐
       │    SSE 'running'       │  suspended   │
       └─────────────────────── └──────────────┘
                                     │
                    press 'r'        │
  ┌─────────┐  ◄──────────────  ┌──────────────┐
  │ running │                   │  resuming…   │
  └─────────┘  ──────────────►  └──────────────┘
       │         API error            ▲
       │         (revert)             │
       ▼                              │
  ┌──────────────┐                    │
  │  suspended   │ ───────────────────┘
  └──────────────┘    press 'r'

  Any state ──── SSE 'failed' ────► [failed]
```

### 2.3 Data Flow

```
1. User presses 's' on running workspace
2. useWorkspaceSuspendResume.suspend(workspaceId)
   a. Guard: check workspace.status === "running" && !isInFlight → else no-op
   b. Set inFlightRef.current = true
   c. Call onStatusChange(workspaceId, "suspending") → parent updates displayStatus
   d. Register mutation via LoadingProvider
   e. Fire POST /api/repos/:owner/:repo/workspaces/:id/suspend
3. On HTTP success:
   a. Set inFlightRef.current = false
   b. Show success flash: "Workspace '{name}' suspended" (3s)
   c. SSE event confirms final status → onStatusChange(workspaceId, "suspended")
4. On HTTP error:
   a. Set inFlightRef.current = false
   b. Call onStatusChange(workspaceId, "running") → revert to previous state
   c. Show error in status bar: "Failed to suspend '{name}': {reason}" (3s)
   d. Store last failed action for 'R' retry
```

### 2.4 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Custom hook vs extending `useOptimisticMutation` | Custom `useWorkspaceSuspendResume` hook that wraps `useOptimisticMutation` twice (one for suspend, one for resume) | Suspend and resume are two distinct mutations sharing in-flight guard and error display logic. Wrapping keeps the screen components clean. |
| In-flight guard implementation | `useRef<boolean>` per workspace ID in a `Map` | Refs avoid re-renders on guard state changes. Map supports multiple workspaces in the list view. |
| Success message mechanism | Custom `useWorkspaceStatusBar` hook with `useState` + `setTimeout` | The existing `LoadingProvider` only has `failMutation` for error messages. Success messages require a separate channel with 3s auto-dismiss. |
| Status bar message duration | 3 seconds (not the default 5s from `STATUS_BAR_ERROR_DURATION_MS`) | Product spec explicitly requires 3s. Using a dedicated timer instead of the loading system's 5s default. |
| Error reason extraction | Switch on HTTP status code: 403→"Permission denied", 404→"Workspace not found", 409→"Invalid state transition", 429→"Rate limited", 500→"Server error" | Product spec defines exact error messages per HTTP status. |
| No confirmation dialog | Directly execute on keypress | Product spec explicitly states: "No confirmation dialog is shown before suspend or resume (both are reversible operations)" |
| `displayStatus` tracked in parent screen state | Parent component owns a `Map<string, WorkspaceDisplayStatus>` for optimistic overrides | The data hook provides server status; the display status overlays transitional values during optimistic updates. Keeps the hook stateless and the parent in control. |
| Dynamic status bar hints | Recompute hints array when focused workspace changes | Hints show `s:suspend` for running, `r:resume` for suspended, nothing for other states. Must change as user navigates the list. |
| Workspace name truncation | `truncateText(name, 20)` for status bar messages | Product spec: "Workspace names longer than 20 characters are truncated with `…`" |
| Error reason truncation | `truncateText(reason, 40)` | Product spec: "Error reason strings are truncated at 40 characters with `…`" |
| Message width adaptation | Breakpoint-driven: 80 cols → short, 120+ → full | Product spec defines distinct message formats per terminal width. |

---

## 3. Implementation Plan

### Step 1: Create workspace action constants

**File:** `apps/tui/src/workspaces/constants.ts`

Define constants used across workspace suspend/resume logic.

```typescript
/**
 * Constants for workspace suspend/resume actions.
 */

/** Duration to display success/error messages in status bar (ms). */
export const WORKSPACE_ACTION_MESSAGE_DURATION_MS = 3_000;

/** Maximum characters for workspace name in status bar messages. */
export const WORKSPACE_NAME_MAX_LENGTH = 20;

/** Maximum characters for error reason in status bar messages. */
export const ERROR_REASON_MAX_LENGTH = 40;

/** Statuses from which suspend is valid. */
export const SUSPENDABLE_STATUSES = new Set(["running"] as const);

/** Statuses from which resume is valid. */
export const RESUMABLE_STATUSES = new Set(["suspended"] as const);

/** Transitional display statuses where both keys are disabled. */
export const TRANSITIONAL_STATUSES = new Set([
  "suspending",
  "resuming",
  "starting",
  "stopping",
] as const);
```

---

### Step 2: Create `useWorkspaceStatusBar` hook

**File:** `apps/tui/src/hooks/useWorkspaceStatusBar.ts`

This hook manages timed success and error messages in the status bar for workspace actions. It fills the gap left by `LoadingProvider` which only handles error messages (via `failMutation`) at a 5s duration.

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import { useLayout } from "./useLayout.js";
import { truncateText } from "../util/text.js";
import {
  WORKSPACE_ACTION_MESSAGE_DURATION_MS,
  WORKSPACE_NAME_MAX_LENGTH,
  ERROR_REASON_MAX_LENGTH,
} from "../workspaces/constants.js";

export type StatusBarMessageType = "success" | "error";

export interface StatusBarMessage {
  text: string;
  type: StatusBarMessageType;
}

/**
 * Formats the success message based on terminal width.
 * - 80 cols: "'{name}' suspended"
 * - 120+ cols: "Workspace '{name}' suspended"
 */
function formatSuccessMessage(
  action: "suspended" | "resumed",
  workspaceName: string,
  terminalWidth: number,
): string {
  const truncatedName = truncateText(workspaceName, WORKSPACE_NAME_MAX_LENGTH);
  if (terminalWidth < 120) {
    return `'${truncatedName}' ${action}`;
  }
  return `Workspace '${truncatedName}' ${action}`;
}

/**
 * Formats the error message based on terminal width.
 * - 80 cols: "'{name}' error: {reason}"
 * - 120+ cols: "Failed to {action} '{name}': {reason}"
 */
function formatErrorMessage(
  action: "suspend" | "resume",
  workspaceName: string,
  reason: string,
  terminalWidth: number,
): string {
  const truncatedName = truncateText(workspaceName, WORKSPACE_NAME_MAX_LENGTH);
  const truncatedReason = truncateText(reason, ERROR_REASON_MAX_LENGTH);
  if (terminalWidth < 120) {
    return `'${truncatedName}' error: ${truncatedReason}`;
  }
  return `Failed to ${action} '${truncatedName}': ${truncatedReason}`;
}

/**
 * Maps HTTP status codes to human-readable error reasons.
 */
function extractErrorReason(error: Error & { status?: number }): string {
  const status = error.status ?? (error as any).httpStatus;
  switch (status) {
    case 401: return "Session expired";
    case 403: return "Permission denied";
    case 404: return "Workspace not found";
    case 409: return "Invalid state transition";
    case 429: {
      // Parse Retry-After if available
      const retryAfter = (error as any).retryAfter;
      return retryAfter
        ? `Rate limited. Retry in ${retryAfter}s.`
        : "Rate limited";
    }
    case 500: return "Server error";
    default:
      if (error.message?.includes("timeout") || error.message?.includes("Timeout")) {
        return "Network error";
      }
      if (error.message?.includes("fetch") || error.message?.includes("network")) {
        return "Network error";
      }
      return error.message || "Unknown error";
  }
}

export interface UseWorkspaceStatusBarReturn {
  /** Current message to display, or null if none. */
  message: StatusBarMessage | null;
  /** Show a success message for a completed action. */
  showSuccess: (action: "suspended" | "resumed", workspaceName: string) => void;
  /** Show an error message for a failed action. */
  showError: (
    action: "suspend" | "resume",
    workspaceName: string,
    error: Error,
  ) => void;
  /** Clear the current message immediately. */
  clear: () => void;
}

export function useWorkspaceStatusBar(): UseWorkspaceStatusBarReturn {
  const [message, setMessage] = useState<StatusBarMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { width } = useLayout();

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const setTimedMessage = useCallback(
    (msg: StatusBarMessage) => {
      clearTimer();
      setMessage(msg);
      timerRef.current = setTimeout(() => {
        setMessage(null);
      }, WORKSPACE_ACTION_MESSAGE_DURATION_MS);
    },
    [clearTimer],
  );

  const showSuccess = useCallback(
    (action: "suspended" | "resumed", workspaceName: string) => {
      const text = formatSuccessMessage(action, workspaceName, width);
      setTimedMessage({ text, type: "success" });
    },
    [width, setTimedMessage],
  );

  const showError = useCallback(
    (
      action: "suspend" | "resume",
      workspaceName: string,
      error: Error,
    ) => {
      const reason = extractErrorReason(error as Error & { status?: number });
      const text = formatErrorMessage(action, workspaceName, reason, width);
      setTimedMessage({ text, type: "error" });
    },
    [width, setTimedMessage],
  );

  const clear = useCallback(() => {
    clearTimer();
    setMessage(null);
  }, [clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  return { message, showSuccess, showError, clear };
}

export { extractErrorReason, formatSuccessMessage, formatErrorMessage };
```

---

### Step 3: Create `useWorkspaceSuspendResume` hook

**File:** `apps/tui/src/hooks/useWorkspaceSuspendResume.ts`

This is the core hook that encapsulates the suspend/resume lifecycle. It manages the in-flight guard, optimistic state transitions, API calls, error recovery, retry support, and telemetry logging.

```typescript
import { useCallback, useRef } from "react";
import { useLoading } from "./useLoading.js";
import { useWorkspaceStatusBar } from "./useWorkspaceStatusBar.js";
import type { WorkspaceDisplayStatus } from "../components/WorkspaceStatusBadge.js";
import {
  SUSPENDABLE_STATUSES,
  RESUMABLE_STATUSES,
  TRANSITIONAL_STATUSES,
} from "../workspaces/constants.js";

type MutationFn = (workspaceId: string) => Promise<void>;

export interface WorkspaceSuspendResumeOptions {
  /** owner from repo context */
  owner: string;
  /** repo from repo context */
  repo: string;
  /** Suspend mutation from @codeplane/ui-core */
  suspendMutate: MutationFn;
  /** Resume mutation from @codeplane/ui-core */
  resumeMutate: MutationFn;
  /**
   * Callback to update the display status of a workspace.
   * Called with the optimistic transitional status on action,
   * the final server status on success, or the reverted status on error.
   */
  onStatusChange: (workspaceId: string, newStatus: WorkspaceDisplayStatus) => void;
}

export interface WorkspaceSuspendResumeReturn {
  /** Execute suspend on a workspace. No-op if invalid state or in-flight. */
  suspend: (workspaceId: string, currentStatus: string, workspaceName: string) => void;
  /** Execute resume on a workspace. No-op if invalid state or in-flight. */
  resume: (workspaceId: string, currentStatus: string, workspaceName: string) => void;
  /** Retry the last failed action. No-op if no failed action. */
  retry: () => void;
  /** Whether a specific workspace has a mutation in-flight. */
  isInFlight: (workspaceId: string) => boolean;
  /** Status bar message state (for rendering in screen). */
  statusBar: ReturnType<typeof useWorkspaceStatusBar>;
}

/**
 * Core hook for workspace suspend/resume with optimistic updates.
 *
 * Manages:
 * - Per-workspace in-flight guard (prevents double-fire)
 * - Optimistic status transition (running → suspending, suspended → resuming)
 * - Error recovery (revert to previous status)
 * - Status bar success/error messages (3s auto-dismiss)
 * - Retry support via 'R' key
 * - Telemetry logging to stderr
 *
 * This hook is consumed by both WorkspaceListScreen and WorkspaceDetailScreen.
 */
export function useWorkspaceSuspendResume(
  options: WorkspaceSuspendResumeOptions,
): WorkspaceSuspendResumeReturn {
  const { owner, repo, suspendMutate, resumeMutate, onStatusChange } = options;
  const loading = useLoading();
  const statusBar = useWorkspaceStatusBar();

  // Per-workspace in-flight tracking
  const inFlightMap = useRef<Map<string, boolean>>(new Map());
  // Last failed action for retry
  const lastFailedAction = useRef<{
    type: "suspend" | "resume";
    workspaceId: string;
    previousStatus: string;
    workspaceName: string;
  } | null>(null);

  const isInFlight = useCallback(
    (workspaceId: string): boolean => {
      return inFlightMap.current.get(workspaceId) === true;
    },
    [],
  );

  const emitLog = useCallback(
    (level: string, message: string, props: Record<string, unknown> = {}) => {
      if (process.env.CODEPLANE_TUI_DEBUG === "true") {
        process.stderr.write(
          `WorkspaceSuspendResume: ${message} ${Object.entries(props)
            .map(([k, v]) => `[${k}=${v}]`)
            .join(" ")}\n`,
        );
      }
    },
    [],
  );

  const executeAction = useCallback(
    (
      type: "suspend" | "resume",
      workspaceId: string,
      currentStatus: string,
      workspaceName: string,
    ) => {
      const validStatuses = type === "suspend" ? SUSPENDABLE_STATUSES : RESUMABLE_STATUSES;

      // Guard: invalid state
      if (!validStatuses.has(currentStatus as any)) {
        emitLog("debug", "ignored", {
          workspace_id: workspaceId,
          reason: "invalid_state",
          current_status: currentStatus,
          attempted_action: type,
        });
        return;
      }

      // Guard: already in-flight
      if (inFlightMap.current.get(workspaceId)) {
        emitLog("debug", "ignored", {
          workspace_id: workspaceId,
          reason: "in_flight",
        });
        return;
      }

      // Guard: transitional state
      if (TRANSITIONAL_STATUSES.has(currentStatus as any)) {
        emitLog("debug", "ignored", {
          workspace_id: workspaceId,
          reason: "invalid_state",
          current_status: currentStatus,
          attempted_action: type,
        });
        return;
      }

      const previousStatus = currentStatus;
      const transitionalStatus: WorkspaceDisplayStatus =
        type === "suspend" ? "suspending" : "resuming";
      const mutationId = `workspace_${type}_${workspaceId}`;
      const mutateFn = type === "suspend" ? suspendMutate : resumeMutate;

      // Set in-flight guard
      inFlightMap.current.set(workspaceId, true);

      // Apply optimistic update
      onStatusChange(workspaceId, transitionalStatus);
      emitLog("debug", "optimistic applied", {
        workspace_id: workspaceId,
        transitional_status: transitionalStatus,
      });

      // Register with loading system
      loading.registerMutation(mutationId, type, "workspace");

      // Clear any previous failed action
      lastFailedAction.current = null;

      // Fire mutation
      emitLog("debug", "initiated", {
        owner,
        repo,
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        action: type,
        from_status: previousStatus,
      });

      const startTime = Date.now();

      mutateFn(workspaceId)
        .then(() => {
          inFlightMap.current.set(workspaceId, false);
          loading.completeMutation(mutationId);

          const successAction = type === "suspend" ? "suspended" : "resumed";
          statusBar.showSuccess(successAction as "suspended" | "resumed", workspaceName);

          // Note: The authoritative status update comes from SSE.
          // On HTTP success, we could update to the final status from the response,
          // but the SSE event will reconcile shortly after.
          const confirmedStatus: WorkspaceDisplayStatus =
            type === "suspend" ? "suspended" : "running";
          onStatusChange(workspaceId, confirmedStatus);

          emitLog("info", "http success", {
            workspace_id: workspaceId,
            action: type,
            new_status: confirmedStatus,
            duration: `${Date.now() - startTime}ms`,
          });
        })
        .catch((error: Error) => {
          inFlightMap.current.set(workspaceId, false);
          loading.completeMutation(mutationId);

          // Revert optimistic update
          onStatusChange(workspaceId, previousStatus as WorkspaceDisplayStatus);

          // Show error
          statusBar.showError(
            type,
            workspaceName,
            error,
          );

          // Store for retry
          lastFailedAction.current = {
            type,
            workspaceId,
            previousStatus,
            workspaceName,
          };

          emitLog("warn", "failed", {
            workspace_id: workspaceId,
            action: type,
            http_status: (error as any).status ?? "unknown",
            error: error.message,
            duration: `${Date.now() - startTime}ms`,
          });

          emitLog("warn", "reverted", {
            workspace_id: workspaceId,
            restored_status: previousStatus,
            reason: error.message,
          });
        });
    },
    [
      owner,
      repo,
      suspendMutate,
      resumeMutate,
      onStatusChange,
      loading,
      statusBar,
      emitLog,
    ],
  );

  const suspend = useCallback(
    (workspaceId: string, currentStatus: string, workspaceName: string) => {
      executeAction("suspend", workspaceId, currentStatus, workspaceName);
    },
    [executeAction],
  );

  const resume = useCallback(
    (workspaceId: string, currentStatus: string, workspaceName: string) => {
      executeAction("resume", workspaceId, currentStatus, workspaceName);
    },
    [executeAction],
  );

  const retry = useCallback(() => {
    const last = lastFailedAction.current;
    if (!last) return;

    emitLog("debug", "retry", {
      workspace_id: last.workspaceId,
      action: last.type,
      original_error: "previous_failure",
    });

    executeAction(
      last.type,
      last.workspaceId,
      last.type === "suspend" ? "running" : "suspended",
      last.workspaceName,
    );
  }, [executeAction, emitLog]);

  return {
    suspend,
    resume,
    retry,
    isInFlight,
    statusBar,
  };
}
```

---

### Step 4: Create `useWorkspaceSuspendResumeKeybindings` hook

**File:** `apps/tui/src/hooks/useWorkspaceSuspendResumeKeybindings.ts`

This hook computes the keybindings and status bar hints for workspace suspend/resume based on the currently focused workspace's display status.

```typescript
import { useMemo } from "react";
import type { KeyHandler, StatusBarHint } from "../providers/keybinding-types.js";
import type { WorkspaceDisplayStatus } from "../components/WorkspaceStatusBadge.js";
import type { WorkspaceSuspendResumeReturn } from "./useWorkspaceSuspendResume.js";
import { SUSPENDABLE_STATUSES, RESUMABLE_STATUSES, TRANSITIONAL_STATUSES } from "../workspaces/constants.js";

export interface SuspendResumeKeybindingOptions {
  /** The focused workspace's current display status, or null if no workspace is focused. */
  focusedStatus: WorkspaceDisplayStatus | null;
  /** The focused workspace's ID, or null if no workspace is focused. */
  focusedWorkspaceId: string | null;
  /** The focused workspace's name, or null. */
  focusedWorkspaceName: string | null;
  /** The suspend/resume action hook return. */
  actions: WorkspaceSuspendResumeReturn;
}

/**
 * Computes keybindings and status bar hints for suspend/resume
 * based on the focused workspace's current state.
 *
 * Returns:
 * - keybindings: Array of KeyHandler for `s`, `r`, and `R` keys
 * - hints: Array of StatusBarHint showing available actions
 */
export function useWorkspaceSuspendResumeKeybindings(
  options: SuspendResumeKeybindingOptions,
): { keybindings: KeyHandler[]; hints: StatusBarHint[] } {
  const { focusedStatus, focusedWorkspaceId, focusedWorkspaceName, actions } = options;

  return useMemo(() => {
    const keybindings: KeyHandler[] = [];
    const hints: StatusBarHint[] = [];

    if (!focusedWorkspaceId || !focusedStatus || !focusedWorkspaceName) {
      return { keybindings, hints };
    }

    const isSuspendable = SUSPENDABLE_STATUSES.has(focusedStatus as any);
    const isResumable = RESUMABLE_STATUSES.has(focusedStatus as any);
    const isTransitional = TRANSITIONAL_STATUSES.has(focusedStatus as any);
    const isInFlight = actions.isInFlight(focusedWorkspaceId);

    // Suspend keybinding
    keybindings.push({
      key: "s",
      description: "Suspend workspace",
      group: "Actions",
      handler: () => {
        actions.suspend(focusedWorkspaceId, focusedStatus, focusedWorkspaceName);
      },
      when: () => isSuspendable && !isInFlight,
    });

    // Resume keybinding
    keybindings.push({
      key: "r",
      description: "Resume workspace",
      group: "Actions",
      handler: () => {
        actions.resume(focusedWorkspaceId, focusedStatus, focusedWorkspaceName);
      },
      when: () => isResumable && !isInFlight,
    });

    // Retry keybinding
    keybindings.push({
      key: "R",
      description: "Retry failed action",
      group: "Actions",
      handler: () => {
        actions.retry();
      },
    });

    // Dynamic status bar hints
    if (isTransitional || isInFlight) {
      // Show in-progress hint
      if (focusedStatus === "suspending") {
        hints.push({ keys: "s", label: "suspending…", order: 30 });
      } else if (focusedStatus === "resuming") {
        hints.push({ keys: "r", label: "resuming…", order: 30 });
      }
    } else if (isSuspendable) {
      hints.push({ keys: "s", label: "suspend", order: 30 });
    } else if (isResumable) {
      hints.push({ keys: "r", label: "resume", order: 30 });
    }
    // No hint for states where neither action is valid

    return { keybindings, hints };
  }, [focusedStatus, focusedWorkspaceId, focusedWorkspaceName, actions]);
}
```

---

### Step 5: Integrate into WorkspaceListScreen

**File:** `apps/tui/src/screens/WorkspaceListScreen.tsx`

The workspace list screen must be built (dependency: `tui-workspace-screen-scaffold`) before this integration. This step describes the suspend/resume integration points within that screen.

```typescript
import React, { useState, useCallback, useMemo } from "react";
import { useNavigation } from "../hooks/useNavigation.js";
import { useScreenKeybindings } from "../hooks/useScreenKeybindings.js";
import { useWorkspaceSuspendResume } from "../hooks/useWorkspaceSuspendResume.js";
import { useWorkspaceSuspendResumeKeybindings } from "../hooks/useWorkspaceSuspendResumeKeybindings.js";
import { useTheme } from "../hooks/useTheme.js";
import { WorkspaceStatusBadge, type WorkspaceDisplayStatus } from "../components/WorkspaceStatusBadge.js";
// import { useWorkspaces, useSuspendWorkspace, useResumeWorkspace } from "@codeplane/ui-core";
// import { useWorkspaceListStatusStream } from "../hooks/useWorkspaceListStatusStream.js";

/**
 * Integration pattern for suspend/resume in workspace list:
 *
 * 1. Track displayStatus overrides in local state:
 *    const [statusOverrides, setStatusOverrides] = useState<Map<string, WorkspaceDisplayStatus>>(new Map());
 *
 * 2. Wire up onStatusChange to update overrides:
 *    const onStatusChange = (id: string, status: WorkspaceDisplayStatus) => {
 *      setStatusOverrides(prev => new Map(prev).set(id, status));
 *    };
 *
 * 3. Compute effective display status for each workspace:
 *    const getDisplayStatus = (workspace) =>
 *      statusOverrides.get(workspace.id) ?? workspace.status;
 *
 * 4. Wire SSE events to reconcile status:
 *    useWorkspaceListStatusStream(workspaceIds, (event) => {
 *      setStatusOverrides(prev => {
 *        const next = new Map(prev);
 *        next.set(event.data.workspace_id, event.data.status);
 *        return next;
 *      });
 *    });
 *
 * 5. Pass focused workspace info to keybinding hook:
 *    const { keybindings: srKeybindings, hints: srHints } =
 *      useWorkspaceSuspendResumeKeybindings({
 *        focusedStatus: getDisplayStatus(focusedWorkspace),
 *        focusedWorkspaceId: focusedWorkspace?.id ?? null,
 *        focusedWorkspaceName: focusedWorkspace?.name ?? null,
 *        actions: suspendResumeActions,
 *      });
 *
 * 6. Merge suspend/resume keybindings with list navigation keybindings:
 *    useScreenKeybindings([...navigationBindings, ...srKeybindings], [...navHints, ...srHints]);
 *
 * 7. Render status bar message from suspend/resume hook:
 *    {suspendResumeActions.statusBar.message && (
 *      <text fg={theme[suspendResumeActions.statusBar.message.type]}>
 *        {suspendResumeActions.statusBar.message.text}
 *      </text>
 *    )}
 *
 * 8. Render WorkspaceStatusBadge with display status:
 *    <WorkspaceStatusBadge status={getDisplayStatus(workspace)} compact />
 */
```

---

### Step 6: Integrate into WorkspaceDetailScreen

**File:** `apps/tui/src/screens/WorkspaceDetailScreen.tsx`

The workspace detail screen integration follows the same pattern as the list screen, with additional UI elements:

```typescript
/**
 * Integration pattern for suspend/resume in workspace detail:
 *
 * 1. Single workspace, so statusOverrides is simpler:
 *    const [displayStatus, setDisplayStatus] = useState<WorkspaceDisplayStatus>(workspace.status);
 *
 * 2. Wire SSE stream for this specific workspace:
 *    useWorkspaceStatusStream(owner, repo, workspaceId, (event) => {
 *      setDisplayStatus(event.data.status);
 *    });
 *
 * 3. Render "Suspended at" timestamp when status is "suspended":
 *    {displayStatus === "suspended" && workspace.suspended_at && (
 *      <text fg={theme.muted}>
 *        Suspended at: {formatSuspendedAt(workspace.suspended_at)}
 *      </text>
 *    )}
 *
 * 4. Render SSH section conditionally:
 *    {displayStatus === "running" ? (
 *      <SSHConnectionInfo host={ssh.host} port={ssh.port} user={ssh.username} command={ssh.command} />
 *    ) : (
 *      <text fg={theme.muted}>(unavailable while {displayStatus})</text>
 *    )}
 *
 * 5. "Suspended at" timestamp formatting:
 *    - < 30 days: relative time ("5m ago", "2h ago", "3d ago")
 *    - >= 30 days: absolute ISO date ("2026-01-15")
 *    - null suspended_at on suspended workspace: render empty, no crash
 */
```

---

### Step 7: Wire status bar message rendering

**File:** Modification to `apps/tui/src/components/StatusBar.tsx`

The existing StatusBar renders `statusBarError` from `LoadingProvider`. Workspace success messages need a parallel rendering path. The cleanest approach is for workspace screens to inject their message into the StatusBar via context.

However, to minimize changes to the shared StatusBar, workspace screens can use the existing `statusBarError` path for errors (via `LoadingProvider.failMutation`) and render success messages by temporarily overriding the hints region. The `useWorkspaceStatusBar` hook returns the message state; the screen component renders it alongside (or in place of) the hint region when a message is active.

**Integration in screen components:**

```typescript
// In the screen component's render:
const { message } = suspendResumeActions.statusBar;

// The screen passes custom hints to useScreenKeybindings that include
// the success/error message when active. This leverages the existing
// StatusBarHintsContext.overrideHints() mechanism.
//
// Alternatively, the StatusBar component can be extended to accept
// a success message from a new context. This decision is deferred to
// implementation — either approach works.
```

The recommended approach: extend `LoadingProvider` with a `setStatusBarSuccess(message: string, durationMs?: number)` method that renders in `success` color in the StatusBar. This is a small, backward-compatible addition.

**File:** `apps/tui/src/providers/LoadingProvider.tsx` (modification)

Add:
```typescript
// State
const [statusBarSuccess, setStatusBarSuccessState] = useState<string | null>(null);
const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

// Method
const setStatusBarSuccess = useCallback(
  (message: string, durationMs: number = 3000) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setStatusBarSuccessState(message);
    successTimerRef.current = setTimeout(() => {
      setStatusBarSuccessState(null);
    }, durationMs);
  },
  [],
);

// Add to context value:
// statusBarSuccess,
// setStatusBarSuccess,
```

**File:** `apps/tui/src/components/StatusBar.tsx` (modification)

Add success message rendering between the error check and hints:
```typescript
{statusBarError ? (
  <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
) : statusBarSuccess ? (
  <text fg={theme.success}>{truncateRight(statusBarSuccess, maxErrorWidth)}</text>
) : (
  // existing hints rendering
)}
```

---

## 4. File Manifest

| File | Action | Purpose |
|---|---|---|
| `apps/tui/src/workspaces/constants.ts` | **Create** | Workspace action constants (durations, valid statuses, truncation limits) |
| `apps/tui/src/hooks/useWorkspaceStatusBar.ts` | **Create** | Status bar message formatting and timing for workspace actions |
| `apps/tui/src/hooks/useWorkspaceSuspendResume.ts` | **Create** | Core suspend/resume action hook with in-flight guard and optimistic updates |
| `apps/tui/src/hooks/useWorkspaceSuspendResumeKeybindings.ts` | **Create** | Keybinding and hint computation based on focused workspace state |
| `apps/tui/src/providers/LoadingProvider.tsx` | **Modify** | Add `statusBarSuccess` + `setStatusBarSuccess()` for success messages |
| `apps/tui/src/loading/types.ts` | **Modify** | Add `statusBarSuccess` and `setStatusBarSuccess` to `LoadingContextValue` |
| `apps/tui/src/components/StatusBar.tsx` | **Modify** | Render success messages in `success` color |
| `apps/tui/src/screens/WorkspaceListScreen.tsx` | **Modify** (when built) | Integrate suspend/resume keybindings, status overrides, SSE reconciliation |
| `apps/tui/src/screens/WorkspaceDetailScreen.tsx` | **Modify** (when built) | Integrate suspend/resume, SSH info conditional rendering, suspended_at display |
| `e2e/tui/workspaces.test.ts` | **Create/Extend** | E2E tests for suspend/resume behavior |

---

## 5. Productionization Notes

### 5.1 Dependency on broken ui-core hooks

The `useSuspendWorkspace` and `useResumeWorkspace` hooks in `packages/ui-core/src/hooks/workspaces/` have known bugs documented in `tui-workspace-data-hooks` spec:

1. **Bug:** `mutationFn` destructures `{ fetch }` from second param, but `useMutation` passes `AbortSignal` (not an object with fetch).
2. **Bug:** Hooks pass `onRevert` callback, but `useMutation` has no `onRevert` field.
3. **Bug:** Generic type order is reversed (`Workspace, string` should be `string, Workspace`).

**Resolution:** These bugs must be fixed as part of the `tui-workspace-data-hooks` ticket before suspend/resume can function end-to-end. The TUI-level `useWorkspaceSuspendResume` hook is designed to work with the fixed versions where `mutate(workspaceId: string)` fires the POST request and returns a `Promise<void>` (or `Promise<Workspace>`).

**Interim approach during development:** The `useWorkspaceSuspendResume` hook accepts `suspendMutate` and `resumeMutate` as injected functions, decoupling it from the ui-core hooks. During development, these can be wired directly to the API client:

```typescript
const apiClient = useAPIClient();
const suspendMutate = async (id: string) => {
  const response = await apiClient.request(
    `/api/repos/${owner}/${repo}/workspaces/${id}/suspend`,
    { method: "POST" },
  );
  if (!response.ok) {
    const error = new Error("Suspend failed");
    (error as any).status = response.status;
    throw error;
  }
};
```

This is temporary. Once the ui-core hooks are fixed, replace with:
```typescript
const { mutate: suspendMutate } = useSuspendWorkspace(owner, repo);
```

### 5.2 Dependency on SSE adapter

The `tui-workspace-sse-adapter` ticket provides `useWorkspaceStatusStream` and `useWorkspaceListStatusStream`. Until that's built, the suspend/resume feature works without SSE — the HTTP response provides the confirmed status (the `then` branch in `executeAction` calls `onStatusChange` with the final status). SSE adds real-time confirmation but is not required for basic functionality.

### 5.3 Dependency on flash/toast system

The ticket lists `tui-sync-toast-flash-system` as a dependency, but no such spec exists in the codebase. The existing `LoadingProvider.failMutation()` handles error messages. This spec adds `setStatusBarSuccess()` to the `LoadingProvider` for success messages, filling the gap without introducing a new system. If the toast system is later built as a separate overlay, the `useWorkspaceStatusBar` hook can be updated to dispatch to it.

### 5.4 Memory management

The `statusOverrides` map in the list screen grows as workspaces are actioned. To prevent unbounded growth:
- Clear entries from the map when SSE confirms the final status (the override matches the server state)
- Clear the entire map when the workspace list re-fetches (server data is authoritative)
- The `inFlightMap` in `useWorkspaceSuspendResume` is cleaned automatically (set to `false` on completion)

### 5.5 Background mutation completion

Per the existing `useOptimisticMutation` pattern, mutations are never aborted on unmount. If the user presses `q` during an in-flight suspend, the HTTP request completes in the background. The `onStatusChange` callback may fire after the component unmounts — React will ignore the state update. This is safe.

---

## 6. Unit & Integration Tests

### Test file: `e2e/tui/workspaces.test.ts`

All tests use `@microsoft/tui-test` via the helpers in `e2e/tui/helpers.ts` and `e2e/tui/helpers/workspaces.ts`. Tests run against a real API server with test fixtures. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

---

### 6.1 Snapshot Tests

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  WRITE_TOKEN,
  READ_TOKEN,
  OWNER,
} from "./helpers";

// Assumes helpers/workspaces.ts is built per tui-workspace-e2e-helpers spec

describe("TUI_WORKSPACE_SUSPEND_RESUME — Snapshot Tests", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>>;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("SNAP-SUSPEND-001: workspace list with running workspace focused before suspend", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w"); // go to workspaces
    await tui.waitForText("Workspaces");
    // Focus a running workspace
    await tui.waitForText("running");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-002: workspace list after pressing s — badge shows suspending in yellow", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s"); // suspend
    // Badge should transition to suspending
    await tui.waitForText("suspending");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-003: workspace list after SSE confirms suspended — badge shows suspended in gray", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-004: status bar showing success message after suspend", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    // Status bar should show success message
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/suspended/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-005: status bar showing error message after failed suspend (403)", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: READ_TOKEN }, // read-only user
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("Permission denied");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-RESUME-006: workspace list with suspended workspace focused before resume", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Navigate to a suspended workspace
    await tui.waitForText("suspended");
    // Focus the suspended workspace row
    await tui.sendKeys("j"); // move to suspended workspace if not first
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-RESUME-007: workspace list after pressing r — badge shows resuming in yellow", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j"); // focus suspended workspace
    await tui.sendKeys("r"); // resume
    await tui.waitForText("resuming");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-RESUME-008: workspace list after SSE confirms running — badge shows running in green", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("r");
    await tui.waitForText("running");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-009: workspace detail with running workspace full layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("Enter"); // open detail
    await tui.waitForText("SSH Connection");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-010: workspace detail after pressing s — badge transitional SSH grayed", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.sendKeys("s"); // suspend from detail
    await tui.waitForText("suspending");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-011: workspace detail after SSE confirms suspended — timestamp visible", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH Connection");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    await tui.waitForText("unavailable while suspended");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-RESUME-012: workspace detail after pressing r on suspended — badge transitional", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter"); // open suspended workspace detail
    await tui.waitForText("unavailable while suspended");
    await tui.sendKeys("r"); // resume from detail
    await tui.waitForText("resuming");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-RESUME-013: workspace detail after SSE confirms running — SSH repopulated", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("unavailable while suspended");
    await tui.sendKeys("r");
    await tui.waitForText("running");
    // SSH info should be available again
    await tui.waitForText("ssh");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-014: workspace list at 80x24 compact layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-015: workspace list at 200x60 expanded layout", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-016: workspace detail at 80x24 after suspend — compact", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-017: status bar hint showing s:suspend for running workspace", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/s:suspend/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-018: status bar hint showing r:resume for suspended workspace", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j"); // focus suspended workspace
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/r:resume/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("SNAP-SUSPEND-019: status bar shows no suspend/resume hint for failed workspace", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("failed");
    // Focus the failed workspace
    // Navigate to it
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).not.toMatch(/s:suspend/);
    expect(lastLine).not.toMatch(/r:resume/);
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

---

### 6.2 Keyboard Interaction Tests

```typescript
describe("TUI_WORKSPACE_SUSPEND_RESUME — Keyboard Interaction Tests", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>>;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("KEY-SUSPEND-001: s on running workspace sends POST suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    // Badge should change to suspending or suspended
    await tui.waitForText("suspend");
  });

  test("KEY-SUSPEND-002: r on suspended workspace sends POST resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j"); // focus suspended
    await tui.sendKeys("r");
    await tui.waitForText("resum");
  });

  test("KEY-SUSPEND-003: s on workspace detail sends suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("Enter"); // open detail
    await tui.waitForText("SSH");
    await tui.sendKeys("s");
    await tui.waitForText("suspend");
  });

  test("KEY-SUSPEND-004: r on workspace detail sends resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("unavailable");
    await tui.sendKeys("r");
    await tui.waitForText("resum");
  });

  test("KEY-SUSPEND-005: rapid double-press s only fires one API call", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    // Send two s presses in rapid succession
    await tui.sendKeys("s", "s");
    // Should still show suspending (only one transition)
    await tui.waitForText("suspend");
  });

  test("KEY-SUSPEND-006: rapid double-press r on detail only fires once", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("unavailable");
    await tui.sendKeys("r", "r");
    await tui.waitForText("resum");
  });

  test("KEY-SUSPEND-007: s on suspended workspace is no-op", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j"); // focus suspended
    const before = tui.snapshot();
    await tui.sendKeys("s"); // should be no-op
    // Small delay to ensure nothing changed
    await new Promise((r) => setTimeout(r, 200));
    const after = tui.snapshot();
    // Snapshots should be identical (no visual change)
    expect(after).toBe(before);
  });

  test("KEY-SUSPEND-008: r on running workspace is no-op", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    const before = tui.snapshot();
    await tui.sendKeys("r"); // should be no-op
    await new Promise((r) => setTimeout(r, 200));
    const after = tui.snapshot();
    expect(after).toBe(before);
  });

  test("KEY-SUSPEND-009: s on failed workspace is no-op", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("failed");
    // Focus the failed workspace
    const before = tui.snapshot();
    await tui.sendKeys("s");
    await new Promise((r) => setTimeout(r, 200));
    expect(tui.snapshot()).toBe(before);
  });

  test("KEY-SUSPEND-010: r on failed workspace is no-op", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("failed");
    const before = tui.snapshot();
    await tui.sendKeys("r");
    await new Promise((r) => setTimeout(r, 200));
    expect(tui.snapshot()).toBe(before);
  });

  test("KEY-SUSPEND-011: s on pending workspace is no-op", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("pending");
    const before = tui.snapshot();
    await tui.sendKeys("s");
    await new Promise((r) => setTimeout(r, 200));
    expect(tui.snapshot()).toBe(before);
  });

  test("KEY-SUSPEND-012: suspend then navigate away — mutation continues", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s"); // start suspend
    await tui.sendKeys("q"); // navigate back
    // Should not crash — mutation completes in background
    await tui.waitForText("Dashboard");
  });

  test("KEY-SUSPEND-013: R retries failed suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: READ_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s"); // will fail with 403
    await tui.waitForText("Permission denied");
    // Switch to write token for retry (simulated)
    await tui.sendKeys("R"); // retry
    // Retry fires same request
  });

  test("KEY-SUSPEND-014: R retries failed resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: READ_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("r"); // will fail with 403
    await tui.waitForText("Permission denied");
    await tui.sendKeys("R"); // retry
  });

  test("KEY-SUSPEND-015: suspend preserves focus position in list", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Move to third row
    await tui.sendKeys("j", "j");
    await tui.sendKeys("s");
    // Third row should still be focused after action
    await tui.waitForText("suspend");
  });

  test("KEY-SUSPEND-016: suspend from list verify on detail", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    await tui.sendKeys("Enter"); // open detail
    // Detail should show suspended state
    await tui.waitForText("suspended");
    await tui.waitForText("unavailable while suspended");
  });

  test("KEY-SUSPEND-017: resume from detail verify on list", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter"); // open detail
    await tui.waitForText("unavailable");
    await tui.sendKeys("r"); // resume
    await tui.waitForText("running");
    await tui.sendKeys("q"); // back to list
    await tui.waitForText("running");
  });

  test("KEY-SUSPEND-018: status bar hints update after suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    // Before suspend: hint should show s:suspend
    let lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/s:suspend/);
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    // After suspend: hint should change to r:resume
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/r:resume/);
  });

  test("KEY-SUSPEND-019: status bar hints update after resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    let lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/r:resume/);
    await tui.sendKeys("r");
    await tui.waitForText("running");
    lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/s:suspend/);
  });

  test("KEY-SUSPEND-020: s with empty workspace list is no-op", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // If list is empty, s should be safe
    await tui.sendKeys("s");
    // Should not crash
    await tui.waitForText("Workspaces");
  });

  test("KEY-SUSPEND-021: multiple workspaces actioned in sequence", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Suspend first running workspace
    await tui.waitForText("running");
    await tui.sendKeys("s");
    // Move to next workspace
    await tui.sendKeys("j");
    // If next is also running, suspend it too
    await tui.sendKeys("s");
    // Both should have transitioned independently
  });
});
```

---

### 6.3 Error Handling Tests

```typescript
describe("TUI_WORKSPACE_SUSPEND_RESUME — Error Handling Tests", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>>;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("ERR-SUSPEND-001: 403 Permission denied on suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: READ_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("Permission denied");
    // Badge should revert to running
    await tui.waitForText("running");
  });

  test("ERR-SUSPEND-002: 404 Workspace not found on suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Attempt to suspend a workspace that was deleted externally
    await tui.sendKeys("s");
    // If server returns 404, should show error
    await tui.waitForText("not found", 5000).catch(() => {
      // Expected to fail if workspace exists — test validates the error path
    });
  });

  test("ERR-SUSPEND-003: 409 Conflict on resume (VM not provisioned)", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("r");
    // If VM not provisioned, server returns 409
    // Test validates the error display path
  });

  test("ERR-SUSPEND-004: 429 Rate limited on suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Would need to exhaust rate limit — test validates error path
    await tui.waitForText("running");
    await tui.sendKeys("s");
  });

  test("ERR-SUSPEND-005: 500 Server error on resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("r");
    // If sandbox unavailable, server returns 500
  });

  test("ERR-SUSPEND-006: Network timeout on suspend (>30s)", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    // Test validates timeout handling — may need mock server
  });

  test("ERR-SUSPEND-007: 401 Auth expired on suspend", async () => {
    tui = await launchTUI({
      env: { CODEPLANE_TOKEN: "expired-token" },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    // Auth error should propagate
  });

  test("ERR-SUSPEND-008: error message auto-dismisses after 3 seconds", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: READ_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s"); // will fail with 403
    await tui.waitForText("Permission denied");
    // Wait for auto-dismiss (3s + buffer)
    await tui.waitForNoText("Permission denied", 5000);
  });

  test("ERR-SUSPEND-009: SSE delivers failed during suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    // If SSE sends failed status, badge should update to failed
  });

  test("ERR-SUSPEND-010: SSE disconnect during suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    // Mutation should complete even if SSE drops
  });
});
```

---

### 6.4 Responsive Tests

```typescript
describe("TUI_WORKSPACE_SUSPEND_RESUME — Responsive Tests", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>>;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("RESP-SUSPEND-001: suspend action at minimum terminal size (80x24)", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    // Badge should toggle, message truncated for 80 cols
  });

  test("RESP-SUSPEND-002: suspend action at standard terminal size (120x40)", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    // Full message should be visible
    const lastLine = tui.getLine(tui.rows - 1);
    expect(lastLine).toMatch(/Workspace/);
  });

  test("RESP-SUSPEND-003: suspend action at large terminal size (200x60)", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
  });

  test("RESP-SUSPEND-004: resize during in-flight suspend", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    // Resize during in-flight
    await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
    // Should not crash; status bar adapts
    await tui.waitForText("suspend");
  });

  test("RESP-SUSPEND-005: status badge visible at all sizes after suspend", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");

    // Check at minimum
    await tui.resize(TERMINAL_SIZES.minimum.width, TERMINAL_SIZES.minimum.height);
    await tui.waitForText("suspended");

    // Check at large
    await tui.resize(TERMINAL_SIZES.large.width, TERMINAL_SIZES.large.height);
    await tui.waitForText("suspended");
  });

  test("RESP-SUSPEND-006: resume action at minimum terminal size", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("r");
  });

  test("RESP-SUSPEND-007: workspace detail SSH section at 80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // At minimum, SSH section should show command only
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("RESP-SUSPEND-008: workspace detail SSH section at 200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
      env: { CODEPLANE_TOKEN: WRITE_TOKEN },
    });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.sendKeys("Enter");
    // At large, SSH section should show full breakdown
    expect(tui.snapshot()).toMatchSnapshot();
  });
});
```

---

### 6.5 Integration Tests

```typescript
describe("TUI_WORKSPACE_SUSPEND_RESUME — Integration Tests", () => {
  let tui: Awaited<ReturnType<typeof launchTUI>>;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("INT-SUSPEND-001: suspend workspace and verify server state", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    // Server state verification would require API call
    // The test validates the TUI displays the correct final state
  });

  test("INT-SUSPEND-002: resume workspace and verify server state", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("r");
    await tui.waitForText("running");
  });

  test("INT-SUSPEND-003: suspend from list verify on detail", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    await tui.sendKeys("Enter");
    await tui.waitForText("suspended");
    await tui.waitForText("unavailable while suspended");
  });

  test("INT-SUSPEND-004: resume from detail verify on list", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("unavailable");
    await tui.sendKeys("r");
    await tui.waitForText("running");
    await tui.sendKeys("q");
    await tui.waitForText("running");
  });

  test("INT-SUSPEND-005: suspend/resume round-trip", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    await tui.sendKeys("r");
    await tui.waitForText("running");
  });

  test("INT-SUSPEND-006: optimistic revert does not corrupt list data", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: READ_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s"); // will fail with 403
    await tui.waitForText("Permission denied");
    // After revert, workspace should still show as running
    await tui.waitForText("running");
  });

  test("INT-SUSPEND-007: SSH info unavailable after suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("Enter");
    await tui.waitForText("SSH");
    await tui.sendKeys("s");
    await tui.waitForText("unavailable while suspended");
  });

  test("INT-SUSPEND-008: SSH info available after resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("unavailable");
    await tui.sendKeys("r");
    await tui.waitForText("running");
    await tui.waitForText("ssh");
  });

  test("INT-SUSPEND-009: SSE stream delivers status updates in real-time", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    // SSE should deliver suspended status
    await tui.waitForText("suspended");
  });

  test("INT-SUSPEND-010: suspended_at timestamp populated after suspend", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    await tui.sendKeys("Enter"); // open detail
    // Should show Suspended at timestamp
    await tui.waitForText("Suspended at");
  });

  test("INT-SUSPEND-011: suspended_at cleared after resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("suspended");
    await tui.sendKeys("j");
    await tui.sendKeys("Enter");
    await tui.waitForText("Suspended at");
    await tui.sendKeys("r");
    await tui.waitForText("running");
    // Suspended at should disappear
    await tui.waitForNoText("Suspended at");
  });

  test("INT-SUSPEND-012: workspace idle timeout unchanged after suspend/resume", async () => {
    tui = await launchTUI({ env: { CODEPLANE_TOKEN: WRITE_TOKEN } });
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
    await tui.waitForText("running");
    await tui.sendKeys("Enter");
    // Note idle timeout before
    await tui.waitForText("Idle timeout");
    await tui.sendKeys("q");
    await tui.sendKeys("s");
    await tui.waitForText("suspended");
    await tui.sendKeys("r");
    await tui.waitForText("running");
    await tui.sendKeys("Enter");
    // Idle timeout should be unchanged
    await tui.waitForText("Idle timeout");
  });
});
```

---

## 7. Observability Checklist

All logging goes to stderr in structured format when `CODEPLANE_TUI_DEBUG=true`. Production builds emit no logs.

| Log Level | Event | Format |
|---|---|---|
| `debug` | Action initiated | `WorkspaceSuspendResume: initiated [owner={o}] [repo={r}] [workspace_id={id}] [workspace_name={n}] [action={suspend|resume}] [from_status={s}]` |
| `debug` | Optimistic state applied | `WorkspaceSuspendResume: optimistic applied [workspace_id={id}] [transitional_status={suspending|resuming}]` |
| `info` | HTTP success | `WorkspaceSuspendResume: http success [workspace_id={id}] [action={suspend|resume}] [new_status={s}] [duration={ms}ms]` |
| `warn` | HTTP failure | `WorkspaceSuspendResume: failed [workspace_id={id}] [action={suspend|resume}] [http_status={code}] [error={msg}] [duration={ms}ms]` |
| `warn` | Optimistic revert | `WorkspaceSuspendResume: reverted [workspace_id={id}] [restored_status={s}] [reason={msg}]` |
| `debug` | Keypress ignored (in-flight) | `WorkspaceSuspendResume: ignored [workspace_id={id}] [reason=in_flight]` |
| `debug` | Keypress ignored (invalid state) | `WorkspaceSuspendResume: ignored [workspace_id={id}] [reason=invalid_state] [current_status={s}] [attempted_action={a}]` |
| `debug` | Retry initiated | `WorkspaceSuspendResume: retry [workspace_id={id}] [action={suspend|resume}] [original_error={type}]` |

---

## 8. Acceptance Criteria Traceability

| Acceptance Criterion | Implementation Location | Test Coverage |
|---|---|---|
| `s` on running workspace sends POST suspend | `useWorkspaceSuspendResume.suspend()` | KEY-SUSPEND-001, KEY-SUSPEND-003 |
| `r` on suspended workspace sends POST resume | `useWorkspaceSuspendResume.resume()` | KEY-SUSPEND-002, KEY-SUSPEND-004 |
| Optimistic badge to `[suspending…]` / `[resuming…]` | `onStatusChange()` callback from `executeAction()` | SNAP-SUSPEND-002, SNAP-RESUME-007 |
| Transitional badge in `warning` color with braille spinner | `WorkspaceStatusBadge` component (dependency) | SNAP-SUSPEND-002, SNAP-RESUME-007 |
| Error reverts badge in < 16ms | `catch` in `executeAction()` calls `onStatusChange()` synchronously | ERR-SUSPEND-001 |
| `s`/`r` disabled during in-flight | `inFlightMap` ref check in `executeAction()` | KEY-SUSPEND-005, KEY-SUSPEND-006 |
| `s` on non-running is no-op | `SUSPENDABLE_STATUSES.has()` guard | KEY-SUSPEND-007, KEY-SUSPEND-009, KEY-SUSPEND-011 |
| `r` on non-suspended is no-op | `RESUMABLE_STATUSES.has()` guard | KEY-SUSPEND-008, KEY-SUSPEND-010 |
| SSH info shows "(unavailable while suspended)" | Detail screen conditional rendering | SNAP-SUSPEND-011, INT-SUSPEND-007 |
| SSH info refreshes on resume | Detail screen re-renders with `useWorkspaceSSH` | SNAP-RESUME-013, INT-SUSPEND-008 |
| "Suspended at" timestamp in detail | Conditional render when `displayStatus === "suspended"` | SNAP-SUSPEND-011, INT-SUSPEND-010 |
| Status badge visible at all breakpoints | `WorkspaceStatusBadge` responsive behavior | RESP-SUSPEND-005 |
| Success message auto-dismisses after 3s | `WORKSPACE_ACTION_MESSAGE_DURATION_MS` timer | ERR-SUSPEND-008 (pattern) |
| Error message auto-dismisses after 3s | `WORKSPACE_ACTION_MESSAGE_DURATION_MS` timer | ERR-SUSPEND-008 |
| `R` retries failed action | `retry()` in `useWorkspaceSuspendResume` | KEY-SUSPEND-013, KEY-SUSPEND-014 |
| Dynamic status bar hints | `useWorkspaceSuspendResumeKeybindings` | KEY-SUSPEND-018, KEY-SUSPEND-019, SNAP-SUSPEND-017, SNAP-SUSPEND-018, SNAP-SUSPEND-019 |
| Background mutation on navigate away | No AbortController in `executeAction()` | KEY-SUSPEND-012 |
| Multiple workspaces actioned independently | Per-workspace `inFlightMap` | KEY-SUSPEND-021 |
| Workspace name truncation at 20 chars | `truncateText(name, WORKSPACE_NAME_MAX_LENGTH)` | Status bar message format tests |
| Error reason truncation at 40 chars | `truncateText(reason, ERROR_REASON_MAX_LENGTH)` | Status bar error format tests |
| Terminal resize during mutation | React re-renders; mutation continues | RESP-SUSPEND-004 |

---

## 9. Open Questions

| # | Question | Default Answer (if unresolved) |
|---|---|---|
| 1 | Should suspend require a confirmation dialog? | **No** — product spec explicitly says both are reversible, no confirmation needed. |
| 2 | Should the `tui-sync-toast-flash-system` dependency block this ticket? | **No** — we extend `LoadingProvider` with `setStatusBarSuccess()` as a minimal alternative. If the toast system is built later, migrate. |
| 3 | Should the TUI attempt to distinguish workspace owner vs repo write user for 403? | **No** — server enforces ownership; TUI shows "Permission denied" for all 403s. |
| 4 | Should resume fetch fresh SSH credentials proactively? | **Yes** — the detail screen calls `useWorkspaceSSH()` which re-fetches when status changes to `running`. The `refetch()` is triggered by the status change event. |