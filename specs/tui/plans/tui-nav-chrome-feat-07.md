# Implementation Plan: TUI_DEEP_LINK_LAUNCH (`tui-nav-chrome-feat-07`)

## 1. Overview

This implementation plan details the steps to upgrade the existing TUI deep-link argument parsing and navigation bootstrap. It introduces rigorous input validation, sanitization, `--org` flag support, transient status bar errors for deep-link validation failures, and robust telemetry and logging, as outlined in the engineering specification.

## 2. Step-by-Step Implementation Steps

### Step 1: Extend CLI Argument Parsing (`apps/tui/src/lib/terminal.ts`)

1.  **Update Interface:** Add `org?: string` to the `TUILaunchOptions` interface.
2.  **Add Sanitization Utility:** Create and export a pure function `sanitizeDeepLinkInput(value: string): string` to strip ASCII control characters and ANSI escape sequences.
    *   Target control chars: `/[\x00-\x09\x0B-\x1F\x7F]/g`
    *   Target ANSI codes: `/\x1B\[[0-9;]*[A-Za-z]/g`
3.  **Update `parseCLIArgs`:** 
    *   Add a `case "--org":` block to the `switch` statement to extract the org flag.
    *   Apply `sanitizeDeepLinkInput` to the parsed values for `--screen`, `--repo`, and `--org` before assignment.

### Step 2: Upgrade Deep-Link Validation (`apps/tui/src/navigation/deepLinks.ts`)

1.  **Add Constants:** Define constants for maximum lengths, regex patterns, truncation thresholds, and a `REPO_REQUIRED_SCREENS` set.
    *   Max lengths: Screen (32), Repo (128), Org (64), Repo Segment (64).
    *   Regex: `REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/`, `ORG_REGEX = /^[a-zA-Z0-9_.-]+$/`.
2.  **Add Helper Functions:**
    *   Private: `truncateForError(value: string, maxLength: number): string` to trim and append an ellipsis.
    *   Public: `inferDeepLinkFailureReason(error: string): string` to map error strings to telemetry reason codes (`unknown_screen`, `missing_repo`, `invalid_repo_format`, `invalid_org_format`).
3.  **Rewrite `buildInitialStack`:** Implement the 5-step validation pipeline.
    *   **Validate `--screen`:** Check length and resolve using `resolveScreenName`. Return error on failure.
    *   **Validate `--repo`:** Check regex and segment lengths. Return error on failure.
    *   **Validate `--org`:** Check regex. Return error on failure.
    *   **Enforce Dependencies:** Verify repo context is provided if the screen requires it.
    *   **Build Stack:** Construct the `ScreenEntry` array appropriately (`[Dashboard, OrgOverview]`, `[Dashboard, RepoOverview, ...]`).
    *   **Logging:** Inject `logger.debug()`, `logger.warn()`, and `logger.info()` calls tracing the validation and resolution process.

### Step 3: Expand Loading Context (`apps/tui/src/loading/types.ts` & `apps/tui/src/providers/LoadingProvider.tsx`)

1.  **Update Types:** In `types.ts`, add `setStatusBarError: (message: string) => void;` to the `LoadingContextValue` interface.
2.  **Implement Method:** In `LoadingProvider.tsx`, extract the timer logic into a new `setStatusBarErrorPublic` callback. This callback should set the error state, clear any existing timeout, and start a new 5000ms timer to clear the error state.
3.  **Expose Method:** Add `setStatusBarErrorPublic` to the `value` object provided by `<LoadingContext.Provider>`.

### Step 4: Create Error Banner Component (`apps/tui/src/components/DeepLinkErrorBanner.tsx`)

1.  **Create File:** Initialize a new component file for `DeepLinkErrorBanner`.
2.  **Implement Renderless Bridge:** The component should accept an `error?: string` prop.
3.  **Mount Effect:** Use `useEffect` with a ref (to prevent double-firing in strict mode) to call `setStatusBarError(error)` and log a debug message if an error is present. Return `null` to render nothing.

### Step 5: Wire up Entry Point and Telemetry (`apps/tui/src/index.tsx`)

1.  **Update Call:** Pass `org: launchOptions.org` into the `buildInitialStack` call.
2.  **Add Telemetry:**
    *   Check for deep-link presence.
    *   Emit `tui.deep_link.launch` with options and terminal dimensions.
    *   Emit `tui.deep_link.failed` (using `inferDeepLinkFailureReason`) if `deepLinkResult.error` exists.
    *   Emit `tui.deep_link.resolved` with stack depth on success.
3.  **Inject Banner:** Render `<DeepLinkErrorBanner error={deepLinkResult.error} />` inside `<LoadingProvider>` alongside `<GlobalKeybindings>` and the app shell.

### Step 6: Enhance Status Bar (`apps/tui/src/components/StatusBar.tsx`)

1.  **Detect Environment:** Determine if the terminal lacks color (`process.env.NO_COLOR === "1" || process.env.TERM === "dumb"`).
2.  **Format Output:** In the render block for `statusBarError`, conditionally prepend the string `[ERROR] ` and clear foreground colors if `noColor` is true. Adjust the truncation width allowance for the prefix.

### Step 7: Create and Update E2E Tests (`e2e/tui/app-shell.test.ts`)

Implement the comprehensive test suite as outlined in the specification under a `describe("TUI_DEEP_LINK_LAUNCH")` block.

1.  **Terminal Snapshot Tests:** Create tests for normal deep-link resolutions (e.g., `repos`, `notifications`, `--repo` context, `--org` context), and failure states (unknown screens, invalid repos/orgs) verifying the status bar updates.
2.  **Keyboard Interaction Tests:** Add simulation scripts to verify rapid stack popping (`q`, `Escape`), quitting (`Ctrl+C`), and go-to (`g`) interactions from deep-linked states.
3.  **Responsive Tests:** Ensure breadcrumbs truncate smoothly on `80x24` terminals and render fully on `120x40` bounds.
4.  **Integration & Validation Tests:**
    *   Verify auth failures preserve params.
    *   Validate the `[ERROR]` prefix under `NO_COLOR=1`.
    *   Leverage `bunEval` to directly unit-test the `buildInitialStack` pipeline logic including `sanitizeDeepLinkInput` filtering.