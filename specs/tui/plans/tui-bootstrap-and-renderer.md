# TUI_BOOTSTRAP_AND_RENDERER Implementation Plan

## 1. Overview
This implementation plan covers the complete bootstrap and rendering sequence for the Codeplane TUI. It establishes the foundational application shell, error boundaries, auth, and API client context providers, as well as the main process lifecycle (TTY validation, layout setup, signals, gracefully shutting down).

## 2. Step-by-Step Implementation

### Step 1: Pre-renderer Terminal Utilities
**File**: `apps/tui/src/lib/terminal.ts`
- Implement `assertTTY()` to verify both `process.stdin.isTTY` and `process.stdout.isTTY`. Exit process gracefully with an error if it's running non-interactive.
- Implement `parseCLIArgs()` to extract options (`--repo`, `--screen`, `--debug`, etc.) from `process.argv`. Read API URLs and tokens from environment variables (`CODEPLANE_API_URL`, `CODEPLANE_TOKEN`).

### Step 2: Signal Handling and Lifecycle
**File**: `apps/tui/src/lib/signals.ts`
- Implement `registerSignalHandlers(renderer, cleanup?)` to catch `SIGINT`, `SIGTERM`, and `SIGHUP`.
- Guarantee that teardown runs only once by utilizing an `isShuttingDown` flag. Stop the renderer and invoke `process.exit(0)`.

### Step 3: Text Truncation Utilities
**File**: `apps/tui/src/util/text.ts`
- Implement pure text utility functions.
- `truncateBreadcrumb()`: Truncates breadcrumb strings from the left (e.g. `… › repo › issues`).
- `truncateRight()`: Right-side truncation with ellipsis.
- `fitWidth()`: Exact padding/truncation for layout alignment.

### Step 4: Auth Provider
**File**: `apps/tui/src/providers/AuthProvider.tsx`
**File**: `apps/tui/src/hooks/useAuth.ts`
- Implement `AuthProvider` that reads `preResolved` token or from the environment.
- Asynchronously validate the token via `fetch` to `/api/v1/user`.
- Yield connection states (`loading`, `authenticated`, `expired`, `offline`, `unauthenticated`) through the `AuthContext`.
- Expose the hook `useAuth()` to retrieve token context.

### Step 5: API Client Integration
**File**: `apps/tui/src/providers/APIClientProvider.tsx`
- Wrap `@codeplane/ui-core`'s context using its `createAPIClient` utility.
- Pass the token resolved by `AuthProvider` down to initialize this client.
- Provide a `useAPIClient()` hook via `APIClientContext`.

### Step 6: Error Boundary
**File**: `apps/tui/src/components/ErrorBoundary.tsx`
- Build a React class component handling `componentDidCatch` to trap rendering errors.
- Render a fallback recovery UI using OpenTUI (`<box>`, `<text>`).
- Implement keybindings (`r` to restart, `q` to quit, `s` to toggle stack trace visibility).

### Step 7: Core Layout Components
**File**: `apps/tui/src/components/TerminalTooSmallScreen.tsx`
- Implement the "Terminal too small" fallback if dimensions are beneath the 80x24 baseline. Provide an interactive quit via `q`.
**File**: `apps/tui/src/components/HeaderBar.tsx`
- Use the navigation stack to compute and display a breadcrumb trail. Right-align current repo context and an online indicator.
**File**: `apps/tui/src/components/StatusBar.tsx`
- Render vim-style keybinding hints and sync status along the bottom row.

### Step 8: Screen Routing and Navigation Wrapper
**File**: `apps/tui/src/router/ScreenRouter.tsx`
- Look up the active route from `useNavigation()` inside the `screenRegistry`. Fall back to `PlaceholderScreen` if missing.
**File**: `apps/tui/src/components/GlobalKeybindings.tsx`
- Setup an app-wide `<GlobalKeybindings>` wrapper using `@opentui/react`'s `useKeyboard()`.
- Listen for `Ctrl+C`, `Esc`, `q` for navigation pop/exit, and `g` (go-to mode prefixes).

### Step 9: The App Shell
**File**: `apps/tui/src/components/AppShell.tsx`
- Aggregate `HeaderBar`, `ScreenRouter`, and `StatusBar` into a three-zone column layout (`flexDirection="column"`).
- Read from `useLayout()` to display `TerminalTooSmallScreen` when necessary.

### Step 10: TUI Entry Point (Bootstrap Sequence)
**File**: `apps/tui/src/index.tsx`
- Refactor the stub point to perform a comprehensive initialization.
- Assert TTY -> Parse args -> Instantiate `createCliRenderer({ exitOnCtrlC: false })` -> Mount React -> Setup Signals.
- Map `deepLinks.ts` initial stack into the tree.
- Nest standard provider tree: `ErrorBoundary` -> `ThemeProvider` -> `AuthProvider` -> `SSEProvider` -> `NavigationProvider` -> `GlobalKeybindings` -> `AppShell`.
- Emit structural debug logging if `CODEPLANE_TUI_DEBUG=true`.

### Step 11: Export Barrels & Verifications
- Update `apps/tui/src/providers/index.ts`, `components/index.ts`, `hooks/index.ts`, `util/index.ts` to export new modules.
- Update `apps/tui/src/verify-imports.ts` to log initialization of OpenTUI core dependencies to stdout for confidence checks.

## 3. Testing Strategy
**File**: `e2e/tui/app-shell.test.ts`
- **First Render:** Assert standard output at 120x40 to possess header indicators (`Dashboard`) and footer hints (`q:back`). Snapshot matching should pass.
- **Dimensionality:** Launch terminal sequentially smaller than 80x24 (e.g. 79x24), and ensure `Terminal too small` is printed instead.
- **Routing & Keys:** Validate that invoking `g` -> `r` switches to repositories and that `q` correctly falls back down the stack without exiting.
- **Validation**: Leave missing features/backends failing locally (as indicated by PRD constraints), yet asserting deterministic TTY exits for missing conditions.