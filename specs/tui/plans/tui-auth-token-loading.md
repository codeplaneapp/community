# Implementation Plan for TUI_AUTH_TOKEN_LOADING

## Overview
This plan outlines the steps required to implement the authentication token loading flow in the Codeplane TUI. This includes resolving the auth token from the CLI credential chain, validating it against the Codeplane API, and gating the application behind loading, error, or authenticated states.

## Implementation Steps

### Step 1: Update Text Utilities
**File:** `apps/tui/src/util/text.ts`
- Add two new utility functions required for text formatting in the new screens: `truncateText` and `wrapText`.
- `truncateText(text: string, maxLength: number): string` will append an ellipsis if the string exceeds the maximum length.
- `wrapText(text: string, width: number): string[]` will split text across lines to fit within a designated width, respecting word boundaries.

### Step 2: Global Signal Handling for Auth Abort
**File:** `apps/tui/src/lib/signals.ts`
- Export a new `setGlobalAbort(controller: AbortController)` function and a module-level `globalAbort` variable.
- Modify the existing `SIGINT` (Ctrl+C) handler to call `globalAbort?.abort()` before shutting down the renderer and calling `process.exit(0)`. This ensures that in-flight authentication fetch requests are cleanly aborted if the user quits during the loading phase.

### Step 3: Create Authentication Loading Screen
**File:** `apps/tui/src/components/AuthLoadingScreen.tsx` (New File)
- Create a new component `AuthLoadingScreen` that takes a `host` string as a prop.
- Utilize `<box>` primitives from OpenTUI to create a layout with a header, centered content area, and a status bar.
- Use `useSpinner()` from `apps/tui/src/hooks/useSpinner.ts` (or equivalent existing hook) to display a loading animation.
- Truncate the host using the `truncateText` utility and display "Authenticating...".
- Suppress keybindings during loading, as the global signal handler manages Ctrl+C.

### Step 4: Create Authentication Error Screens
**File:** `apps/tui/src/components/AuthErrorScreen.tsx` (New File)
- Create a new component `AuthErrorScreen` with props: `variant: "no-token" | "expired"`, `host: string`, `tokenSource`, and `onRetry: () => void`.
- Use `useKeyboard` to bind the `q` key to `process.exit(0)` and the `R` key to trigger the `onRetry` callback (debounced at 1 second to prevent spamming).
- Render a distinct layout for both the `no-token` and `expired` variants, guiding the user to run `codeplane auth login`.
- Ensure the instructional text wraps appropriately using OpenTUI's built-in flexbox/padding behaviors or the new text utilities.

### Step 5: Rewrite AuthProvider State Machine
**File:** `apps/tui/src/providers/AuthProvider.tsx`
- Overhaul the context value to match `AuthContextValue` from the specification, providing `status`, `user`, `tokenSource`, `apiUrl`, `host`, `token`, and `retry`.
- Import and use `resolveAuthToken` and `resolveAuthTarget` from `@codeplane/cli/auth-state`.
- Implement a robust `runAuth` state machine within a `useEffect` that:
  1. Resolves the token synchronously.
  2. Emits `tui.auth.*` telemetry events (started, resolved, failed, validated) at each phase.
  3. Validates the token against the API endpoint (`/api/user`) with a 5-second timeout, utilizing `setGlobalAbort`.
  4. Evaluates valid, expired, offline/timeout, and unauthenticated scenarios and updates state accordingly.
- Gate the `children` prop: render `AuthLoadingScreen` or `AuthErrorScreen` internally based on the state. Only render `children` when the state is `authenticated` or `offline`.

### Step 6: Update the useAuth Hook
**File:** `apps/tui/src/hooks/useAuth.ts`
- Update the return type of the hook to match the newly shaped `AuthContextValue` interface exported from `AuthProvider.tsx`.
- Ensure the hook still correctly throws an error if invoked outside of the `AuthProvider`.

### Step 7: Enhance the Status Bar
**File:** `apps/tui/src/components/StatusBar.tsx`
- Consume the `useAuth` hook to access `status`, `user`, and `tokenSource`.
- Implement a local state and `useEffect` block to detect the transition to `authenticated` and show a temporary 3-second confirmation banner (e.g., `✓ alice via env`).
- Calculate the confirmation banner strictly under 40 characters, using truncation logic for the username if necessary.
- Display a persistent warning (`⚠ offline — token not verified`) when the auth status is `offline`.

### Step 8: Update the Entry Point Provider Stack
**File:** `apps/tui/src/index.tsx`
- Reorder the provider stack.
- Ensure `ThemeProvider` is placed *outside* (above) the `AuthProvider` so the gating screens can access theme tokens.
- Insert `APIClientProvider` immediately *inside* `AuthProvider`, passing it the verified token from the auth context (or handling its own internal hook consumption of `useAuth`).
- Confirm `ErrorBoundary` sits at the very top of the application.

### Step 9: Add E2E Tests
**File:** `e2e/tui/app-shell.test.ts`
- Add a new `describe("TUI_AUTH_TOKEN_LOADING", () => { ... })` block.
- Implement terminal snapshot tests utilizing `launchTUI` and `createMockAPIEnv` from `e2e/tui/helpers.ts`.
- Add specific test suites for:
  - Loading Screen (`waitForText("Authenticating")`, resize behavior).
  - No-Token Error Screen (`env.CODEPLANE_TOKEN` absent, checks for `codeplane auth login` text).
  - Expired Token Error Screen (Mock API returning 401).
  - Offline Mode (Mock API timed out / unreachable).
  - Successful Auth / Status Bar Confirmation (Checks for `✓` banner and auto-dismissal).
  - Keyboard Interactions (`Ctrl+C`, `q`, debounced `R`).
  - Security (Ensure token value string is never snapshotted).
