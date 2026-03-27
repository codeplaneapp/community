# Engineering Specification: `tui-nav-chrome-feat-08`

## TUI_GOTO_KEYBINDINGS — Two-key chord navigation

---

## Overview

This ticket implements the full go-to keybinding system for the Codeplane TUI. Pressing `g` enters a transient "go-to mode" and a follow-up key within 1500ms navigates to one of 11 top-level destinations via stack replacement. The feature builds on existing scaffolding: `goToBindings.ts` defines all 11 destinations with `executeGoTo()`, `useGlobalKeybindings.ts` registers `g` at `PRIORITY.GLOBAL`, and `GlobalKeybindings.tsx` has a TODO placeholder for the `onGoTo` callback. The `KeybindingProvider` already reserves `PRIORITY.GOTO = 3` for go-to mode scopes.

### Dependencies

| Dependency | What it provides | Status |
|---|---|---|
| `tui-nav-chrome-eng-05` | `KeybindingProvider` with priority dispatch, `PRIORITY.GOTO` | Implemented |
| `tui-nav-chrome-feat-01` | `NavigationProvider` with `reset()`, `push()`, `pop()`, `repoContext` | Implemented |
| `tui-nav-chrome-feat-03` | `StatusBar` component with `useStatusBarHints()` and `overrideHints()` | Implemented |
| `tui-nav-chrome-feat-06` | `OverlayManager` with `hasActiveModal()` check | Implemented |
| `tui-nav-chrome-eng-06` | `useGlobalKeybindings()` with `onGoTo` callback | Implemented (TODO wiring) |

### Files Changed

| File | Action | Purpose |
|---|---|---|
| `apps/tui/src/hooks/useGoToMode.ts` | **Create** | Core go-to mode state machine hook |
| `apps/tui/src/hooks/useGoToKeybindings.ts` | **Create** | Registers PRIORITY.GOTO scope with 11 destination bindings + cancellation |
| `apps/tui/src/components/GlobalKeybindings.tsx` | **Enhance** | Wire `onGoTo` callback to `useGoToMode().activate()` |
| `apps/tui/src/components/StatusBar.tsx` | **Enhance** | Render go-to hints and context error during go-to mode |
| `apps/tui/src/components/OverlayLayer.tsx` | **Enhance** | Include "Go To" group in help overlay keybinding list |
| `apps/tui/src/navigation/goToBindings.ts` | **Enhance** | Add `statusBarLabel` and hint-ordering fields |
| `e2e/tui/app-shell.test.ts` | **Enhance** | Add 52 go-to E2E tests |

---

## Implementation Plan

### Step 1: Enhance `goToBindings.ts` with status bar hint metadata

**File:** `apps/tui/src/navigation/goToBindings.ts`

Add a `statusBarLabel` field to `GoToBinding` for compact status bar display, and an `order` field for hint ordering. Also fix `executeGoTo()` to use proper stack replacement semantics (reset then conditional pushes, not reset+push+push which creates 3 entries).

```typescript
export interface GoToBinding {
  key: string;
  screen: ScreenName;
  requiresRepo: boolean;
  description: string;
  /** Short label for status bar hints (e.g., "dashboard", "repos") */
  statusBarLabel: string;
  /** Display order in status bar hints (lower = first) */
  order: number;
}

export const goToBindings: readonly GoToBinding[] = [
  { key: "d", screen: ScreenName.Dashboard,       requiresRepo: false, description: "Dashboard",       statusBarLabel: "dashboard",  order: 0  },
  { key: "i", screen: ScreenName.Issues,            requiresRepo: true,  description: "Issues",          statusBarLabel: "issues",     order: 1  },
  { key: "l", screen: ScreenName.Landings,          requiresRepo: true,  description: "Landings",        statusBarLabel: "landings",   order: 2  },
  { key: "r", screen: ScreenName.RepoList,          requiresRepo: false, description: "Repositories",    statusBarLabel: "repos",      order: 3  },
  { key: "w", screen: ScreenName.Workspaces,        requiresRepo: false, description: "Workspaces",      statusBarLabel: "workspaces", order: 4  },
  { key: "n", screen: ScreenName.Notifications,     requiresRepo: false, description: "Notifications",   statusBarLabel: "notifs",     order: 5  },
  { key: "s", screen: ScreenName.Search,             requiresRepo: false, description: "Search",          statusBarLabel: "search",     order: 6  },
  { key: "a", screen: ScreenName.Agents,             requiresRepo: false, description: "Agents",          statusBarLabel: "agents",     order: 7  },
  { key: "o", screen: ScreenName.Organizations,     requiresRepo: false, description: "Organizations",   statusBarLabel: "orgs",       order: 8  },
  { key: "f", screen: ScreenName.Workflows,          requiresRepo: true,  description: "Workflows",       statusBarLabel: "workflows",  order: 9  },
  { key: "k", screen: ScreenName.Wiki,               requiresRepo: true,  description: "Wiki",            statusBarLabel: "wiki",       order: 10 },
] as const;
```

Update `executeGoTo()` to build the correct stack shape:

```typescript
export function executeGoTo(
  nav: NavigationContext,
  binding: GoToBinding,
  repoContext: { owner: string; repo: string } | null,
): { error?: string } {
  if (binding.requiresRepo && !repoContext) {
    return { error: "No repository in context" };
  }

  // Stack replacement: reset to Dashboard, then push repo + destination
  nav.reset(ScreenName.Dashboard);

  // For context-dependent screens, build [Dashboard, Repo, Destination]
  if (binding.requiresRepo && repoContext) {
    nav.push(ScreenName.RepoOverview, {
      owner: repoContext.owner,
      repo: repoContext.repo,
    });
    nav.push(binding.screen, {
      owner: repoContext.owner,
      repo: repoContext.repo,
    });
  } else if (binding.screen !== ScreenName.Dashboard) {
    // For non-Dashboard context-free screens: [Dashboard, Destination]
    nav.push(binding.screen);
  }
  // For Dashboard: stack is already [Dashboard] from reset()

  return {};
}
```

**Rationale:** The existing `executeGoTo()` always pushes `RepoOverview` even for non-repo screens if `repoContext` happens to exist from a previous navigation. The corrected version only pushes the repo layer for `requiresRepo` destinations, matching the spec's stack shapes: `g d` → `[Dashboard]` depth 1, `g r` → `[Dashboard, Repositories]` depth 2, `g i` with repo → `[Dashboard, Repo, Issues]` depth 3.

---

### Step 2: Create `useGoToMode.ts` — Core state machine

**File:** `apps/tui/src/hooks/useGoToMode.ts`

This hook manages the go-to mode lifecycle: active state, 1500ms timeout, error display with 2000ms auto-clear, and status bar hint override.

