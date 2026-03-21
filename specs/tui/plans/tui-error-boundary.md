# TUI_ERROR_BOUNDARY Implementation Plan

## 1. Goal
Implement a robust React error boundary for the Codeplane TUI that catches unhandled exceptions, renders a diagnostic recovery UI with stack trace exploration, and prevents infinite crash loops. The implementation will adhere exactly to the provided Engineering Specification and replace the existing proof-of-concept.

## 2. Step-by-Step Implementation

### Step 1: Create Core Utility Modules
Create the foundational utilities required by the error boundary and its UI.
- **`apps/tui/src/util/constants.ts`**: Define `CRASH_LOOP_WINDOW_MS = 5000` and `CRASH_LOOP_MAX_RESTARTS = 3`.
- **`apps/tui/src/util/truncate.ts`**: Implement `wrapText` and `truncateText` functions to support wrapping error messages and stack traces. (If `apps/tui/src/util/text.ts` already contains this logic, extract or expose it via `truncate.ts` to strictly match the specification).
- **`apps/tui/src/util/format.ts`**: Implement `formatErrorSummary` (if needed for auxiliary text formatting).

### Step 2: Implement Telemetry, Logging, and Error Normalization
Build standalone libraries for tracking state, telemetry, logging, and error shape consistency.
- **`apps/tui/src/lib/telemetry.ts`**: Implement the `initTelemetry`, `updateTelemetryDimensions`, and `emit` functions for the lightweight telemetry stub. Configure it to write to `stderr` as JSON when `CODEPLANE_TUI_DEBUG=true`.
- **`apps/tui/src/lib/logger.ts`**: Implement structured stderr logging (`error`, `warn`, `info`, `debug`) mapped to `process.env.CODEPLANE_TUI_LOG_LEVEL`.
- **`apps/tui/src/lib/normalize-error.ts`**: Implement the `normalizeError(value: unknown): Error` function to safely handle thrown strings, nulls, and malformed objects and guarantee an `Error` instance.
- **`apps/tui/src/lib/crash-loop.ts`**: Implement the `CrashLoopDetector` class using a ring buffer of size 5 to track restart timestamps within a 5-second window.

### Step 3: Develop the ErrorScreen Component
Implement the UI presentation layer for the error state.
- **`apps/tui/src/components/ErrorScreen.tsx`**: Create the `ErrorScreen` functional component using `@opentui/react` primitives (`<box>`, `<text>`, `<scrollbox>`).
  - Implement responsive scaling (`minimum`, `standard`, `large` breakpoints) for padding and max trace heights.
  - Implement `useKeyboard` for error-screen actions (`r` to restart, `q` to quit, `s` to toggle trace).
  - Implement stack trace scrolling with manual scroll offset tracking (`j`, `k`, `G`, `gg`, `Ctrl+D`, `Ctrl+U`).
  - Apply a 500ms debounce to the `r` restart action.
  - Integrate `useTheme()` for semantic color tokens (`error`, `muted`, `primary`), gracefully falling back to default styling if `noColor` is provided or if the theme context is unavailable.
  - Create a help overlay (`?` toggle).

### Step 4: Implement the Production ErrorBoundary Class
Replace the existing POC with the fully-featured React Class Component.
- **`apps/tui/src/components/ErrorBoundary.tsx`**:
  - Implement `getDerivedStateFromError` to trap exceptions and normalize them via `normalizeError()`.
  - Implement `componentDidCatch` to log the error to `stderr` and emit the telemetry event.
  - Provide a `render` function that uses a `try-catch` to avoid double faults (rendering the `ErrorScreen` and falling back to a hard `process.stderr.write` + `process.exit(1)` if the screen itself throws).
  - Track a `resetToken` in state. When `handleRestart` is called, verify against the `CrashLoopDetector`. If safe, increment `resetToken` to force a complete unmount/remount of the child provider stack, then call `props.onReset()`.
  - Expose `onQuit()` bound to `props.onQuit()` for clean terminal teardown.

### Step 5: Integrate into the App and Provider Stack
Move the ErrorBoundary to its correct position in the application hierarchy to maintain appropriate context.
- **`apps/tui/src/index.tsx` (or `App.tsx` depending on entry)**:
  - Reposition `<ErrorBoundary>` so it sits below `<AuthProvider>` and `<ThemeProvider>` but *above* `<NavigationProvider>` and `<SSEProvider>`. This ensures the auth token context is preserved while the navigation and SSE connections are cleanly blown away and remounted during a restart.
  - Manage a `navResetKey` state from the entry point and pass an `onReset` handler to the error boundary to increment it.
  - Track the `currentScreen` using a ref updated by the `NavigationProvider` and pass it into the `<ErrorBoundary>`.
  - Ensure that the `<AppShell>` structure renders the `HeaderBar` and `StatusBar` *outside* the boundary so they persist during a crash.

### Step 6: Create the E2E Test Crash Hook
Create the mechanism to trigger exceptions for testing purposes without exposing it in production.
- **`apps/tui/src/components/__test__/TestCrashHook.tsx`**: Create the hook that reads `CODEPLANE_TUI_TEST_THROW*` environment variables and throws on mount or timeout as defined in the spec.
- **`apps/tui/src/screens/PlaceholderScreen.tsx`**: Mount `<TestCrashHook />` at the top of the `PlaceholderScreen` component (which currently acts as a proxy for the pending `Dashboard`). This will allow the E2E tests to reliably inject errors during initial render.

### Step 7: Append E2E and Unit Tests
Integrate the comprehensive test suite directly into the existing `e2e/tui/app-shell.test.ts` file.
- **`e2e/tui/app-shell.test.ts`**:
  - Add the `describe("TUI_ERROR_BOUNDARY")` block.
  - Add **Snapshot Tests** (verifying 80x24 layout, 120x40 layout, text wrapping, and stack trace toggling).
  - Add **Keyboard Interaction Tests** (verifying `r`, `q`, `Ctrl+C`, `s`, and trace scrolling behavior).
  - Add **Responsive Tests** (verifying resize behavior when error screen is active).
  - Add **Crash Loop and Double Fault Tests**.
  - Add **Integration Tests** (auth state persistence on restart, SSE reconnection).
  - Add a sub-block for **Unit Tests** for `CrashLoopDetector` and `normalizeError` executed via the `bunEval` infrastructure.