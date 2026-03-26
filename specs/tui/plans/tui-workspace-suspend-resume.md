# Implementation Plan: Workspace Suspend/Resume Actions

This plan details the steps to implement the `tui-workspace-suspend-resume` feature. It focuses on setting up the underlying context enhancements, constants, reusable action hooks, and comprehensive E2E tests, effectively preparing the TUI for when the workspace screens are fully scaffolded.

## Step 1: Extend Loading Types for Success Messages
**File:** `apps/tui/src/loading/types.ts`
- Update the `LoadingContextValue` interface to include:
  - `statusBarSuccess: string | null;`
  - `setStatusBarSuccess(message: string, durationMs?: number): void;`

## Step 2: Implement Success State in LoadingProvider
**File:** `apps/tui/src/providers/LoadingProvider.tsx`
- Add new state: `const [statusBarSuccess, setStatusBarSuccessState] = useState<string | null>(null);`.
- Add a ref for the timer: `const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);`.
- Create a memoized `setStatusBarSuccess` method that clears any existing timer, sets the success message, and schedules it to clear after the specified `durationMs` (defaulting to 3000ms).
- Add a `useEffect` on unmount to clear the timer to prevent memory leaks.
- Include `statusBarSuccess` and `setStatusBarSuccess` in the returned `LoadingContext.Provider` value.

## Step 3: Render Success Messages in StatusBar
**File:** `apps/tui/src/components/StatusBar.tsx`
- Destructure `statusBarSuccess` from the `useLoading` hook.
- Modify the rendering ternary logic:
  - If `statusBarError` is present, render it in `theme.error`.
  - **Else if `statusBarSuccess` is present, render it in `theme.success`**, making sure to truncate the text to `maxErrorWidth` using `truncateRight`.
  - Else, render the standard keybinding hints.

## Step 4: Define Workspace Action Constants
**File:** `apps/tui/src/workspaces/constants.ts` (Create new directory and file)
- Define message limits and durations:
  - `WORKSPACE_ACTION_MESSAGE_DURATION_MS = 3000;`
  - `WORKSPACE_NAME_MAX_LENGTH = 20;`
  - `ERROR_REASON_MAX_LENGTH = 40;`
- Define action validity sets to guard keypresses:
  - `SUSPENDABLE_STATUSES` (`Set(["running"])`)
  - `RESUMABLE_STATUSES` (`Set(["suspended"])`)
  - `TRANSITIONAL_STATUSES` (`Set(["suspending", "resuming", "starting", "stopping"])`)

## Step 5: Build `useWorkspaceStatusBar` Hook
**File:** `apps/tui/src/hooks/useWorkspaceStatusBar.ts` (Create new file)
- Implement `formatSuccessMessage` and `formatErrorMessage` which respect responsive terminal widths (80 cols vs 120+ cols) and utilize `truncateText` for workspace names and error strings.
- Implement `extractErrorReason` to map HTTP error status codes (e.g., 401, 403, 404, 409, 429, 500) to human-readable strings.
- Create the `useWorkspaceStatusBar` hook that returns `message`, `showSuccess`, `showError`, and `clear` functions to handle temporary, self-clearing workspace alerts.

## Step 6: Build Core `useWorkspaceSuspendResume` Hook
**File:** `apps/tui/src/hooks/useWorkspaceSuspendResume.ts` (Create new file)
- Instantiate a `useRef<Map<string, boolean>>` for `inFlightMap` to track independent mutations per workspace without causing needless re-renders.
- Create an `executeAction` method that handles the full optimistic lifecycle:
  - Guard against invalid states, transitional states, or already in-flight mutations.
  - Set the state to optimistic transitional (e.g., `suspending`), set in-flight to `true`, and register with the loading provider.
  - Await the `mutateFn` promise (handling API calls via `ui-core` when fixed, or via custom fetch temporarily).
  - On success: show success bar, set confirmed status via `onStatusChange`.
  - On failure: revert optimistic status, record to `lastFailedAction` ref, and show error bar.
  - Emit structural telemetry logs (using `CODEPLANE_TUI_DEBUG`).
- Return the wrapped `suspend`, `resume`, and `retry` callbacks, as well as `isInFlight` and `statusBar` interfaces.

## Step 7: Build Keybindings & Hint Integration Hook
**File:** `apps/tui/src/hooks/useWorkspaceSuspendResumeKeybindings.ts` (Create new file)
- Take `focusedStatus`, `focusedWorkspaceId`, `focusedWorkspaceName`, and the `actions` object as parameters.
- Dynamically output a `keybindings` array with active handlers for `s`, `r`, and `R` only when the focused status allows them.
- Dynamically output a `hints` array to populate the status bar, reflecting either the available action (`s:suspend`, `r:resume`) or the transitional in-progress state (`s:suspending...`).

## Step 8: Export New Hooks
**File:** `apps/tui/src/hooks/index.ts`
- Add `export * from "./useWorkspaceStatusBar.js";`
- Add `export * from "./useWorkspaceSuspendResume.js";`
- Add `export * from "./useWorkspaceSuspendResumeKeybindings.js";`

## Step 9: Establish E2E Test Suite
**File:** `e2e/tui/workspaces.test.ts` (Create new file)
- Scaffolding utilizing `launchTUI` and test helper assertions.
- **Snapshot Tests:** Cover rendering of list and detail layout visual transitions (running -> suspending -> suspended, success/error status bar displays, responsive screen adjustments).
- **Keyboard Interactions:** Simulate rapid keypresses, verify no-ops on invalid states, check retry functionality, and assert that mutations properly handle component unmounting.
- **Error Handling:** Force 403, 404, 409 responses, and assert correct error truncation and optimistic reversion.
- *Note: Leave tests failing until screen scaffolds and actual API mocks align.*