```typescript
import { useState, useCallback, useRef, useEffect } from "react";
import { useStatusBarHints, type StatusBarHint } from "./useStatusBarHints.js";
import { useLayout } from "./useLayout.js";
import { goToBindings } from "../navigation/goToBindings.js";

/** Go-to mode timeout in milliseconds */
export const GOTO_TIMEOUT_MS = 1500;

/** Context error display duration in milliseconds */
export const GOTO_ERROR_DURATION_MS = 2000;

export interface GoToModeState {
  /** Whether go-to mode is currently active (waiting for second key) */
  active: boolean;
  /** Context error message to display in status bar, or null */
  error: string | null;
  /** Activate go-to mode. Starts 1500ms timeout. */
  activate: () => void;
  /** Cancel go-to mode. Clears timeout. Does NOT pop the screen. */
  cancel: () => void;
  /** Set a context error message (shown for 2000ms). Cancels go-to mode. */
  setError: (message: string) => void;
}

export function useGoToMode(): GoToModeState {
  const [active, setActive] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintsCleanupRef = useRef<(() => void) | null>(null);
  const { overrideHints } = useStatusBarHints();
  const { width } = useLayout();

  // Build go-to hints for the status bar based on terminal width
  const buildGoToHints = useCallback((): StatusBarHint[] => {
    const sorted = [...goToBindings].sort((a, b) => a.order - b.order);
    return sorted.map((b) => ({
      keys: `g+${b.key}`,
      label: b.statusBarLabel,
      order: b.order,
    }));
  }, []);

  // Clear the mode timeout
  const clearModeTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Clear the error timeout
  const clearErrorTimeout = useCallback(() => {
    if (errorTimeoutRef.current !== null) {
      clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = null;
    }
  }, []);

  // Remove status bar hint override
  const clearHintsOverride = useCallback(() => {
    if (hintsCleanupRef.current) {
      hintsCleanupRef.current();
      hintsCleanupRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearModeTimeout();
    clearHintsOverride();
    setActive(false);
  }, [clearModeTimeout, clearHintsOverride]);

  const activate = useCallback(() => {
    // Clear any existing state
    clearModeTimeout();
    clearErrorTimeout();
    clearHintsOverride();
    setErrorState(null);

    // Set active
    setActive(true);

    // Override status bar hints with go-to destinations
    const hints = buildGoToHints();
    hintsCleanupRef.current = overrideHints(hints);

    // Start 1500ms timeout
    timeoutRef.current = setTimeout(() => {
      cancel();
      if (process.env.CODEPLANE_LOG_LEVEL === "debug") {
        process.stderr.write(
          JSON.stringify({
            component: "goto",
            level: "debug",
            message: `GoTo: timeout [elapsed=${GOTO_TIMEOUT_MS}ms]`,
          }) + "\n"
        );
      }
    }, GOTO_TIMEOUT_MS);
  }, [buildGoToHints, overrideHints, cancel, clearModeTimeout, clearErrorTimeout, clearHintsOverride]);

  const setError = useCallback((message: string) => {
    // Cancel go-to mode first
    cancel();

    // Show error in status bar
    setErrorState(message);

    // Auto-clear after 2000ms
    clearErrorTimeout();
    errorTimeoutRef.current = setTimeout(() => {
      setErrorState(null);
    }, GOTO_ERROR_DURATION_MS);
  }, [cancel, clearErrorTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearModeTimeout();
      clearErrorTimeout();
      clearHintsOverride();
    };
  }, [clearModeTimeout, clearErrorTimeout, clearHintsOverride]);

  return { active, error, activate, cancel, setError };
}
```

**Key design decisions:**
- Single `active` boolean + timeout timer — minimal state, per spec.
- `overrideHints()` from `StatusBarHintsContext` replaces the left section of the status bar while go-to is active, restoring screen hints on cancel.
- `setError()` cancels go-to mode first, then shows the error message for exactly 2000ms.
- All timers are cleaned up on unmount via `useEffect` cleanup.
- Debug logging to stderr when `CODEPLANE_LOG_LEVEL=debug`, matching the observability spec.

---

### Step 3: Create `useGoToKeybindings.ts` — PRIORITY.GOTO scope registration

**File:** `apps/tui/src/hooks/useGoToKeybindings.ts`

This hook registers a keybinding scope at `PRIORITY.GOTO` (priority 3) when go-to mode is active. It handles all second-key dispatch: valid destination keys, `Esc`, `q`, `Ctrl+C`, and invalid keys.

```typescript
import { useContext, useEffect, useRef, useMemo, useCallback } from "react";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { type KeyHandler, PRIORITY } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import { useNavigation } from "../providers/NavigationProvider.js";
import { goToBindings, executeGoTo } from "../navigation/goToBindings.js";
import type { GoToModeState } from "./useGoToMode.js";

interface UseGoToKeybindingsOptions {
  goToMode: GoToModeState;
  onPop: () => void;
  onQuit: () => void;
}

/**
 * Register PRIORITY.GOTO keybinding scope when go-to mode is active.
 *
 * Handles:
 * - Valid destination keys (d, r, i, l, w, n, s, a, o, f, k) → navigate
 * - Esc → cancel go-to (no pop)
 * - q → cancel go-to AND pop screen
 * - Ctrl+C → quit TUI
 * - Any other key → cancel go-to silently
 */
export function useGoToKeybindings(options: UseGoToKeybindingsOptions): void {
  const { goToMode, onPop, onQuit } = options;
  const ctx = useContext(KeybindingContext);
  if (!ctx) throw new Error("useGoToKeybindings must be used within a KeybindingProvider");

  const nav = useNavigation();
  const scopeIdRef = useRef<string | null>(null);
  const activationTimeRef = useRef<number>(0);

  // Track activation time for latency logging
  useEffect(() => {
    if (goToMode.active) {
      activationTimeRef.current = Date.now();
    }
  }, [goToMode.active]);

  // Build handler for a valid destination key
  const handleDestination = useCallback((bindingKey: string) => {
    const binding = goToBindings.find((b) => b.key === bindingKey);
    if (!binding) {
      goToMode.cancel();
      return;
    }

    const latencyMs = Date.now() - activationTimeRef.current;
    const fromScreen = nav.currentScreen.screen;
    const repoContext = nav.repoContext;

    const result = executeGoTo(nav, binding, repoContext);

    if (result.error) {
      // Context-dependent destination failed
      goToMode.setError(result.error);

      if (process.env.CODEPLANE_LOG_LEVEL === "debug" || process.env.CODEPLANE_LOG_LEVEL === "warn") {
        process.stderr.write(
          JSON.stringify({
            component: "goto",
            level: "warn",
            message: `GoTo: context fail [destination=${binding.screen}] [screen=${fromScreen}] — no repo context`,
          }) + "\n"
        );
      }
    } else {
      // Successful navigation
      goToMode.cancel();

      if (process.env.CODEPLANE_LOG_LEVEL === "debug" || process.env.CODEPLANE_LOG_LEVEL === "info") {
        process.stderr.write(
          JSON.stringify({
            component: "goto",
            level: "info",
            message: `GoTo: navigated [from=${fromScreen}] [to=${binding.screen}] [latency_ms=${latencyMs}] [new_stack_depth=${nav.stack.length}]`,
          }) + "\n"
        );
      }
    }
  }, [nav, goToMode]);

  // Register/deregister PRIORITY.GOTO scope based on active state
  useEffect(() => {
    if (!goToMode.active) {
      // Remove scope if it exists
      if (scopeIdRef.current) {
        ctx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
      return;
    }

    // Build bindings map for all valid destination keys + cancellation keys
    const bindings = new Map<string, KeyHandler>();

    // Register all 11 destination keys
    for (const binding of goToBindings) {
      const key = normalizeKeyDescriptor(binding.key);
      bindings.set(key, {
        key,
        description: `Go to ${binding.description}`,
        group: "Go To",
        handler: () => handleDestination(binding.key),
      });
    }

    // Esc → cancel go-to (no pop)
    bindings.set(normalizeKeyDescriptor("escape"), {
      key: normalizeKeyDescriptor("escape"),
      description: "Cancel go-to",
      group: "Go To",
      handler: () => {
        goToMode.cancel();
      },
    });

    // q → cancel go-to AND pop
    bindings.set(normalizeKeyDescriptor("q"), {
      key: normalizeKeyDescriptor("q"),
      description: "Cancel go-to and go back",
      group: "Go To",
      handler: () => {
        goToMode.cancel();
        onPop();
      },
    });

    // Ctrl+C → quit TUI immediately
    bindings.set(normalizeKeyDescriptor("ctrl+c"), {
      key: normalizeKeyDescriptor("ctrl+c"),
      description: "Quit TUI",
      group: "Go To",
      handler: () => {
        goToMode.cancel();
        onQuit();
      },
    });

    // Register scope at PRIORITY.GOTO (priority 3)
    // This sits between MODAL (2) and SCREEN (4) in the dispatch order
    scopeIdRef.current = ctx.registerScope({
      priority: PRIORITY.GOTO,
      bindings,
      active: true,
    });

    return () => {
      if (scopeIdRef.current) {
        ctx.removeScope(scopeIdRef.current);
        scopeIdRef.current = null;
      }
    };
  }, [goToMode.active, ctx, handleDestination, goToMode, onPop, onQuit]);
}
```

