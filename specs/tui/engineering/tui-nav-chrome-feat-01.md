# Engineering Specification: tui-nav-chrome-feat-01

## TUI_SCREEN_ROUTER — Stack-based screen navigation

**Ticket:** tui-nav-chrome-feat-01  
**Type:** Feature  
**Status:** In Progress  
**Dependencies:** tui-nav-chrome-eng-01 (NavigationProvider ✅), tui-nav-chrome-eng-02 (KeybindingProvider ✅), tui-nav-chrome-eng-07 (Go-to mode ✅ bindings defined), tui-nav-chrome-eng-06 (E2E infra ✅)  

---

## 1. Overview

This ticket transforms the current minimal `ScreenRouter` (27 lines, renders top-of-stack only) and `GlobalKeybindings` (23 lines, q/Esc/Ctrl+C only) into a complete stack-based screen navigation system. The existing infrastructure — `NavigationProvider`, `KeybindingProvider`, `OverlayManager`, `AppShell`, `HeaderBar`, `StatusBar`, `AuthProvider`, `LoadingProvider`, deep-link resolution (`buildInitialStack`), and go-to binding definitions (`goToBindings.ts`) — is already implemented. This ticket wires them together into a cohesive, fully-functional router with go-to mode, loading states, auth gating, error boundary integration, scroll position restoration, and all edge case handling.

### What already exists (verified against source)

