# Research Findings: Codeplane TUI Status Bar (tui-nav-chrome-feat-03)

Based on an analysis of the Codeplane repository, here are the detailed findings regarding the existing codebase patterns, dependencies, and files needed to implement the TUI status bar feature.

## 1. Existing `StatusBar` Component (`apps/tui/src/components/StatusBar.tsx`)
- **Current State:** The component currently implements a partial placeholder layout. It renders keybinding hints on the left, an auth confirmation toast or hardcoded `syncState = "connected"` label in the center, and a help hint `? help` on the right.
- **Layout Mechanics:** Uses `<box flexDirection="row" justifyContent="space-between">` and a top border instead of the background color mandated by the spec (`backgroundColor={theme.surface}`).
- **Dependencies used:**
  - `useLayout()` from `../hooks/useLayout.js` for `width` and `breakpoint`.
  - `useTheme()` from `../hooks/useTheme.js` for colors.
  - `useAuth()` from `../hooks/useAuth.js` to show auth toast (`status`, `user`, `tokenSource`).
  - `useLoading()` from `../hooks/useLoading.js` for error messages and retry hints.
  - `useStatusBarHints()` from `../hooks/useStatusBarHints.js` for registered keybinding hints.
- **Truncation:** Uses a naive `slice(0, 4)` for hints on minimum width, instead of the responsive width-aware ellipsis truncation described in the spec.

## 2. App Shell Integration (`apps/tui/src/components/AppShell.tsx`)
- **Current State:** `<StatusBar />` is rendered as a child of the root flex column, below the main content box (`flexGrow={1}`).
- **Requirement:** The spec mentions wrapping `<StatusBar />` in an `<ErrorBoundary />` (which should be imported from `./ErrorBoundary.js`). The shell currently does not wrap the status bar in an error boundary.

## 3. Keybinding Hints (`apps/tui/src/hooks/useStatusBarHints.ts`)
- Exports `useStatusBarHints()` which provides `{ hints, registerHints, overrideHints, isOverridden }` from the `StatusBarHintsContext` via `KeybindingProvider.js`.
- `StatusBarHint` contains `keys: string` and `label: string`.
- The go-to mode mechanism already utilizes `overrideHints()` to replace standard hints with go-to mode destinations (e.g., `g+d:dashboard`), meaning the status bar component only needs to render the hints it receives.

## 4. Theme and Text Attributes (`apps/tui/src/theme/tokens.ts`)
- **Theme:** Exposes RGBA tokens through `useTheme()`. Relevant tokens for the status bar include `theme.surface` (ANSI 236), `theme.primary` (blue), `theme.success` (green), `theme.warning` (yellow), `theme.error` (red), and `theme.muted` (dim/gray).
- **Text Styling:** Exports a `TextAttributes` constant with bitwise flags (`BOLD: 1 << 0`). This maps directly to OpenTUI's `attributes` prop to render bold keys.
- **Status resolution:** Exports `statusToToken(status: string)` which could be useful but we will manage explicit states per the spec instead.

## 5. Animation & Spinner (`apps/tui/src/hooks/useSpinner.ts`)
- Provides `useSpinner(active: boolean)`.
- Returns a single character (braille or ASCII frame based on terminal capability) that automatically advances using OpenTUI's `Timeline` engine. Returns an empty string `""` when `active` is false.
- Perfect for the `"syncing"` state in `SyncStatusIndicator`.

## 6. Layout Context (`apps/tui/src/hooks/useLayout.ts`)
- Returns an object containing `width`, `height`, and `breakpoint` (`"minimum" | "standard" | "large" | null`).
- Breakpoints drive the `compact` mode logic in the spec: `breakpoint === "minimum"` corresponds to terminals smaller than 120 columns (80-119 columns), triggering the icon-only sync state.

## 7. SSE Context Provider (`apps/tui/src/providers/SSEProvider.tsx`)
- Currently a raw stub. It defines an `SSEEvent` interface and exports an empty `SSEProvider` that provides `null` as context value.
- The spec instructs replacing this stub to provide `SSEConnectionStateContext`, `NotificationCountContext`, and `SyncStateContext` with safe default values until the real SSE integration is finalized.

## 8. Telemetry (`apps/tui/src/lib/telemetry.ts`)
- Exports `emit(name: string, properties: Record<string, any>)`.
- Events are written to `stderr` when `CODEPLANE_TUI_DEBUG` is true. Required for adding instrumentation to status bar render, resize relayout, sync state changes, and notification receipts.

## 9. `@codeplane/sdk` SyncState Contract (`packages/sdk/src/services/sync.ts`)
- Defines `SyncState` interface:
  ```typescript
  export interface SyncState {
    status: SyncStatus; // "offline" | "online" | "syncing" | "error"
    pendingCount: number;
    conflictCount: number;
    lastSyncAt: Date | null;
    error: string | null;
  }
  ```
- This precisely matches the structure needed for the `useSyncState` hook to map internal logic to `resolveDisplayState()`.

## 10. E2E Test Helpers (`e2e/tui/helpers.ts`)
- The test suite is powered by `@microsoft/tui-test`.
- Exposes `launchTUI()` returning a `TUITestInstance`.
- Standard terminal sizes are exported as `TERMINAL_SIZES` (`minimum: { width: 80, height: 24 }`, `standard`, `large`).
- Key methods for verification include:
  - `tui.getLine(tui.rows - 1)` to fetch the status bar row.
  - `tui.snapshot()` for snapshot assertions (validating ANSI SGR codes for bold text and background color).
  - `tui.resize(cols, rows)` to test responsive layout.
  - `tui.sendKeys("g")` to verify keybinding hint overrides.

## Summary for Implementation
All prerequisites described in the engineering specification `tui-nav-chrome-feat-03` exist and align with the proposed steps. 
1. We will create the 3 new hooks: `useSyncState.ts`, `useSSEConnectionState.ts`, and `useNotificationCount.ts`.
2. Create the 2 sub-components: `SyncStatusIndicator.tsx` and `NotificationBadge.tsx`.
3. Completely replace `StatusBar.tsx` to use the flex layout and responsive hint truncation logic.
4. Update `SSEProvider.tsx` to mock these contexts.
5. Adjust `AppShell.tsx` to wrap `StatusBar` in `<ErrorBoundary>`.
6. Add the exhaustive `status-bar.test.ts` to `e2e/tui/` using `tui.getLine(tui.rows - 1)` for assertions.