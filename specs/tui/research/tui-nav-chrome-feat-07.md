# TUI Deep Link Launch — Research Findings

Based on a comprehensive review of the `apps/tui/` codebase, the following files, patterns, and APIs are relevant for implementing the `tui-nav-chrome-feat-07` ticket.

## 1. CLI Argument Parsing (`apps/tui/src/lib/terminal.ts`)
- **Current State:** The `parseCLIArgs` function correctly loops through arguments to find `--repo`, `--screen`, and `--debug`. It populates a `TUILaunchOptions` interface.
- **Gap:** The `TUILaunchOptions` interface is missing the `org?: string` property. `--org` is not yet checked in the `switch` statement. Inputs are directly assigned without sanitization.
- **Action:** Add `org` to the interface, handle the `--org` switch case, and implement the exported `sanitizeDeepLinkInput` utility to strip control chars/ANSI codes as defined in the spec.

## 2. Deep Link Validation (`apps/tui/src/navigation/deepLinks.ts`)
- **Current State:** The `buildInitialStack` function handles `args.screen` and `args.repo`. It does a basic split of the repo string and a basic length/presence check. It exports an alias `resolveDeepLink = buildInitialStack`.
- **Gap:** Lacks rigorous constraints (`SCREEN_MAX_LENGTH`, `REPO_MAX_LENGTH`, `ORG_REGEX`), has no org-based stack building, no string truncation for errors, and lacks logging/telemetry hooks.
- **Action:** 
  - Rewrite `buildInitialStack` fully according to the spec.
  - Add constant regexes, length constraints, and the `truncateForError` helper.
  - Export `inferDeepLinkFailureReason` for telemetry.
  - Import and use `logger` (`apps/tui/src/lib/logger.js`) to log `debug`, `info`, and `warn` messages.

## 3. TUI Entry Point (`apps/tui/src/index.tsx`)
- **Current State:** Calls `parseCLIArgs`, passes them to `buildInitialStack`, and seeds `NavigationProvider` with the result. Any `.error` string from validation is effectively ignored.
- **Gap:** Does not pass `launchOptions.org`, does not render the transient error component, and does not emit `tui.deep_link.*` telemetry events.
- **Action:**
  - Update `buildInitialStack` call to include `org: launchOptions.org`.
  - Import `emit` from `./lib/telemetry.js` and implement the launch/resolved/failed telemetry emission logic before rendering.
  - Add the new `<DeepLinkErrorBanner error={deepLinkResult.error} />` directly inside `<LoadingProvider>`.

## 4. Loading Provider & Types (`apps/tui/src/loading/types.ts` & `apps/tui/src/providers/LoadingProvider.tsx`)
- **Current State:** `LoadingContextValue` includes `statusBarError: string | null`, and `LoadingProvider` updates this via `failMutation` with a 5000ms timer.
- **Gap:** Consumers cannot set `statusBarError` arbitrarily outside of a mutation failure.
- **Action:**
  - Update `LoadingContextValue` in `types.ts` to include `setStatusBarError: (message: string) => void;`.
  - In `LoadingProvider.tsx`, extract the timer logic into a new `setStatusBarErrorPublic` callback and expose it in the provider's value object.

## 5. Status Bar (`apps/tui/src/components/StatusBar.tsx`)
- **Current State:** Renders `statusBarError` directly in red text with a truncation helper.
- **Gap:** No `[ERROR]` prefix or alternative formatting for environments lacking color (`NO_COLOR=1` or `TERM=dumb`).
- **Action:** Add `noColor` detection logic and conditionally prefix the rendered error text with `[ERROR] `.

## 6. Component Bridge (`apps/tui/src/components/DeepLinkErrorBanner.tsx`)
- **Current State:** File does not exist.
- **Action:** Create this file as a renderless component (`return null;`). It will use `useLoading()` and `useEffect` to safely trigger `setStatusBarError` on mount if an error exists, ensuring the status bar flashes the validation failure.

## 7. Subsystems & Utilities Discovered
- **Telemetry:** The `emit` function lives in `apps/tui/src/lib/telemetry.ts` and accepts an event name and a properties object.
- **Logging:** The `logger` object is exported from `apps/tui/src/lib/logger.ts` and provides `debug`, `info`, `warn`, and `error` methods.
- **Auth Gating:** Confirmed that `AuthProvider` wraps `NavigationProvider` via the component tree in `index.tsx`, meaning the deep link target correctly waits for auth validation before rendering, fully satisfying the "no Dashboard flash" requirement natively.