| Component | File | Lines | Status | Key Details |
|-----------|------|-------|--------|-------------|
| `NavigationProvider` | `apps/tui/src/providers/NavigationProvider.tsx` | 194 | ✅ | push/pop/replace/reset, scroll cache (`scrollCacheRef`), duplicate prevention (screen+params comparison at line 69–76), `MAX_STACK_DEPTH` slice (line 80–82), `extractRepoContext()`/`extractOrgContext()` walk stack bottom-up |
| `KeybindingProvider` | `apps/tui/src/providers/KeybindingProvider.tsx` | 166 | ✅ | Single `useKeyboard()` call, priority-sorted dispatch (lower number = higher priority), LIFO within same priority, `registerScope()`/`removeScope()`, `overrideHints()` on `StatusBarHintsContext` |
| `OverlayManager` | `apps/tui/src/providers/OverlayManager.tsx` | 162 | ✅ | Registers `PRIORITY.MODAL` (2) scope with Escape binding, manages `activeOverlay` state (help / command-palette / confirm / null), confirm payload with callbacks |
| `AppShell` | `apps/tui/src/components/AppShell.tsx` | 26 | ✅ | Flexbox column: HeaderBar (1 row) + content flexGrow + StatusBar (1 row) + OverlayLayer, `TerminalTooSmallScreen` when `breakpoint === null` |
| `HeaderBar` | `apps/tui/src/components/HeaderBar.tsx` | 51 | ✅ | Breadcrumb from `nav.stack` with `›` separator, `truncateBreadcrumb()` at minimum breakpoint, repo context center, connection indicator right |
| `StatusBar` | `apps/tui/src/components/StatusBar.tsx` | 96 | ✅ | Hints from `useStatusBarHints()`, `statusBarError` in error color, auth confirmation 3s auto-dismiss, retry hint when loading in error/timeout, sync state placeholder |
| `ScreenRouter` | `apps/tui/src/router/ScreenRouter.tsx` | 27 | ⚠️ Stub | Renders `screenRegistry[currentScreen.screen].component` directly. No `key` prop, no loading detection, no auth error interception, no retry binding |
| `GlobalKeybindings` | `apps/tui/src/components/GlobalKeybindings.tsx` | 23 | ⚠️ Stub | q→pop/exit, Esc→pop, Ctrl+C→exit wired. `onHelp`, `onCommandPalette`, `onGoTo` are `/* TODO */` no-ops |
| `useGlobalKeybindings` | `apps/tui/src/hooks/useGlobalKeybindings.ts` | 42 | ✅ | Accepts `GlobalKeybindingActions` (6 handlers), registers all 6 at `PRIORITY.GLOBAL` (5), normalizes keys via `normalizeKeyDescriptor()` |
| `useScreenKeybindings` | `apps/tui/src/hooks/useScreenKeybindings.ts` | 56 | ✅ | Registers `PRIORITY.SCREEN` (4) scope, auto-generates status bar hints, cleanup on unmount |
| `goToBindings` | `apps/tui/src/navigation/goToBindings.ts` | 51 | ✅ | 11 `GoToBinding` entries (d/r/i/l/w/n/s/o/f/k/a), `executeGoTo()` does `nav.reset(Dashboard)` → conditional `nav.push(RepoOverview)` → `nav.push(target)` |
| `deepLinks` | `apps/tui/src/navigation/deepLinks.ts` | 119 | ✅ | `buildInitialStack()` validates `--screen`/`--repo`, returns `{ stack, error? }`, case-insensitive name resolution with aliases |
| `AuthProvider` | `apps/tui/src/providers/AuthProvider.tsx` | 157 | ✅ | Token resolve→validate lifecycle, renders `AuthLoadingScreen` during loading, `AuthErrorScreen` for unauthenticated/expired, passes `children` only when authenticated or offline |
| `AuthErrorScreen` | `apps/tui/src/components/AuthErrorScreen.tsx` | 79 | ✅ | Pre-session: "no-token" and "expired" variants, q/R keybindings via direct `useKeyboard()`, debounced retry |
| `ErrorBoundary` | `apps/tui/src/components/ErrorBoundary.tsx` | 168 | ✅ | Class component, crash-loop detection (3 restarts in 5s → exit), `CrashLoopDetector`, double-fault protection, r=restart/q=quit, `key={resetToken}` remount pattern |
| `LoadingProvider` | `apps/tui/src/providers/LoadingProvider.tsx` | 231 | ✅ (partial) | `registerLoading`/`completeLoading`/`failLoading`/`unregisterLoading`, `registerMutation`/`completeMutation`/`failMutation`, shared spinner via `useSpinner()`, `setRetryCallback`, `statusBarError` state (internal `setStatusBarError` not exposed publicly), 30s timeout with `AbortController`, `emitLoadingEvent` telemetry |
| `keybinding-types.ts` | `apps/tui/src/providers/keybinding-types.ts` | 90 | ✅ | `PRIORITY` enum (TEXT_INPUT=1, MODAL=2, GOTO=3, SCREEN=4, GLOBAL=5), `KeyHandler` (key/description/group/handler/when?), `KeybindingScope`, `StatusBarHint` (keys/label/order?), `StatusBarHintsContextType` with `overrideHints()` |
| `normalize-key.ts` | `apps/tui/src/providers/normalize-key.ts` | 75 | ✅ | `normalizeKeyEvent()` and `normalizeKeyDescriptor()`, aliases (Enter→return, Esc→escape, Arrow*→up/down/left/right) |
| `loading/types.ts` | `apps/tui/src/loading/types.ts` | 151 | ✅ (partial) | `LoadingError.type` includes `"auth_error"`, `httpStatus?` field, `LoadingContextValue` interface exposes `statusBarError: string | null` read-only but no public setter method |
| `loading/constants.ts` | `apps/tui/src/loading/constants.ts` | 40 | ✅ | `LOADING_TIMEOUT_MS=30000`, `STATUS_BAR_ERROR_DURATION_MS=5000`, `RETRY_DEBOUNCE_MS=1000`, `SPINNER_SKIP_THRESHOLD_MS=80` |
| `telemetry.ts` | `apps/tui/src/lib/telemetry.ts` | 62 | ✅ | `emit()` writes JSON to stderr when `CODEPLANE_TUI_DEBUG=true`, includes `initTelemetry()`, `updateTelemetryDimensions()` |
| `logger.ts` | `apps/tui/src/lib/logger.ts` | 32 | ✅ | Level-gated stderr logger, `CODEPLANE_TUI_LOG_LEVEL` env var |
| `index.tsx` | `apps/tui/src/index.tsx` | 107 | ✅ (partial) | Provider stack correct, `buildInitialStack()` called, `deepLinkResult.error` read but **not wired** to LoadingProvider or StatusBar |
| `useSpinner` | `apps/tui/src/hooks/useSpinner.ts` | 178 | ✅ | Singleton timeline-based animation, `useSyncExternalStore`, braille/ASCII frames, per-caller gating |
| `screenRegistry` | `apps/tui/src/router/registry.ts` | 208 | ✅ | All 32 `ScreenName` entries with `PlaceholderScreen` components, `breadcrumbLabel(params)` functions |