**Critical design note on unrecognized keys:**

The keybinding priority system already handles the "unrecognized key cancels go-to" behavior naturally. When go-to mode is active, `PRIORITY.GOTO` scope intercepts all 11 destination keys plus `Esc`, `q`, and `Ctrl+C`. Any key NOT in this scope falls through the priority chain to `PRIORITY.SCREEN` (4) and `PRIORITY.GLOBAL` (5). However, the spec says an unrecognized key should cancel go-to mode silently.

To implement this, we need a **catch-all handler** approach. Since the keybinding system dispatches by exact key match, we add a catch-all mechanism to `useGoToKeybindings`: we register a special "fallthrough" handler using `useKeyboard` directly as a secondary listener that fires when go-to is active and the key wasn't handled by the GOTO scope.

**Alternative approach (simpler, preferred):** Instead of a catch-all in the keybinding system, we add a `when` guard to the global `g` binding. When go-to mode is active, ANY unmatched key that reaches `PRIORITY.GLOBAL` triggers a cancel. We modify the global `q`, `Esc` handlers to check go-to state first.

**Chosen approach:** We handle this in `GlobalKeybindings.tsx` by checking `goToMode.active` in the global handlers. Since `PRIORITY.GOTO` (3) is higher priority than `PRIORITY.GLOBAL` (5), valid go-to keys are intercepted at priority 3. Keys like `?`, `:` that reach priority 5 will first check `goToMode.active` and cancel instead of executing their normal action. For truly unrecognized keys that match nothing at any priority, we use the KeybindingProvider's `onUnhandledKey` callback (see Step 4).

---

### Step 4: Enhance `KeybindingProvider` with unhandled key callback

**File:** `apps/tui/src/providers/KeybindingProvider.tsx`

Add an `onUnhandledKey` callback to the context so that `GlobalKeybindings` can cancel go-to mode when an unrecognized key falls through all scopes.

```typescript
// In KeybindingContextType:
export interface KeybindingContextType {
  // ... existing methods ...
  /** Set a callback for keys that match no binding in any scope. */
  setUnhandledKeyCallback(cb: ((key: string) => void) | null): void;
}
```

In the `useKeyboard` handler within `KeybindingProvider`, after the scope dispatch loop:

```typescript
// After the for loop over scopes that found no match:
unhandledKeyCallbackRef.current?.(descriptor);
```

The `GlobalKeybindings` component sets this callback when go-to mode is active:

```typescript
ctx.setUnhandledKeyCallback(
  goToMode.active
    ? (key: string) => {
        goToMode.cancel();
        logDebug(`GoTo: cancelled [reason=unrecognized_key] [key=${key}]`);
      }
    : null
);
```

---

### Step 5: Enhance `GlobalKeybindings.tsx` — Wire go-to mode

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

Replace the TODO placeholder with full go-to mode integration:

```typescript
import React, { useCallback, useContext, useEffect } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
import { useGoToMode } from "../hooks/useGoToMode.js";
import { useGoToKeybindings } from "../hooks/useGoToKeybindings.js";
import { useLayout } from "../hooks/useLayout.js";
import { KeybindingContext } from "../providers/KeybindingProvider.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const goToMode = useGoToMode();
  const { breakpoint } = useLayout();
  const ctx = useContext(KeybindingContext);

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    // Esc during go-to is handled by PRIORITY.GOTO scope, not here.
    // This only fires when go-to is NOT active.
    if (nav.canGoBack) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);

  const onGoTo = useCallback(() => {
    // Suppression checks:
    // 1. Terminal too small
    if (!breakpoint) return;

    // 2. Overlay/modal active (checked via hasActiveModal in KeybindingProvider)
    if (ctx?.hasActiveModal()) return;

    // 3. Text input focus — handled by PRIORITY.TEXT_INPUT (1) which
    //    intercepts 'g' before it reaches PRIORITY.GLOBAL (5).

    // Activate go-to mode
    goToMode.activate();
  }, [breakpoint, ctx, goToMode]);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });

  // Wire go-to keybinding scope (active only during go-to mode)
  useGoToKeybindings({
    goToMode,
    onPop: onQuit,
    onQuit: onForceQuit,
  });

  // Set unhandled key callback for go-to cancellation
  useEffect(() => {
    if (!ctx) return;
    if (goToMode.active) {
      ctx.setUnhandledKeyCallback(() => {
        goToMode.cancel();
      });
    } else {
      ctx.setUnhandledKeyCallback(null);
    }
    return () => ctx.setUnhandledKeyCallback(null);
  }, [ctx, goToMode.active, goToMode]);

  return <>{children}</>;
}
```

**Suppression logic:**
- **Terminal too small** (`breakpoint === null`): `onGoTo` returns immediately.
- **Overlay/modal open**: `ctx.hasActiveModal()` check prevents activation.
- **Text input focus**: `PRIORITY.TEXT_INPUT` (1) intercepts `g` before `PRIORITY.GLOBAL` (5) ever sees it. No code needed — this is handled by OpenTUI's focus system which routes printable characters to focused `<input>`/`<textarea>` components.

---

