# Implementation Plan: TUI Deep-Link Launch

This document outlines the step-by-step implementation plan for adding comprehensive deep-link support to the Codeplane TUI via `--screen`, `--repo`, and `--org` CLI flags. It incorporates robust validation, error handling, telemetry, and integration with the existing navigation and rendering architecture.

## 1. Update CLI Argument Parsing
**File:** `apps/tui/src/lib/terminal.ts`

*   **Action:** Update the `TUILaunchOptions` interface to include an optional `org?: string` field.
*   **Action:** Modify the `parseCLIArgs` function to parse the `--org` argument from `argv`.
*   **Details:** Add `case "--org": opts.org = argv[++i]; break;` to the existing switch statement. This ensures all three target flags (`--screen`, `--repo`, `--org`) are collected upon launch.

## 2. Create Input Validation Module
**File (New):** `apps/tui/src/navigation/deep-link-validation.ts`

*   **Action:** Create a pure-function module with zero React dependencies to validate incoming deep-link arguments.
*   **Details:** 
    *   Define constants for validation: `VALID_SCREENS`, `REPO_REQUIRED_SCREENS`, `MAX_SCREEN_LENGTH` (32), `MAX_REPO_LENGTH` (128), `MAX_ORG_LENGTH` (64), and string truncation limits.
    *   Implement regex patterns: `REPO_PATTERN` (`/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/`) and `ORG_PATTERN` (`/^[a-zA-Z0-9_.-]+$/`).
    *   Implement a `sanitize(input: string)` function to strip control characters and ANSI escapes.
    *   Implement `validateDeepLinkInputs(args)` returning a `DeepLinkValidationResult` object (valid flag, extracted fields, and structured error messages if validation fails).

## 3. Upgrade Initial Stack Builder
**File:** `apps/tui/src/navigation/deepLinks.ts`

*   **Action:** Implement a new function `buildInitialStackFromValidated` that accepts the pre-validated inputs.
*   **Details:**
    *   Map incoming string arguments to the internal `ScreenName` enum.
    *   Construct the `ScreenEntry[]` stack sequentially.
    *   Handle new `--org` logic: E.g., if only `--org` is provided, return `[Dashboard, OrgOverview(org)]`.
    *   Properly nest screens when multiple contexts are supplied: `[Dashboard, RepoOverview(owner, repo), TargetScreen(params)]`.
    *   Return a `DeepLinkResult` containing either the assembled `stack` or `[Dashboard]` alongside an `error` string.

## 4. Enhance Error Display & Providers
**File:** `apps/tui/src/providers/LoadingProvider.tsx`

*   **Action:** Add an `initialStatusBarError?: string | null` prop to the provider.
*   **Details:** Seed the local `statusBarError` state with this prop on mount. Set up a `useEffect` with a 5000ms timeout (`STATUS_BAR_ERROR_DURATION_MS`) to auto-clear this initial error, allowing transient deep-link errors to display temporarily.

**File:** `apps/tui/src/components/StatusBar.tsx`

*   **Action:** Support `NO_COLOR` environments for the status bar error.
*   **Details:** Check for `process.env.NO_COLOR === "1" || process.env.TERM === "dumb"`. If true, prefix the error message with `[ERROR] ` instead of solely relying on `theme.error` colors for indication.

## 5. Wire App Entry Point (Telemetry, Logging, Init)
**File:** `apps/tui/src/index.tsx`

*   **Action:** Connect validation, navigation, and error states in the bootstrap flow.
*   **Details:**
    *   Invoke `validateDeepLinkInputs` using `launchOptions`.
    *   Invoke `buildInitialStackFromValidated` with the validation result.
    *   Pass the resulting `deepLinkResult.error` down to `<LoadingProvider initialStatusBarError={...}>`.
    *   **Telemetry:** Use `emit()` from `../lib/telemetry.js` to dispatch `tui.deep_link.launch`, `tui.deep_link.resolved`, or `tui.deep_link.failed` based on validation success.
    *   **Logging:** Use `logger` from `../lib/logger.js` to output structured debug/info logs of raw arguments, the resulting stack, or validation failures before the React tree mounts.

## 6. Update Barrel Exports
**File:** `apps/tui/src/navigation/index.ts`

*   **Action:** Export `buildInitialStackFromValidated` and the new `deep-link-validation.ts` module to make them available to `index.tsx` and the test suites.

## 7. Testing Strategy
**File (New Unit Tests):** `e2e/tui/deep-link-validation.test.ts`

*   **Action:** Write pure unit tests for `sanitize`, `truncateForError`, screen validation, repo validation, org validation, context requirements (e.g., trying to open issues without a repo), and combined inputs.

**File (New Unit Tests):** `e2e/tui/deep-link-stack.test.ts`

*   **Action:** Test the `buildInitialStackFromValidated` logic. Assert stack lengths, sequence arrays, parameter assignments (e.g., `owner`, `repoName`, `org`), and breadcrumb strings for all variations of CLI inputs.

**File (Existing E2E Tests):** `e2e/tui/app-shell.test.ts`

*   **Action:** Append new `describe` blocks for TUI Deep Link integration testing using `launchTUI()`.
*   **Details:**
    *   **Snapshots:** Take snapshots of deep-link launches (e.g., launching directly to repo list, issues, validation errors).
    *   **Keyboard:** Ensure `q` walks back properly from a deep-linked stack (e.g., Issues -> RepoOverview -> Dashboard). Verify `ctrl+c`, `g r`, and `?` behave as expected on pre-populated screens.
    *   **Responsive:** Ensure breadcrumbs truncate correctly at 80x24 minimum resolution and verify resize behavior preserves deep-linked contexts.
    *   **Integration:** Confirm NO_COLOR fallbacks and ensure any tests requiring real data backends correctly fail (unimplemented backend tests must remain failing per repo policy).