### What this ticket delivers

1. **Enhanced `ScreenRouter`** — loading state rendering via `LoadingProvider`, auth error interception (401 mid-session via `LoadingError.type === "auth_error"` or `httpStatus === 401`), `key={entry.id}` for clean unmount/mount, retry keybinding registration
2. **Complete `GlobalKeybindings`** — go-to mode with 1500ms timer, `PRIORITY.GOTO` (3) scope registration, status bar `-- GO TO --` indicator via `overrideHints()`, context validation, overlay/help/command-palette wiring through `OverlayManager`
3. **New `LoadingScreen` component** — centered spinner with configurable label, renders within content area using shared `spinnerFrame` from `LoadingProvider`
4. **New `AuthExpiredScreen` component** — mid-session 401 handling distinct from pre-session `AuthErrorScreen`, navigation stack preserved for retry after re-authentication
5. **Extended `LoadingProvider`** — public `setStatusBarError(message, durationMs?)` method exposed on `LoadingContextValue`, `initialStatusBarError` prop for deep-link error propagation on first render
6. **Deep-link error propagation** — `index.tsx` passes `deepLinkResult.error` into `LoadingProvider.initialStatusBarError` for transient status bar display on launch
7. **Navigation telemetry** — `tui.navigate.push`/`tui.navigate.pop` events emitted from `NavigationProvider`, `tui.navigate.goto`/`tui.navigate.goto_fail` emitted from `GlobalKeybindings`
8. **All specified E2E tests** — 36 tests across snapshot, keyboard interaction, responsive, deep-link, and integration categories

---

## 2. Implementation Plan

### Step 1: Create `LoadingScreen` component

**File:** `apps/tui/src/components/LoadingScreen.tsx`  
**New file — ~25 lines**

A centered spinner component rendered by `ScreenRouter` when the active screen's data hooks are in a loading state. Uses the shared `spinnerFrame` from `LoadingProvider` (which is driven by the `useSpinner` hook's Timeline-based animation).

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";
import { useLoading } from "../hooks/useLoading.js";

export interface LoadingScreenProps {
  label?: string;
}

export function LoadingScreen({ label }: LoadingScreenProps) {
  const theme = useTheme();
  const { spinnerFrame } = useLoading();

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      <text fg={theme.primary}>
        {spinnerFrame} {label ?? "Loading…"}
      </text>
    </box>
  );
}
```

**Behavior:**
- Renders only within the content area (between HeaderBar and StatusBar) — `AppShell` wraps ScreenRouter's output in a `flexGrow={1}` box, so the spinner occupies the full content height
- Uses the shared `spinnerFrame` from `LoadingProvider` for frame-synchronized animation
- Accepts optional `label` prop for context-specific messages (e.g., "Loading issues…")
- No keybinding registration — router-level bindings (q, Esc, Ctrl+C) remain active via `PRIORITY.GLOBAL` (5)
- The `q` keybinding during loading triggers `nav.pop()` in `GlobalKeybindings.onQuit`, which removes the loading screen's entry

---

### Step 2: Create `AuthExpiredScreen` component for mid-session 401

**File:** `apps/tui/src/components/AuthExpiredScreen.tsx`  
**New file — ~40 lines**

Distinct from the existing `AuthErrorScreen` (rendered by `AuthProvider` before the app tree mounts). This component handles 401 responses that occur mid-session. The navigation stack is preserved so the user can re-authenticate externally and retry.

```typescript
import React from "react";
import { useTheme } from "../hooks/useTheme.js";