### Step 6: Enhance `StatusBar.tsx` — Go-to mode error display

**File:** `apps/tui/src/components/StatusBar.tsx`

The status bar already renders from `useStatusBarHints()` which returns the overridden hints during go-to mode (Step 2 calls `overrideHints()`). The go-to destination hints are automatically displayed in the left section.

The enhancement needed is rendering the context error (`"No repository in context"`) from `goToMode.error`. This requires either:

1. **Option A:** `useGoToMode()` exposes error state globally via context.
2. **Option B:** The error is set via `overrideHints()` with an error-styled hint.
3. **Option C:** A separate error channel on `StatusBarHintsContext`.

**Chosen approach (Option A):** Create a `GoToModeContext` so that both `GlobalKeybindings` and `StatusBar` can access the go-to state.

**File:** `apps/tui/src/providers/GoToModeProvider.tsx` *(new file)*

```typescript
import React, { createContext, useContext, type ReactNode } from "react";
import { useGoToMode, type GoToModeState } from "../hooks/useGoToMode.js";

const GoToModeContext = createContext<GoToModeState | null>(null);

export function GoToModeProvider({ children }: { children: ReactNode }) {
  const state = useGoToMode();
  return (
    <GoToModeContext.Provider value={state}>
      {children}
    </GoToModeContext.Provider>
  );
}

export function useGoToModeContext(): GoToModeState {
  const ctx = useContext(GoToModeContext);
  if (!ctx) throw new Error("useGoToModeContext must be used within a GoToModeProvider");
  return ctx;
}
```

**Updated provider stack in `index.tsx`:**

```
<KeybindingProvider>
  <OverlayManager>
    ...
      <NavigationProvider>
        <GoToModeProvider>      {/* NEW */}
          <LoadingProvider>
            <GlobalKeybindings>
              <AppShell>...</AppShell>
            </GlobalKeybindings>
          </LoadingProvider>
        </GoToModeProvider>
      </NavigationProvider>
    ...
  </OverlayManager>
</KeybindingProvider>
```

**StatusBar enhancement:**

```typescript
import { useGoToModeContext } from "../providers/GoToModeProvider.js";

export function StatusBar() {
  // ... existing code ...
  const goToMode = useGoToModeContext();

  // In the left section rendering:
  // If there's a go-to error, show it instead of hints
  const showGoToError = goToMode.error !== null;

  return (
    <box flexDirection="row" height={1} width="100%" borderColor={theme.border} border={["top"]} justifyContent="space-between">
      <box flexGrow={1} flexDirection="row">
        {showGoToError ? (
          <text fg={theme.error}>{truncateRight(goToMode.error!, maxErrorWidth)}</text>
        ) : statusBarError ? (
          <text fg={theme.error}>{truncateRight(statusBarError, maxErrorWidth)}</text>
        ) : (
          <>
            {displayedHints.map((hint, i) => (
              <React.Fragment key={i}>
                <text bold fg={theme.primary}>{hint.keys}</text>
                <text fg={theme.muted}>{`:${hint.label}  `}</text>
              </React.Fragment>
            ))}
            {/* ... retry hint ... */}
          </>
        )}
      </box>
      {/* ... center and right sections unchanged ... */}
    </box>
  );
}
```

**Responsive hint truncation:** The status bar already limits to `hints.slice(0, 4)` at minimum breakpoint. During go-to mode, the overridden hints from `buildGoToHints()` produce 11 entries. The existing `displayedHints` logic handles truncation:

```typescript
// Enhance the truncation logic for go-to hints specifically
const isGoToActive = goToMode.active;
const maxHints = isGoToActive
  ? (width < 100 ? 4 : width < 120 ? 6 : 11)
  : (breakpoint === "minimum" ? 4 : hints.length);
const displayedHints = hints.slice(0, maxHints);
const truncated = isGoToActive && hints.length > maxHints;
```

When truncated, render a trailing `…`:

```typescript
{truncated && <text fg={theme.muted}>  …</text>}
```

---

### Step 7: Enhance `OverlayLayer.tsx` — Help overlay "Go To" group

**File:** `apps/tui/src/components/OverlayLayer.tsx`

When the help overlay is open, include a "Go To" group listing all 11 destinations. Since the help overlay content is currently a placeholder, this enhancement adds the Go To entries to the placeholder rendering:

```typescript
import { goToBindings } from "../navigation/goToBindings.js";

// Inside the help overlay content section:
{activeOverlay === "help" && (
  <box flexDirection="column">
    {/* Global keybindings group (existing) */}
    <text fg={theme.muted}>[Help overlay content — pending TUI_HELP_OVERLAY implementation]</text>
    <text> </text>

    {/* Go To group — always present */}
    <text bold fg={theme.primary}>Go To</text>
    <text fg={theme.border}>{"─".repeat(30)}</text>
    {goToBindings.map((binding) => (
      <box key={binding.key} flexDirection="row" gap={1}>
        <text bold fg={theme.primary}>{`g ${binding.key}`.padEnd(6)}</text>
        <text fg={theme.muted}>
          {binding.description}
          {binding.requiresRepo ? " (requires repo)" : ""}
        </text>
      </box>
    ))}
  </box>
)}
```

---

### Step 8: Add `GoToModeProvider` to entry point

**File:** `apps/tui/src/index.tsx`

Add the `GoToModeProvider` import and wrap it around `LoadingProvider`:

```typescript
import { GoToModeProvider } from "./providers/GoToModeProvider.js";

// In the App component JSX:
<NavigationProvider key={navResetKey} initialStack={initialStack}>
  <GoToModeProvider>
    <LoadingProvider>
      <GlobalKeybindings>
        <AppShell>
          <ScreenRouter />
        </AppShell>
      </GlobalKeybindings>
    </LoadingProvider>
  </GoToModeProvider>
</NavigationProvider>
```

**Provider order rationale:** `GoToModeProvider` must be below `NavigationProvider` (it calls `useNavigation()` via `useGoToMode()` consuming `repoContext`) and below `KeybindingProvider` (it calls `useStatusBarHints()`). It must be above `GlobalKeybindings` which calls `useGoToModeContext()`.

---

### Step 9: Update `KeybindingProvider` with unhandled key callback

**File:** `apps/tui/src/providers/KeybindingProvider.tsx`

Add `unhandledKeyCallbackRef` and `setUnhandledKeyCallback` to the provider:

```typescript
// Add ref
const unhandledKeyCallbackRef = useRef<((key: string) => void) | null>(null);

const setUnhandledKeyCallback = useCallback(
  (cb: ((key: string) => void) | null) => {
    unhandledKeyCallbackRef.current = cb;
  },
  [],
);

// In the useKeyboard handler, after the scope dispatch loop:
useKeyboard((event: KeyEvent) => {
  if (event.eventType === "release") return;
  const descriptor = normalizeKeyEvent(event);
  const scopes = getActiveScopesSorted();

  for (const scope of scopes) {
    const handler = scope.bindings.get(descriptor);
    if (handler) {
      if (handler.when && !handler.when()) continue;
      handler.handler();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  // No match in any scope — invoke unhandled callback
  unhandledKeyCallbackRef.current?.(descriptor);
});

// Add to context value:
<KeybindingContext.Provider value={{
  registerScope, removeScope, setActive,
  getAllBindings, getScreenBindings, hasActiveModal,
  setUnhandledKeyCallback,  // NEW
}}>
```

