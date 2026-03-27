# Research Findings for `tui-workspace-status-stream`

Based on an investigation of the current Codeplane TUI codebase, I have compiled the following context to guide the implementation of the `TUI_WORKSPACE_STATUS_STREAM` feature.

## 1. Core Providers & Entry Points

### `apps/tui/src/providers/SSEProvider.tsx`
- **Current State:** It is entirely an empty stub (`export function SSEProvider({ children }) { return <SSEContext.Provider value={null}>{children}</SSEContext.Provider>; }`).
- **Impact:** Must be entirely overhauled to track `workspaceConnectionHealth` and manage the connection registry logic (`registerStreamState`, `unregisterStream`, etc.) as defined in the spec. The `useSSE(channel)` hook is also a stub and must remain a backward-compatible placeholder for now.

### `apps/tui/src/index.tsx`
- **Current State:** Defines the app bootstrap and provider tree order. `SSEProvider` wraps `NavigationProvider` which wraps `LoadingProvider`.
- **Impact:** The `FlashMessageProvider` will need to be injected into this stack, specifically between `SSEProvider` and `NavigationProvider`.

## 2. UI Components & Styling

### `apps/tui/src/components/StatusBar.tsx`
- **Current State:** The right-hand status section hardcodes `const syncState = "connected";` and uses it as a placeholder. The left side handles either a `statusBarError` or an array of `hints`.
- **Impact:** The right side must be modified to accept the new `<SSEConnectionIndicator />`, keeping the sync state as a fallback when no workspace streams are active. The left side must conditionally render the `flash` message from `useFlashMessageContext`, taking visual precedence over the `statusBarError` and `hints`.

### `apps/tui/src/theme/tokens.ts`
- **Current State:** Exports `ThemeTokens` which include `success`, `warning`, `error`, `muted`, and `primary` as frozen `RGBA` objects (no per-render allocation).
- **Impact:** The connection indicator and flash messages can safely retrieve these via `useTheme()` and map them to statuses correctly. We should use `statusToToken()` where applicable, or custom mapping for flash message states as described in the spec.

## 3. Hooks & Utilities

### `apps/tui/src/hooks/useLayout.ts`
- **Current State:** Exports terminal dimensions and a `breakpoint` classification (`"large" | "standard" | "minimum" | null`).
- **Impact:** We can directly pull `breakpoint` to drive the responsive text changes for both the `SSEConnectionIndicator` (dot vs. text vs. full text with attempts) and `useWorkspaceStatusFlash` (short vs. medium vs. long flash message text).

### `apps/tui/src/lib/telemetry.ts`
- **Current State:** Implements `emit(name: string, properties?: Record<string, any>)`, which outputs JSON to stderr when `CODEPLANE_TUI_DEBUG=true`.
- **Impact:** The `useWorkspaceSSETelemetry` hook can use this directly without modification.

### `apps/tui/src/lib/signals.ts`
- **Current State:** Handles graceful shutdown signals (`SIGINT`, `SIGTERM`, `SIGHUP`) and aborts the global controller.
- **Impact:** As noted in the spec, it lacks a `SIGCONT` listener. We must implement `onProcessResume` and the `handleResume` dispatch loop so SSE connections can immediately reconnect after a `Ctrl+Z` / `fg` process suspension.

### `apps/tui/src/hooks/useScreenKeybindings.ts`
- **Current State:** Accepts an array of bindings and an optional array of hints. Its signature is `useScreenKeybindings(bindings: KeyHandler[], hints?: StatusBarHint[])`.
- **Impact:** The spec draft shows it taking a `ScreenName` as the first argument (e.g., `useScreenKeybindings(ScreenName.WorkspaceDetail, [...])`), but the actual codebase signature only takes `bindings` and `hints`. The implementation will need to align with the *actual* signature (`useScreenKeybindings([{ key: "R", description: "reconnect", handler: ... }])`). Additionally, the hook doesn't currently support a dynamic `when: () => boolean` property on the `KeyHandler` object. The reconnect condition (`canReconnect`) will either need to be handled inside the `handleReconnect` function by dropping execution if unavailable, or we must update the `KeyHandler` type in `keybinding-types.ts`.

## 4. Workspaces Domain Context

- **Missing Files:** The files inside `apps/tui/src/screens/Workspaces/` and the hooks `apps/tui/src/hooks/useWorkspaceStatusStream.ts` are currently not present in the repository.
- **Impact:** Since the spec references dependencies like `tui-workspace-sse-adapter` and `tui-workspace-status-badge` as "Spec complete", it implies they are either mocked interfaces in this PR or will be implemented concurrently. Our focus will be solely on scaffolding the integration wiring assuming those interfaces will exist per the spec.

## 5. E2E Testing Context

### `e2e/tui/helpers.ts`
- **Current State:** Sets up a real PTY emulation using `@microsoft/tui-test`. It defines `TERMINAL_SIZES` (`minimum`, `standard`, `large`) matching the layout breakpoints.
- **Impact:** These helpers will be foundational for the `workspaces.test.ts` snapshots, allowing us to simulate specific terminal resizes and verify the responsive behavior of the connection indicator and flash messages exactly as specified.