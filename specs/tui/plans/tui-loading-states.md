# Implementation Plan: TUI_LOADING_STATES

## 1. Create Loading Types and Constants
- **File**: `apps/tui/src/loading/types.ts`
  - Define `ScreenLoadingStatus`, `PaginationStatus`, `ActionStatus`, `ScreenLoadingState`, `MutationState`, `LoadingError`, `LoadingContextValue`, `UseScreenLoadingOptions`, and `SkeletonRowConfig`.
  - In `LoadingContextValue`, include `setRetryCallback` and `retryCallback` to support retry dispatch from `GlobalKeybindings`.
- **File**: `apps/tui/src/loading/constants.ts`
  - Define constants: `LOADING_TIMEOUT_MS` (30s), `SPINNER_SKIP_THRESHOLD_MS` (80ms), `STATUS_BAR_ERROR_DURATION_MS` (5s), `RETRY_DEBOUNCE_MS` (1s), `SKELETON_BLOCK_CHAR`, `SKELETON_DASH_CHAR`, layout paddings, and `MIN_SAVING_BUTTON_WIDTH`.
- **File**: `apps/tui/src/loading/index.ts`
  - Export all types and constants as a barrel file.

## 2. Create Loading Provider
- **File**: `apps/tui/src/providers/LoadingProvider.tsx`
  - Implement `LoadingProvider` using React context.
  - Manage `screenLoadingStates`, `mutationStates`, and `statusBarError`.
  - Use `useSpinner` hook to drive the shared spinner frame based on active loading states.
  - Add state for `retryCallback` and expose `setRetryCallback` in the context value.
  - Handle 30s timeout timers for screen loading, updating the status to "timeout" and aborting the associated controller.
  - Emit `tui.loading.screen_started` telemetry events to stderr when `CODEPLANE_TUI_DEBUG=true`.
- **File**: `apps/tui/src/providers/index.ts`
  - Export `LoadingProvider` and `LoadingContext`.

## 3. Create Custom Hooks
- **File**: `apps/tui/src/hooks/useLoading.ts`
  - Implement convenience hook to consume `LoadingContext` and throw if used outside the provider.
- **File**: `apps/tui/src/hooks/useScreenLoading.ts`
  - Implement screen-level lifecycle hook managing spinner display, skeleton display, and error states.
  - Handle 80ms skip threshold, registering the loading state with the provider, and cleanup on unmount.
  - Automatically call `loading.setRetryCallback` with a debounced retry function when `onRetry` is provided.
- **File**: `apps/tui/src/hooks/useOptimisticMutation.ts`
  - Implement generic hook for actions that applies optimistic updates immediately, triggers the mutation, and reverts on failure while notifying the `LoadingProvider` (which displays an error in the status bar).
- **File**: `apps/tui/src/hooks/usePaginationLoading.ts`
  - Implement pagination state management with deduplication and debounced retries.
- **File**: `apps/tui/src/hooks/index.ts`
  - Export the new hooks.

## 4. Create UI Components
- **File**: `apps/tui/src/components/FullScreenLoading.tsx`
  - Implement a centered spinner + label component using layout hooks to fit the available content height.
- **File**: `apps/tui/src/components/FullScreenError.tsx`
  - Implement a centered error display detailing the screen label and structured error summary.
- **File**: `apps/tui/src/components/SkeletonList.tsx`
  - Implement a deterministic placeholder list using block/dash characters, calculating deterministic widths based on row indices.
- **File**: `apps/tui/src/components/SkeletonDetail.tsx`
  - Implement a detail view skeleton that renders real section headers and placeholder block text for bodies.
- **File**: `apps/tui/src/components/PaginationIndicator.tsx`
  - Implement an inline loading/error indicator designed to sit at the bottom of list scrollboxes.
- **File**: `apps/tui/src/components/ActionButton.tsx`
  - Implement a generic button wrapper that toggles to a "Saving…" label and spinner during loading.
- **File**: `apps/tui/src/components/index.ts`
  - Export the new components.

## 5. Modify Existing Components
- **File**: `apps/tui/src/components/StatusBar.tsx`
  - Import `useLoading` and `STATUS_BAR_ERROR_PADDING`.
  - Update the component to conditionally render `statusBarError` in red (`theme.error`) in the left hints area when present.
  - If a screen is in a retriable error state (status === "error" or "timeout"), append "R retry" to the keybinding hints.
- **File**: `apps/tui/src/components/GlobalKeybindings.tsx`
  - Import `useLoading`.
  - Add logic in the `useKeyboard` callback: if the user presses `R` or `Shift+r` and a `retryCallback` exists in context, invoke it.
- **File**: `apps/tui/src/index.tsx`
  - Wrap the `GlobalKeybindings` component with `LoadingProvider` in the global provider stack. This ensures the keybindings can consume the loading context while correctly sitting outside the `AppShell`.

## 6. E2E Tests
- **File**: `e2e/tui/app-shell.test.ts`
  - Add the `describe("TUI_LOADING_STATES", ...)` test block as outlined in the engineering spec.
  - Include snapshot tests (LOAD-SNAP-*) for the full-screen spinner, skeleton rendering, pagination indicator, action loading, full-screen errors, optimistic UI reverts, and no-color terminal output.
  - Include keyboard interaction tests (LOAD-KEY-*) verifying `q` navigation, `Ctrl+C` exit, `R` retry debouncing, help/command overlays, and scroll accessibility during pagination.
  - Include responsive tests (LOAD-RSP-*) validating rendering at 80x24, 120x40, and 200x60 breakpoints, as well as window resize handling during active states.