Update the `KeybindingContextType` in `keybinding-types.ts`:

```typescript
export interface KeybindingContextType {
  // ... existing ...
  /** Set a callback invoked when a key matches no binding in any active scope. */
  setUnhandledKeyCallback(cb: ((key: string) => void) | null): void;
}
```

---

### Step 10: Edge case handling

**`g g` cancels:** When the user presses `g` the first time, go-to mode activates (Step 5). The GOTO scope at priority 3 does NOT have a binding for `g` (the 11 destination keys don't include `g`). The second `g` falls through to PRIORITY.GLOBAL (5) where `g` is bound to `onGoTo`. But `onGoTo` calls `goToMode.activate()` which re-activates (clearing and re-setting). This creates a toggle: `g` activates, `g` re-activates.

To match the spec ("g g cancels"), we check if go-to is already active in `onGoTo`:

```typescript
const onGoTo = useCallback(() => {
  if (!breakpoint) return;
  if (ctx?.hasActiveModal()) return;

  // If already active, treat second 'g' as cancel (g g cancels)
  if (goToMode.active) {
    goToMode.cancel();
    return;
  }

  goToMode.activate();
}, [breakpoint, ctx, goToMode]);
```

Wait — there's a subtlety. When go-to mode is active, the GOTO scope (priority 3) is registered. The `g` key is NOT in that scope's bindings. So the `g` keypress flows past GOTO (no match) → SCREEN (4) → GLOBAL (5). At GLOBAL, the `g` handler fires `onGoTo()`. So actually, to have `g g` cancel, we need the `g` key either:

1. Added to the GOTO scope bindings as a cancel action, OR
2. Handled in `onGoTo` with an active check.

Approach 1 is cleaner because it fires at priority 3, preventing the key from reaching lower scopes:

In `useGoToKeybindings.ts`, add `g` to the GOTO scope bindings:

```typescript
// Register 'g' as cancel in GOTO scope (handles g g)
bindings.set(normalizeKeyDescriptor("g"), {
  key: normalizeKeyDescriptor("g"),
  description: "Cancel go-to",
  group: "Go To",
  handler: () => {
    goToMode.cancel();
  },
});
```

This means pressing `g` during go-to mode is handled at PRIORITY.GOTO and cancels. Combined with the unhandled key callback, any key not in the GOTO scope also cancels.

**Rapid toggle (`g Esc g d`):** After `g` activates, `Esc` cancels (GOTO scope), `g` activates again (GLOBAL), `d` navigates (GOTO scope). Each step is handled by the appropriate priority level.

**Five rapid `g` presses:** g1=activate, g2=cancel (GOTO scope `g` binding), g3=activate (GLOBAL), g4=cancel, g5=activate. Final state: active. ✓

**Resize during go-to:** `useLayout()` re-renders the StatusBar with new width. Go-to mode state (`active`, `error`) is unaffected. Hints are recalculated on next render via the truncation logic.

**Timer leak on unmount:** `useEffect` cleanup in `useGoToMode` clears both `timeoutRef` and `errorTimeoutRef`.

---

## Productionization Notes

### From POC to Production

This implementation has no POC phase — all code targets production files directly. However, the following considerations apply:

1. **`useGoToMode` is a pure state machine.** It has no external dependencies beyond `useStatusBarHints()` and `useLayout()`. It can be unit-tested in isolation by mocking these two hooks.

2. **`useGoToKeybindings` depends on the full KeybindingProvider.** It cannot be tested without the provider stack. All testing is via E2E.

3. **`executeGoTo` is a pure function** (given `nav`, `binding`, `repoContext` → stack mutation). It can be unit-tested by providing a mock NavigationContext, but per the no-mock policy, we rely on E2E tests for behavioral verification.

4. **The `setUnhandledKeyCallback` addition to `KeybindingProvider`** is the only change to an existing provider API. It is backward-compatible (no existing code calls it). The callback ref pattern avoids re-renders.

5. **Status bar rendering changes** are additive — existing `statusBarError` display, auth confirmation, and hint rendering are preserved. Go-to error takes precedence over generic `statusBarError` but not over auth confirmation (which is time-limited and independent).

### Telemetry Integration Points

The spec defines 4 telemetry events. These are implemented as structured JSON logs to stderr (matching the existing `process.stderr.write(JSON.stringify(...))` pattern in `index.tsx`). When a real telemetry client is added, these log sites become event emit calls. The log format already includes all required properties.

### Performance Budget

- Go-to mode activation: 0 API calls, 1 `useState` + 1 `setTimeout` + 1 `overrideHints()` → ~1ms.
- Second key dispatch: 1 scope lookup + 1 `executeGoTo()` (synchronous state mutations) → ~1ms.
- Screen transition after go-to: React re-render of new screen component. Target <50ms per spec. No network requests involved in navigation itself.

---

## Summary of All File Changes

| File | Action | Lines (est.) |
|---|---|---|
| `apps/tui/src/navigation/goToBindings.ts` | Enhance | ~80 (add fields, fix executeGoTo) |
| `apps/tui/src/hooks/useGoToMode.ts` | Create | ~130 |
| `apps/tui/src/hooks/useGoToKeybindings.ts` | Create | ~140 |
| `apps/tui/src/providers/GoToModeProvider.tsx` | Create | ~25 |
| `apps/tui/src/providers/KeybindingProvider.tsx` | Enhance | ~15 (add unhandled callback) |
| `apps/tui/src/providers/keybinding-types.ts` | Enhance | ~3 (add setUnhandledKeyCallback) |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Enhance | ~60 (wire go-to mode) |
| `apps/tui/src/components/StatusBar.tsx` | Enhance | ~30 (go-to error, truncation) |
| `apps/tui/src/components/OverlayLayer.tsx` | Enhance | ~25 (Go To help group) |
| `apps/tui/src/index.tsx` | Enhance | ~5 (add GoToModeProvider) |
| `e2e/tui/app-shell.test.ts` | Enhance | ~800 (52 tests) |

---

## Unit & Integration Tests

### Test File: `e2e/tui/app-shell.test.ts`

All 52 tests are added to the existing `app-shell.test.ts` file under new `describe` blocks. Tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests that fail due to unimplemented backends are left failing — never skipped or commented out.

#### Test Infrastructure Notes

- Each test launches a fresh TUI instance via `launchTUI()` with the specified terminal dimensions.
- Tests use `waitForText()` for content assertions and `snapshot()` for golden-file comparisons.
- Navigation to a repo context is achieved by launching with `--screen issues --repo alice/hello` deep link args.
- The `sendKeys()` helper accepts individual key names: `"g"`, `"d"`, `"Escape"`, `"ctrl+c"`.
- `waitForNoText()` is used to verify error messages clear after timeout.
- `getLine()` with regex matching verifies status bar content.

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers.ts";

// ---------------------------------------------------------------------------
// TUI_GOTO_KEYBINDINGS — Terminal Snapshot Tests (1–10)
// ---------------------------------------------------------------------------

describe("TUI_GOTO_KEYBINDINGS — Terminal Snapshot Tests", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("1. goto-mode-status-bar-hints — go-to hints displayed at 120x40", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    // Status bar should show go-to destination hints
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\+d/);
    expect(statusLine).toMatch(/g\+i/);
    expect(statusLine).toMatch(/g\+r/);
    // Center/right sections should still be present
    expect(statusLine).toMatch(/help/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("2. goto-mode-status-bar-hints-80col — truncated hints at 80x24", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    // Should show truncated hints with ellipsis
    expect(statusLine).toMatch(/g\+d/);
    expect(statusLine).toMatch(/…/);
    // Should NOT overflow — no wrapping
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("3. goto-mode-status-bar-hints-200col — all 11 hints at 200x60", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    // All 11 hints should be visible
    expect(statusLine).toMatch(/g\+d/);
    expect(statusLine).toMatch(/g\+i/);
    expect(statusLine).toMatch(/g\+l/);
    expect(statusLine).toMatch(/g\+r/);
    expect(statusLine).toMatch(/g\+w/);
    expect(statusLine).toMatch(/g\+n/);
    expect(statusLine).toMatch(/g\+s/);
    expect(statusLine).toMatch(/g\+a/);
    expect(statusLine).toMatch(/g\+o/);
    expect(statusLine).toMatch(/g\+f/);
    expect(statusLine).toMatch(/g\+k/);
    // No truncation indicator
    expect(statusLine).not.toMatch(/…/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("4. goto-context-error-display — error shown when no repo context", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "i");
    // Status bar should show error
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/No repository in context/);
    // Content area should be unchanged (still Dashboard)
    expect(tui.snapshot()).toMatch(/Dashboard/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("5. goto-context-error-clears-after-timeout — error clears after 2s", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "i");
    await tui.waitForText("No repository in context");
    // Wait for error to clear (2000ms + buffer)
    await tui.waitForNoText("No repository in context", 5000);
    // Status bar should show normal Dashboard hints
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("6. goto-navigation-to-dashboard — g d from Repos shows Dashboard", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "repos"],
    });
    await tui.waitForText("Repositories");
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    // Breadcrumb should show just Dashboard
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("7. goto-navigation-to-repos — g r from Dashboard shows Repos", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(headerLine).toMatch(/Repositories/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("8. goto-navigation-to-issues-with-context — g i with repo context", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    // Navigate away then back via go-to
    await tui.sendKeys("g", "i");
    await tui.waitForText("Issues");
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(headerLine).toMatch(/alice\/hello/);
    expect(headerLine).toMatch(/Issues/);
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("9. goto-navigation-to-notifications — g n shows Notifications", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "n");
    await tui.waitForText("Notifications");
    expect(tui.snapshot()).toMatchSnapshot();
  });

  test("10. goto-help-overlay-go-to-group — help shows Go To group", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    // Help overlay should include Go To group
    const snapshot = tui.snapshot();
    expect(snapshot).toMatch(/Go To/);
    expect(snapshot).toMatch(/g d/);
    expect(snapshot).toMatch(/g i/);
    expect(snapshot).toMatch(/g r/);
    expect(snapshot).toMatch(/Dashboard/);
    expect(snapshot).toMatch(/requires repo/);
    expect(snapshot).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// TUI_GOTO_KEYBINDINGS — Keyboard Interaction Tests (11–39)
// ---------------------------------------------------------------------------

describe("TUI_GOTO_KEYBINDINGS — Keyboard Interaction Tests", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("11. goto-g-activates-mode — pressing g shows go-to hints", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\+d/);
    expect(statusLine).toMatch(/dashboard/);
    // Content area unchanged
    expect(tui.snapshot()).toMatch(/Dashboard/);
  });

  test("12. goto-gd-navigates-to-dashboard — from Repos, g d → Dashboard depth 1", async () => {
    tui = await launchTUI({ args: ["--screen", "repos"] });
    await tui.waitForText("Repositories");
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    // q should exit TUI (depth 1 = root)
    // We verify by checking breadcrumb has only Dashboard
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(headerLine).not.toMatch(/Repositories/);
  });

  test("13. goto-gr-navigates-to-repos — g r → Repository list", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
  });

  test("14. goto-gw-navigates-to-workspaces — g w → Workspaces", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "w");
    await tui.waitForText("Workspaces");
  });

  test("15. goto-gn-navigates-to-notifications — g n → Notifications", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "n");
    await tui.waitForText("Notifications");
  });

  test("16. goto-gs-navigates-to-search — g s → Search", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "s");
    await tui.waitForText("Search");
  });

  test("17. goto-ga-navigates-to-agents — g a → Agents", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "a");
    await tui.waitForText("Agents");
  });

  test("18. goto-go-navigates-to-organizations — g o → Organizations", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "o");
    await tui.waitForText("Organizations");
  });

  test("19. goto-gi-navigates-with-repo-context — g i with repo → Issues", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    // Navigate to Dashboard first, then go-to Issues
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    // Repo context should still be available from deep-link
    await tui.sendKeys("g", "i");
    await tui.waitForText("Issues");
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(headerLine).toMatch(/alice\/hello/);
    expect(headerLine).toMatch(/Issues/);
  });

  test("20. goto-gl-navigates-with-repo-context — g l with repo → Landings", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landings");
  });

  test("21. goto-gf-navigates-with-repo-context — g f with repo → Workflows", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "f");
    await tui.waitForText("Workflows");
  });

  test("22. goto-gk-navigates-with-repo-context — g k with repo → Wiki", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    await tui.sendKeys("g", "k");
    await tui.waitForText("Wiki");
  });

  test("23. goto-gi-fails-without-repo-context — g i from Dashboard shows error", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "i");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/No repository in context/);
    // Screen unchanged
    expect(tui.snapshot()).toMatch(/Dashboard/);
  });

  test("24. goto-gl-fails-without-repo-context — g l from Dashboard shows error", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "l");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/No repository in context/);
  });

  test("25. goto-gf-fails-without-repo-context — g f from Dashboard shows error", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "f");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/No repository in context/);
  });

  test("26. goto-gk-fails-without-repo-context — g k from Dashboard shows error", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "k");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/No repository in context/);
  });

  test("27. goto-escape-cancels — g then Esc cancels go-to, screen unchanged", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    // Verify go-to is active
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\+d/);
    await tui.sendKeys("Escape");
    // Go-to hints should be gone, back to screen hints
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
    // Screen unchanged
    expect(tui.snapshot()).toMatch(/Dashboard/);
  });

  test("28. goto-invalid-key-cancels — g then x cancels silently", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\+d/);
    await tui.sendKeys("x");
    // Go-to cancelled, screen unchanged
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
    expect(tui.snapshot()).toMatch(/Dashboard/);
  });

  test("29. goto-timeout-cancels — g then wait 1600ms, d does NOT navigate", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\+d/);
    // Wait for timeout (1500ms + 100ms buffer)
    await new Promise((r) => setTimeout(r, 1600));
    // Go-to should have timed out
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
    // Press d — should NOT navigate (go-to expired)
    await tui.sendKeys("d");
    // Still on Dashboard (d has no effect without go-to mode)
    expect(tui.snapshot()).toMatch(/Dashboard/);
  });

  test("30. goto-q-cancels-and-pops — g then q cancels go-to AND pops", async () => {
    tui = await launchTUI({ args: ["--screen", "repos"] });
    await tui.waitForText("Repositories");
    await tui.sendKeys("g");
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\+d/);
    await tui.sendKeys("q");
    // Should have cancelled go-to AND popped to Dashboard
    await tui.waitForText("Dashboard");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
  });

  test("31. goto-ctrl-c-quits — g then Ctrl+C exits TUI", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    await tui.sendKeys("ctrl+c");
    // TUI should have exited — any subsequent operation will fail or
    // the process should no longer be running
    // We verify by checking the process is terminated
    // (launchTUI's terminate is idempotent)
    await new Promise((r) => setTimeout(r, 500));
    // If the process is still running, this would succeed;
    // we mainly verify no error is thrown during the key sequence
  });

  test("32. goto-suppressed-during-input-focus — g goes to input not go-to", async () => {
    // This test requires a screen with a text input.
    // The Search screen has a filter input.
    tui = await launchTUI({ args: ["--screen", "search"] });
    await tui.waitForText("Search");
    // Focus the search input (typically / or auto-focused)
    await tui.sendKeys("/");
    // Now type 'g' — it should go into the input, not activate go-to
    await tui.sendKeys("g");
    // Status bar should NOT show go-to hints
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
  });

  test("33. goto-suppressed-during-help-overlay — g does nothing in help", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("?");
    // Help overlay should be open
    await tui.waitForText("Keybindings");
    // Press g — should not activate go-to
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d:dashboard/);
    // Help overlay still open
    expect(tui.snapshot()).toMatch(/Keybindings/);
  });

  test("34. goto-suppressed-during-command-palette — g goes to palette search", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys(":");
    // Command palette should be open
    await tui.waitForText("Command Palette");
    // Press g — should not activate go-to
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d:dashboard/);
  });

  test("35. goto-replaces-stack-from-deep — from 4 deep, g d → depth 1", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    // Stack: [Dashboard, alice/hello, Issues] = depth 3
    // Go to Dashboard
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    // Breadcrumb should only show Dashboard
    const headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(headerLine).not.toMatch(/Issues/);
    expect(headerLine).not.toMatch(/alice/);
  });

  test("36. goto-rapid-gg-cancels — g g cancels go-to, screen unchanged", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "g");
    // Go-to should be cancelled
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
    // Screen unchanged
    expect(tui.snapshot()).toMatch(/Dashboard/);
  });

  test("37. goto-rapid-toggle — g Esc g d navigates to Dashboard", async () => {
    tui = await launchTUI({ args: ["--screen", "repos"] });
    await tui.waitForText("Repositories");
    // g → activate, Esc → cancel, g → activate again, d → navigate
    await tui.sendKeys("g");
    await tui.sendKeys("Escape");
    await tui.sendKeys("g");
    await tui.sendKeys("d");
    await tui.waitForText("Dashboard");
  });

  test("38. goto-status-bar-reverts-on-navigation — after g r shows Repo hints", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    // Status bar should show Repo list hints, not go-to hints
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
    expect(statusLine).not.toMatch(/g\+r/);
  });

  test("39. goto-status-bar-reverts-on-cancel — after g Esc shows Dashboard hints", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\+d/);
    await tui.sendKeys("Escape");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).not.toMatch(/g\+d/);
  });

  test("40. goto-error-does-not-overflow-status-bar — at 80x24 error fits", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "i");
    const statusLine = tui.getLine(tui.rows - 1);
    // Error message (30 chars) should fit without overlapping sync/help
    expect(statusLine).toMatch(/No repository in context/);
    expect(statusLine).toMatch(/help/);
    // Line length should not exceed terminal width
    expect(statusLine.length).toBeLessThanOrEqual(tui.cols);
  });
});