export interface AuthExpiredScreenProps {
  host: string;
  onRetry: () => void;
  onQuit: () => void;
}

export function AuthExpiredScreen({ host, onRetry, onQuit }: AuthExpiredScreenProps) {
  const theme = useTheme();

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
    >
      <text bold fg={theme.error}>Session expired</text>
      <text> </text>
      <text fg={theme.muted}>Your token for {host} is no longer valid.</text>
      <text> </text>
      <text fg={theme.muted}>
        Run <text bold fg={theme.primary}>codeplane auth login</text> to re-authenticate.
      </text>
      <text> </text>
      <text fg={theme.muted}>R retry │ q quit</text>
    </box>
  );
}
```

**Design rationale — separate from AuthErrorScreen:**
- `AuthErrorScreen` uses its own `useKeyboard()` call because it renders outside the `KeybindingProvider` tree (AuthProvider renders AuthErrorScreen instead of children)
- `AuthExpiredScreen` renders inside the router's content area within the full provider tree, so it uses the keybinding system normally

---

### Step 3: Enhance `ScreenRouter` with loading states, auth error interception, and lifecycle

**File:** `apps/tui/src/router/ScreenRouter.tsx`  
**Modify existing file (27 lines → ~80 lines)**

Adds:
1. Loading state detection from `LoadingProvider`
2. Auth error interception (`LoadingError.type === "auth_error"` or `httpStatus === 401`)
3. Key-based remount (`key={currentScreen.id}`)
4. Retry keybinding (`R` at `PRIORITY.SCREEN` during error states)

**Key design decisions:**
- `key={nav.currentScreen.id}` forces clean unmount/mount since `createEntry()` generates `crypto.randomUUID()` per entry
- Loading detection reads `isScreenLoading` and `currentScreenLoading` from LoadingProvider
- Retry bindings conditionally populated via `useMemo` and registered via `useScreenKeybindings`

---

### Step 4: Expose `setStatusBarError` on `LoadingProvider`

**Files:** `apps/tui/src/loading/types.ts` and `apps/tui/src/providers/LoadingProvider.tsx`

Add `setStatusBarError(message: string, durationMs?: number): void` to `LoadingContextValue` interface.

Extract the error display logic from `failMutation` into a reusable `showStatusBarError` callback. Add `initialStatusBarError` prop support via a mount-time effect.

---

### Step 5: Implement go-to mode in `GlobalKeybindings`

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`  
**Modify existing file (23 lines → ~200 lines)**

Implements:
- Go-to mode with 1500ms timeout and `PRIORITY.GOTO` (3) scope registration
- Status bar `-- GO TO --` indicator via `overrideHints()`
- Context validation for repo-requiring destinations
- Esc priority chain: overlay close → go-to cancel → pop
- Help overlay and command palette wiring via `OverlayManager`
- Telemetry: `tui.navigate.goto` and `tui.navigate.goto_fail` events

---

### Step 6: Add go-to mode indicator rendering to `StatusBar`

**File:** `apps/tui/src/components/StatusBar.tsx`  
**~6 lines added** — conditional check for `"-- GO TO --"` sentinel in hint rendering loop.

---

### Step 7: Add navigation telemetry to `NavigationProvider`

**File:** `apps/tui/src/providers/NavigationProvider.tsx`  
**~20 lines added** — `queueMicrotask` telemetry emission in `push` and `pop` methods.

---

### Step 8: Propagate deep-link errors to status bar

**File:** `apps/tui/src/index.tsx`  
**3 lines changed** — extract `deepLinkError` and pass to `LoadingProvider.initialStatusBarError`.

---

### Step 9: Verify edge case handling

Documented verification of existing infrastructure handling: rapid q-presses, q during loading, duplicate push prevention, max stack depth, navigation during SSE reconnection.

---

## 3. File Manifest

### New Files

| File | Description | Lines (est.) |
|------|-------------|------|
| `apps/tui/src/components/LoadingScreen.tsx` | Centered spinner component for screen data loading | ~25 |
| `apps/tui/src/components/AuthExpiredScreen.tsx` | Mid-session 401 error screen with retry and stack preservation | ~40 |

