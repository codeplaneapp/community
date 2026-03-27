# TUI Deep-Link Launch Research Findings

Based on the engineering specification, I have researched the existing Codeplane TUI codebase (`apps/tui/`) to understand how the deep-link feature should be implemented. Below is a comprehensive analysis of the existing state mapped against the required changes.

## 1. CLI Argument Parsing
**File:** `apps/tui/src/lib/terminal.ts`
- **Current State:** 
  - `parseCLIArgs(argv: string[])` processes `--repo`, `--screen`, and `--debug`.
  - `TUILaunchOptions` interface lacks `org`.
- **Action Required:** 
  - Add `org?: string` to `TUILaunchOptions`.
  - Add `--org` to the `switch (argv[i])` statement in `parseCLIArgs`.

## 2. Navigation & Deep Link Logic
**File:** `apps/tui/src/navigation/deepLinks.ts`
- **Current State:**
  - Contains `buildInitialStack(args: DeepLinkArgs): DeepLinkResult`.
  - `DeepLinkArgs` currently supports `org?: string`, but the implementation in `buildInitialStack` ignores any org-specific stack building.
  - Validation logic inside `buildInitialStack` is minimal (e.g., checks if repo has exactly one `/`). 
  - `resolveScreenName` normalizes to lowercase and maps CLI screen arguments to `ScreenName` enums.
  - Includes legacy `@deprecated` export for `resolveDeepLink`.
- **Action Required:** 
  - Create `apps/tui/src/navigation/deep-link-validation.ts` for strictly validating inputs as a pure functional module (regex, length limits, allowlists, sanitization).
  - Update `apps/tui/src/navigation/deepLinks.ts` to implement `buildInitialStackFromValidated`, properly constructing stacks for `--org` (e.g., `[Dashboard, OrgOverview]`) and correctly passing validated arguments.
  - Export the new modules in `apps/tui/src/navigation/index.ts`.

## 3. App Entry Point & Setup
**File:** `apps/tui/src/index.tsx`
- **Current State:**
  - Instantiates `parseCLIArgs(process.argv.slice(2))`.
  - Directly calls `buildInitialStack({ screen: launchOptions.screen, repo: launchOptions.repo })`. (Noticeably ignores `launchOptions.org`).
  - Retrieves `deepLinkResult.stack` to initialize the `NavigationProvider`.
  - Defines `noColor` logic: `process.env.NO_COLOR === "1" || process.env.TERM === "dumb"`.
  - `LoadingProvider` is invoked without props.
  - Currently uses a crude `process.stderr.write` for debug logging.
- **Action Required:**
  - Import `validateDeepLinkInputs` and `buildInitialStackFromValidated`.
  - Pass `launchOptions.org` to the new validation flow.
  - Collect `deepLinkError = deepLinkResult.error ?? null`.
  - Feed `initialStatusBarError={deepLinkError}` into `<LoadingProvider>`.
  - Import `logger` from `../lib/logger.js` and `emit` from `../lib/telemetry.js`.
  - Add telemetry/structured logging blocks before mounting React, based on the presence of `launchOptions`.

## 4. Error Display (Status Bar)
**File:** `apps/tui/src/providers/LoadingProvider.tsx`
- **Current State:**
  - Exposes `statusBarError` state variable, initially `null`.
  - Handles transient 5-second errors during mutations (`failMutation`).
- **Action Required:**
  - Accept an `initialStatusBarError?: string | null` prop.
  - If provided, initialize `statusBarError` with it, and trigger a `setTimeout` using `STATUS_BAR_ERROR_DURATION_MS` to auto-clear it.

**File:** `apps/tui/src/components/StatusBar.tsx`
- **Current State:**
  - Checks for `statusBarError` and displays it using `truncateRight(statusBarError, maxErrorWidth)` and `fg={theme.error}`.
  - Has no NO_COLOR awareness for errors.
- **Action Required:**
  - Replicate `noColor` environment checking (`process.env.NO_COLOR === "1" || process.env.TERM === "dumb"`).
  - Dynamically inject the `[ERROR]` prefix if `noColor` is active.

## 5. Telemetry & Logging Patterns
**Files:** `apps/tui/src/lib/telemetry.ts` and `apps/tui/src/lib/logger.ts`
- **Current State:**
  - `emit(name: string, properties: Record<string, string | number | boolean>)` properly formats events for telemetry.
  - `logger.info`, `logger.warn`, `logger.debug` write formatted lines to `stderr`.
- **Takeaway:**
  - Both are ready to use in `index.tsx` for structured output on deep-link parsing.

## 6. End-to-End Tests
**File:** `e2e/tui/app-shell.test.ts`
- **Current State:**
  - Contains infrastructure to launch the TUI using a `launchTUI()` helper, passing dimensions (`cols`, `rows`) and CLI `args`.
  - Relies on `bun:test` combined with terminal assertion helpers like `.waitForText()`, `.sendKeys()`, and `.snapshot()`.
- **Action Required:**
  - Implement the large chunk of integration snapshot, keyboard, and responsive tests mapped out in the engineering spec directly into this file.
  - Create the pure unit tests for validation and stack creation (`e2e/tui/deep-link-validation.test.ts`, `e2e/tui/deep-link-stack.test.ts`).

## 7. Contextual Notes & Dependencies
- `ScreenName` enumerations (`Dashboard`, `RepoOverview`, `OrgOverview`, etc.) are fully implemented in `apps/tui/src/router/types.ts`.
- All necessary component wrappers (`<box>`, `<text>`) and layout hooks are imported from `@opentui/react` and local hooks. 
- Data flows synchronously from `index.tsx` to `NavigationProvider` to seed the initial stack state, ensuring UI resolves to the correct path before rendering the first frame.