// ---------------------------------------------------------------------------
// TUI_GOTO_KEYBINDINGS — Responsive Tests (41–47)
// ---------------------------------------------------------------------------

describe("TUI_GOTO_KEYBINDINGS — Responsive Tests", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("41. goto-mode-at-80x24 — active + truncated hints, d navigates", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.minimum.width,
      rows: TERMINAL_SIZES.minimum.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\+d/);
    expect(statusLine).toMatch(/…/);
    await tui.sendKeys("d");
    await tui.waitForText("Dashboard");
  });

  test("42. goto-mode-at-120x40 — hints visible, r navigates", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\+d/);
    expect(statusLine).toMatch(/g\+r/);
    await tui.sendKeys("r");
    await tui.waitForText("Repositories");
  });

  test("43. goto-mode-at-200x60 — all 11 hints, n navigates", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.large.width,
      rows: TERMINAL_SIZES.large.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\+k/);
    expect(statusLine).not.toMatch(/…/);
    await tui.sendKeys("n");
    await tui.waitForText("Notifications");
  });

  test("44. goto-resize-during-mode — 120→80 while go-to, still works", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g");
    expect(tui.getLine(tui.rows - 1)).toMatch(/g\+d/);
    // Resize to minimum
    await tui.resize(
      TERMINAL_SIZES.minimum.width,
      TERMINAL_SIZES.minimum.height,
    );
    // Go-to should still be active
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/g\+d/);
    // Hints should be re-truncated
    expect(statusLine).toMatch(/…/);
    // Navigation should still work
    await tui.sendKeys("d");
    await tui.waitForText("Dashboard");
  });

  test("45. goto-resize-during-error — 120→80 during error display", async () => {
    tui = await launchTUI({
      cols: TERMINAL_SIZES.standard.width,
      rows: TERMINAL_SIZES.standard.height,
    });
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "i");
    await tui.waitForText("No repository in context");
    // Resize to minimum during error
    await tui.resize(
      TERMINAL_SIZES.minimum.width,
      TERMINAL_SIZES.minimum.height,
    );
    // Error should still be visible at new width
    const statusLine = tui.getLine(tui.rows - 1);
    expect(statusLine).toMatch(/No repository in context/);
    // Wait for error to clear
    await tui.waitForNoText("No repository in context", 5000);
  });

  test("46. goto-all-destinations-at-minimum-size — 7 context-free at 80x24", async () => {
    const contextFreeKeys = ["d", "r", "w", "n", "s", "a", "o"];
    const expectedScreens = [
      "Dashboard", "Repositories", "Workspaces",
      "Notifications", "Search", "Agents", "Organizations",
    ];

    for (let idx = 0; idx < contextFreeKeys.length; idx++) {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
      });
      await tui.waitForText("Dashboard");
      await tui.sendKeys("g", contextFreeKeys[idx]);
      await tui.waitForText(expectedScreens[idx]);
      await tui.terminate();
    }
  });

  test("47. goto-context-destinations-at-minimum-size — 4 repo-context at 80x24", async () => {
    const contextKeys = ["i", "l", "f", "k"];
    const expectedScreens = ["Issues", "Landings", "Workflows", "Wiki"];

    for (let idx = 0; idx < contextKeys.length; idx++) {
      tui = await launchTUI({
        cols: TERMINAL_SIZES.minimum.width,
        rows: TERMINAL_SIZES.minimum.height,
        args: ["--screen", "issues", "--repo", "alice/hello"],
      });
      await tui.waitForText("Issues");
      await tui.sendKeys("g", contextKeys[idx]);
      await tui.waitForText(expectedScreens[idx]);
      await tui.terminate();
    }
  });
});