### Modified Files

| File | Current Lines | Est. New Lines |
|------|------|------|
| `apps/tui/src/router/ScreenRouter.tsx` | 27 | ~80 |
| `apps/tui/src/components/GlobalKeybindings.tsx` | 23 | ~200 |
| `apps/tui/src/components/StatusBar.tsx` | 96 | ~102 |
| `apps/tui/src/providers/NavigationProvider.tsx` | 194 | ~215 |
| `apps/tui/src/providers/LoadingProvider.tsx` | 231 | ~260 |
| `apps/tui/src/loading/types.ts` | 151 | ~160 |
| `apps/tui/src/index.tsx` | 107 | ~110 |

---

## 4. Component Interaction Diagram

```
index.tsx
  │ buildInitialStack() → { stack, error? }
  │ deepLinkError → LoadingProvider.initialStatusBarError
  ▼
ErrorBoundary
  → ThemeProvider
    → KeybindingProvider          ← single useKeyboard() call
      → OverlayManager            ← MODAL (2) scope
        → AuthProvider             ← token resolve/validate
          → APIClientProvider
            → SSEProvider
              → NavigationProvider ← stack, push/pop/reset + telemetry
                → LoadingProvider  ← screen loading, statusBarError
                  → GlobalKeybindings ← go-to mode, help, cmd palette
                    → AppShell
                      ├─ HeaderBar     ← breadcrumbs
                      ├─ ScreenRouter  ← LoadingScreen | AuthExpiredScreen | Screen
                      ├─ StatusBar     ← hints, errors, go-to indicator
                      └─ OverlayLayer  ← help, command palette, confirm
```

---

## 5. Scroll Position Restoration

NavigationProvider provides `saveScrollPosition(entryId, position)` and `getScrollPosition(entryId)` via `scrollCacheRef`. Cache is cleaned on pop. ScreenRouter uses `key={entry.id}` for clean remount. Screen components read saved position on mount.

---

## 6. Performance Requirements

Screen transitions target <50ms. Achieved through synchronous keybinding dispatch, React 19 batched state updates, key-based reconciliation, and OpenTUI's native Zig renderer.

---

## 7. Productionization Notes

- Text input suppression handled by OpenTUI's native focus system
- Go-to catch-all covers a-z and 0-9; other keys fall through with 1500ms timeout safety net
- Error boundary interaction: ErrorBoundary wraps entire tree, uses own useKeyboard() outside KeybindingProvider

---

## 8. Unit & Integration Tests

36 tests in `e2e/tui/app-shell.test.ts`:
- Snapshot Tests (7): initial render, loading state, auth error, error boundary, go-to indicator, context error, deep-link
- Keyboard Interactions (17): q pops, q quits root, Esc closes overlay, Esc pops, Ctrl+C quits, go-to destinations, timeout, invalid key, Esc cancels go-to, Enter pushes, scroll restore, rapid q, double Enter, q during input
- Deep-Link Tests (6): dashboard, issues+repo, issues-no-repo, unknown screen, q walks back, invalid repo
- Responsive Tests (7): 80x24, 120x40, 200x60, resize valid→small, small→valid, within-valid, during navigation
- Integration Tests (5): command palette nav, notification badge, auth expiry, error recovery, go-to from deep stack

---

## 9. Acceptance Checklist

- [ ] `LoadingScreen.tsx` created
- [ ] `AuthExpiredScreen.tsx` created
- [ ] `ScreenRouter` renders loading/auth-error/normal states with key-based remount
- [ ] `GlobalKeybindings` implements go-to mode with all edge cases
- [ ] `LoadingProvider` exposes public `setStatusBarError` and `initialStatusBarError`
- [ ] Deep-link errors propagated to status bar
- [ ] Navigation telemetry emitted
- [ ] All 36 E2E tests written (failing tests left failing per policy)
- [ ] Snapshots at 80×24, 120×40, 200×60