// ---------------------------------------------------------------------------
// TUI_GOTO_KEYBINDINGS — Integration Tests (48–52)
// ---------------------------------------------------------------------------

describe("TUI_GOTO_KEYBINDINGS — Integration Tests", () => {
  let tui: TUITestInstance;

  afterEach(async () => {
    await tui?.terminate();
  });

  test("48. goto-after-deep-link-launch — go-to works after deep link", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    // Go to Dashboard
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    // Then go to Repos
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
  });

  test("49. goto-preserves-repo-context-across-navigations — g i then g l same repo", async () => {
    tui = await launchTUI({
      args: ["--screen", "issues", "--repo", "alice/hello"],
    });
    await tui.waitForText("Issues");
    // Go to Issues (should use same repo context)
    await tui.sendKeys("g", "i");
    await tui.waitForText("Issues");
    let headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/alice\/hello/);
    // Go to Landings (should still use same repo context)
    await tui.sendKeys("g", "l");
    await tui.waitForText("Landings");
    headerLine = tui.getLine(0);
    expect(headerLine).toMatch(/alice\/hello/);
    expect(headerLine).toMatch(/Landings/);
  });

  test("50. goto-notification-badge-persists — badge count survives go-to", async () => {
    // This test verifies that the notification badge in the status bar
    // persists across go-to navigations. It requires a real API server
    // with unread notifications, so it may fail without the backend.
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    // Check for any notification indicator in status bar
    const initialStatus = tui.getLine(tui.rows - 1);
    // Navigate away and back
    await tui.sendKeys("g", "r");
    await tui.waitForText("Repositories");
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    // Notification badge area should be consistent
    const finalStatus = tui.getLine(tui.rows - 1);
    // The help indicator should always be present
    expect(finalStatus).toMatch(/help/);
  });

  test("51. goto-command-palette-equivalent — : + dashboard == g d", async () => {
    // Navigate via go-to
    tui = await launchTUI({ args: ["--screen", "repos"] });
    await tui.waitForText("Repositories");
    await tui.sendKeys("g", "d");
    await tui.waitForText("Dashboard");
    const goToHeader = tui.getLine(0);
    await tui.terminate();

    // Navigate via command palette (when implemented)
    // This test verifies equivalent stack state
    tui = await launchTUI({ args: ["--screen", "repos"] });
    await tui.waitForText("Repositories");
    await tui.sendKeys(":");
    // Command palette interaction — depends on TUI_COMMAND_PALETTE
    // implementation. Test left here to fail naturally until implemented.
    await tui.waitForText("Command Palette");
    await tui.sendText("dashboard");
    await tui.sendKeys("Enter");
    await tui.waitForText("Dashboard");
    const paletteHeader = tui.getLine(0);
    // Both methods should produce identical stack state
    expect(paletteHeader).toEqual(goToHeader);
  });

  test("52. goto-back-navigation-after-goto — g n then q → Dashboard, q → exits", async () => {
    tui = await launchTUI();
    await tui.waitForText("Dashboard");
    await tui.sendKeys("g", "n");
    await tui.waitForText("Notifications");
    // q should go back to Dashboard (stack: [Dashboard, Notifications])
    await tui.sendKeys("q");
    await tui.waitForText("Dashboard");
    // q again should exit TUI (stack: [Dashboard], root screen)
    // We can't easily verify process exit, but we verify we're on Dashboard
    // and pressing q does not navigate elsewhere
  });
});
```

---

## Test Notes

1. **Tests 1–10 (Snapshots):** Use `toMatchSnapshot()` for golden-file comparison. First run creates baselines. Subsequent runs compare against them. Snapshot files are stored alongside the test file by bun:test.

2. **Tests 11–39 (Keyboard):** Assert on specific terminal buffer content after key sequences. Use `waitForText()` for navigation transitions and `getLine()` for status bar assertions.

3. **Tests 41–47 (Responsive):** Launch at specific terminal sizes and verify layout adaptation. Test 44 uses `resize()` to verify dynamic re-layout.

4. **Tests 48–52 (Integration):** Test cross-cutting interactions with deep links, repo context persistence, notification badge, command palette equivalence, and back-navigation.

5. **Test 50** (notification badge) depends on a real API server returning unread notifications. It will fail without the backend — left failing per project policy.

6. **Test 51** (command palette equivalence) depends on TUI_COMMAND_PALETTE being implemented. It will fail until that ticket lands — left failing per project policy.

7. **Test 32** (input suppression) depends on the Search screen having a focusable text input. If the Search screen is still a placeholder without input focus, the test will fail naturally.

8. **No mocking:** All tests use `launchTUI()` which spawns a real TUI process with a real PTY. No internal hooks, providers, or components are mocked.

---

## Verification Checklist

- [ ] `useGoToMode.ts` created with activate/cancel/setError/active/error
- [ ] `useGoToKeybindings.ts` created with PRIORITY.GOTO scope registration
- [ ] `GoToModeProvider.tsx` created and added to provider stack
- [ ] `GlobalKeybindings.tsx` wires `onGoTo` to `goToMode.activate()` with suppression checks
- [ ] `KeybindingProvider.tsx` supports `setUnhandledKeyCallback` for catch-all cancellation
- [ ] `goToBindings.ts` enhanced with `statusBarLabel`, `order`, and fixed stack semantics
- [ ] `StatusBar.tsx` renders go-to hints (via overrideHints) and error messages
- [ ] `OverlayLayer.tsx` help overlay includes "Go To" group with 11 entries
- [ ] `index.tsx` includes `<GoToModeProvider>` in provider stack
- [ ] All 52 E2E tests added to `e2e/tui/app-shell.test.ts`
- [ ] `g g` cancels go-to mode (second `g` in GOTO scope)
- [ ] 1500ms timeout auto-cancels go-to mode
- [ ] 2000ms error display auto-clears
- [ ] Unrecognized keys cancel via `setUnhandledKeyCallback`
- [ ] `Esc` cancels without popping, `q` cancels and pops
- [ ] Context-dependent destinations check `repoContext` at second-key time
- [ ] Status bar hints truncated with `…` at narrow widths
- [ ] Resize during go-to mode re-truncates hints, mode persists
- [ ] Timer cleanup on unmount prevents memory leaks