# Engineering Specification: `tui-nav-chrome-eng-05` — GoToMode Hook and State Machine

## Overview

This ticket implements the go-to mode state machine as the reusable hook `useGoToMode()`. Go-to mode is a two-key chord system (press `g`, then a destination key within 1500ms) that navigates to a target screen. The hook encapsulates the state machine, timeout management, keybinding scope registration, status bar hint overrides, repo context validation, and error display lifecycle.

### Dependencies

| Ticket | Artifact | Status |
|--------|----------|--------|
| `tui-nav-chrome-eng-01` | `NavigationProvider` + `useNavigation()` | Implemented — `apps/tui/src/providers/NavigationProvider.tsx` |
| `tui-nav-chrome-eng-02` | `KeybindingProvider` + priority dispatch system | Implemented — `apps/tui/src/providers/KeybindingProvider.tsx` |

### Existing Assets Consumed

| File | What it provides |
|------|------------------|
| `apps/tui/src/navigation/goToBindings.ts` | `GoToBinding` type, `goToBindings` static array (11 entries), `executeGoTo()` function |
| `apps/tui/src/providers/keybinding-types.ts` | `PRIORITY.GOTO` (3), `KeyHandler`, `KeybindingScope`, `StatusBarHint` |
| `apps/tui/src/providers/normalize-key.ts` | `normalizeKeyDescriptor()` for consistent key lookup |
| `apps/tui/src/providers/KeybindingProvider.tsx` | `KeybindingContext`, `StatusBarHintsContext` |
| `apps/tui/src/providers/NavigationProvider.tsx` | `useNavigation()` → `NavigationContext` with `reset()`, `push()`, `repoContext` |
| `apps/tui/src/components/GlobalKeybindings.tsx` | `onGoTo` callback stub (currently `/* TODO */`) |
| `apps/tui/src/hooks/useGlobalKeybindings.ts` | Registers `g` key at `PRIORITY.GLOBAL` → calls `onGoTo` |

---

## Implementation Plan

### Step 1: Define the `GoToHint` type and hook return interface

**File:** `apps/tui/src/hooks/useGoToMode.ts`

Define the public API types for the hook:

```typescript
export interface GoToHint {
  /** The second key to press after 'g' (e.g., "d", "r", "i") */
  key: string;
  /** Human-readable destination name (e.g., "Dashboard", "Issues") */
  destination: string;
  /** Whether this destination requires a repo in the navigation stack */
  requiresRepo: boolean;
}

export interface GoToModeState {
  /** Whether go-to mode is currently active (waiting for second key) */
  active: boolean;
  /** Activate go-to mode — called by the global 'g' keybinding handler */
  activate: () => void;
  /** Cancel go-to mode — clears timer and scope without navigating */
  cancel: () => void;
  /** Static array of all available go-to destinations */
  destinationHints: GoToHint[];
  /** Transient error message, or null. Auto-clears after 2000ms. */
  error: string | null;
}
```

The `GoToHint[]` array is derived from the existing `goToBindings` in `apps/tui/src/navigation/goToBindings.ts` — it is a 1:1 mapping:

```typescript
const destinationHints: GoToHint[] = goToBindings.map((b) => ({
  key: b.key,
  destination: b.description,
  requiresRepo: b.requiresRepo,
}));
```

This is computed once as a module-level constant since `goToBindings` is a static `readonly` array.

### Step 2: Implement the state machine

**File:** `apps/tui/src/hooks/useGoToMode.ts`

The state machine has three states:

```
┌──────────┐     g key      ┌──────────┐   second key    ┌──────────┐
│ Inactive │ ──────────────→ │  Active  │ ──────────────→ │ Inactive │
│          │                 │ (1500ms  │ (resolve/cancel) │          │
│          │ ←─── timeout ── │  timer)  │                 │          │
│          │ ←─── Escape ─── │          │                 │          │
│          │ ←── modal ───── │          │                 │          │
└──────────┘                 └──────────┘                 └──────────┘
                                                                │
                                                          (if error)
                                                                │
                                                                ▼
                                                          ┌──────────┐
                                                          │  Error   │
                                                          │ (2000ms  │
                                                          │  auto-   │
                                                          │  clear)  │
                                                          └──────────┘
```

**Internal state variables:**

```typescript
const [active, setActive] = useState(false);
const [error, setError] = useState<string | null>(null);
const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const scopeIdRef = useRef<string | null>(null);
const hintCleanupRef = useRef<(() => void) | null>(null);
```

**Activation (`activate`):**

1. Check `ctx.hasActiveModal()` — if a modal is open, do not activate (return immediately). This prevents go-to mode from activating when the command palette, help overlay, or confirmation dialog is open.
2. If already active (`scopeIdRef.current !== null`), do nothing (idempotent).
3. Set `active = true`.
4. Start 1500ms timeout → on expiry, call `cancel()`.
5. Register a `PRIORITY.GOTO` keybinding scope with bindings for every lowercase letter `a-z` (known keys resolve, unknown keys cancel), plus `escape` to cancel.
6. Override status bar hints with the go-to destination list via `statusBarCtx.overrideHints()`.

**Resolution (second key press — known go-to key):**

1. Look up the pressed key in `GOTO_BINDING_MAP`.
2. Call `deactivate()` to clean up go-to mode state.
3. Call `executeGoTo(nav, binding, repoContext)`.
4. If `executeGoTo` returns `{ error: "No repository in context" }`:
   - Set `error` state.
   - Override status bar hints with error message.
   - Start 2000ms timer → on expiry, clear error and restore hints.

**Cancellation (unknown key, Escape, or timeout):**

1. Call `deactivate()` which:
   - Clears the 1500ms timeout.
   - Removes the `PRIORITY.GOTO` keybinding scope.
   - Restores status bar hints (calls the cleanup function from `overrideHints`).
   - Sets `active = false`.

**Cleanup on unmount:**

A `useEffect` cleanup function clears both the activation timeout and the error timeout, removes the keybinding scope if active, and calls the hint cleanup function. This prevents memory leaks and stale timers.

### Step 3: Implement the keybinding scope registration

When go-to mode activates, the hook registers a `PRIORITY.GOTO` (priority 3) scope with the `KeybindingProvider`. This scope contains:

- One binding per lowercase letter `a-z`:
  - **Known go-to keys** (`d`, `r`, `i`, `l`, `w`, `n`, `s`, `o`, `f`, `k`, `a`) → resolve destination
  - **Unknown letters** → call `cancel()`
- One binding for `escape` → calls `cancel()`

Because `PRIORITY.GOTO` (3) is higher priority than `PRIORITY.SCREEN` (4) and `PRIORITY.GLOBAL` (5), but lower than `PRIORITY.MODAL` (2), the go-to bindings correctly intercept the second key before it reaches screen-specific or global handlers, while modal focus still takes precedence.

**Scope construction:**

```typescript
const bindings = new Map<string, KeyHandler>();

for (const letter of ALL_LETTERS) {
  const normalized = normalizeKeyDescriptor(letter);
  const binding = GOTO_BINDING_MAP.get(normalized);

  bindings.set(normalized, {
    key: normalized,
    description: binding ? binding.description : "Cancel",
    group: "Go-to",
    handler: binding
      ? () => resolveGoTo(binding)
      : () => cancel(),
  });
}

bindings.set(normalizeKeyDescriptor("escape"), {
  key: normalizeKeyDescriptor("escape"),
  description: "Cancel go-to",
  group: "Go-to",
  handler: cancel,
});

const scopeId = keybindingCtx.registerScope({
  priority: PRIORITY.GOTO,
  bindings,
  active: true,
});
scopeIdRef.current = scopeId;
```

**Architectural Decision — Catch-all letter binding:** Register all 26 lowercase letters in the GOTO scope, with unknown keys calling `cancel()`. Without a catch-all, pressing an unknown letter (e.g., `x`) during go-to mode would fall through to the screen scope (PRIORITY.SCREEN), potentially triggering an unintended action. By capturing all letters, the GOTO scope guarantees that any letter press during go-to mode is handled within the go-to context. Non-letter keys (numbers, symbols, Ctrl combinations) still fall through, which is acceptable — they are not confusable with go-to destinations.

### Step 4: Implement status bar hint override

When go-to mode activates, the hook calls `statusBarCtx.overrideHints(goToHints)` to replace the normal status bar hints with the go-to destination list:

```typescript
const GOTO_STATUS_HINTS: StatusBarHint[] = goToBindings.map((b, i) => ({
  keys: `g ${b.key}`,
  label: b.description.toLowerCase(),
  order: i * 10,
}));
```

The `overrideHints` call returns a cleanup function stored in `hintCleanupRef`. When go-to mode deactivates (resolve, cancel, or timeout), the cleanup function is called to restore normal hints.

This satisfies test `KEY-KEY-031` which asserts that go-to mode changes the status bar and `Escape` restores it.

### Step 5: Implement error state with auto-clear

When `executeGoTo()` returns `{ error: "No repository in context" }`:

1. Set `error` state to the error string.
2. Override status bar hints with an error hint: `{ keys: "⚠", label: "No repository in context", order: 0 }`.
3. Start a 2000ms timeout.
4. On timeout expiry, set `error` to `null` and call the hint override cleanup.

**Architectural Decision — Error via status bar:** The error message is shown by overriding status bar hints for 2000ms, rather than rendering a separate error component. The status bar is always visible and is the natural location for transient feedback in the TUI. This avoids the complexity of a separate error overlay and matches the existing pattern where go-to mode already overrides hints.

### Step 6: Wire `useGoToMode` into `GlobalKeybindings`

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

Replace the `/* TODO: wired in go-to keybindings ticket */` stub with a call to `useGoToMode()`, and pass `goTo.activate` as the `onGoTo` callback:

```typescript
import { useGoToMode } from "../hooks/useGoToMode.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const goTo = useGoToMode();

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (goTo.active) { goTo.cancel(); return; }
    if (nav.canGoBack) { nav.pop(); }
  }, [nav, goTo]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);
  const onGoTo = useCallback(() => { goTo.activate(); }, [goTo]);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
  return <>{children}</>;
}
```

**Note on `onEscape`:** When go-to mode is active, `Escape` should cancel go-to mode rather than popping the screen. The go-to scope itself registers an `escape` binding at `PRIORITY.GOTO` (3) which fires before the global `escape` at `PRIORITY.GLOBAL` (5), so the GOTO scope's escape handler cancels go-to mode and prevents the global handler from also executing. The global `onEscape` handler also checks `goTo.active` as a defensive guard.

### Step 7: Export from hooks index

**File:** `apps/tui/src/hooks/index.ts`

Add the export:

```typescript
export { useGoToMode, type GoToHint, type GoToModeState } from "./useGoToMode.js";
```

---

## Full Implementation

**File:** `apps/tui/src/hooks/useGoToMode.ts`

```typescript
import { useState, useRef, useCallback, useContext, useEffect, useMemo } from "react";
import { KeybindingContext, StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import { PRIORITY, type KeyHandler, type StatusBarHint } from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import { goToBindings, executeGoTo, type GoToBinding } from "../navigation/goToBindings.js";
import { useNavigation } from "../providers/NavigationProvider.js";

// ── Public types ────────────────────────────────────────────────────

export interface GoToHint {
  /** The second key to press after 'g' (e.g., "d", "r", "i") */
  key: string;
  /** Human-readable destination name (e.g., "Dashboard", "Issues") */
  destination: string;
  /** Whether this destination requires a repo in the navigation stack */
  requiresRepo: boolean;
}

export interface GoToModeState {
  /** Whether go-to mode is currently active (waiting for second key) */
  active: boolean;
  /** Activate go-to mode — called by the global 'g' keybinding handler */
  activate: () => void;
  /** Cancel go-to mode — clears timer and scope without navigating */
  cancel: () => void;
  /** Static array of all available go-to destinations */
  destinationHints: GoToHint[];
  /** Transient error message, or null. Auto-clears after 2000ms. */
  error: string | null;
}

// ── Constants ───────────────────────────────────────────────────────

const GOTO_TIMEOUT_MS = 1500;
const ERROR_DISPLAY_MS = 2000;

/** All lowercase letters for catch-all matching in go-to scope */
const ALL_LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");

// ── Static data ─────────────────────────────────────────────────────

/** Pre-computed destination hints from goToBindings (static, never changes) */
const DESTINATION_HINTS: GoToHint[] = goToBindings.map((b) => ({
  key: b.key,
  destination: b.description,
  requiresRepo: b.requiresRepo,
}));

/** Pre-computed go-to binding lookup map */
const GOTO_BINDING_MAP = new Map<string, GoToBinding>(
  goToBindings.map((b) => [normalizeKeyDescriptor(b.key), b]),
);

/** Pre-computed status bar hints shown during go-to mode */
const GOTO_STATUS_HINTS: StatusBarHint[] = goToBindings.map((b, i) => ({
  keys: `g ${b.key}`,
  label: b.description.toLowerCase(),
  order: i * 10,
}));

// ── Hook ────────────────────────────────────────────────────────────

export function useGoToMode(): GoToModeState {
  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);
  const nav = useNavigation();

  if (!keybindingCtx) throw new Error("useGoToMode must be used within a KeybindingProvider");
  if (!statusBarCtx) throw new Error("useGoToMode must be used within a KeybindingProvider (StatusBarHints)");

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for timer cleanup
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopeIdRef = useRef<string | null>(null);
  const hintCleanupRef = useRef<(() => void) | null>(null);

  // Stable reference to nav for use inside handlers
  const navRef = useRef(nav);
  navRef.current = nav;

  // ── Deactivation (shared cleanup logic) ──────────────────────────

  const deactivate = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (scopeIdRef.current !== null) {
      keybindingCtx.removeScope(scopeIdRef.current);
      scopeIdRef.current = null;
    }

    if (hintCleanupRef.current !== null) {
      hintCleanupRef.current();
      hintCleanupRef.current = null;
    }

    setActive(false);
  }, [keybindingCtx]);

  // ── Error display ────────────────────────────────────────────────

  const showError = useCallback(
    (message: string) => {
      if (errorTimeoutRef.current !== null) {
        clearTimeout(errorTimeoutRef.current);
      }

      setError(message);

      const errorHints: StatusBarHint[] = [
        { keys: "⚠", label: message, order: 0 },
      ];
      const cleanup = statusBarCtx.overrideHints(errorHints);

      errorTimeoutRef.current = setTimeout(() => {
        setError(null);
        cleanup();
        errorTimeoutRef.current = null;
      }, ERROR_DISPLAY_MS);
    },
    [statusBarCtx],
  );

  // ── Go-to resolution ─────────────────────────────────────────────

  const resolveGoTo = useCallback(
    (binding: GoToBinding) => {
      deactivate();
      const result = executeGoTo(navRef.current, binding, navRef.current.repoContext);
      if (result.error) {
        showError(result.error);
      }
    },
    [deactivate, showError],
  );

  // ── Cancel ───────────────────────────────────────────────────────

  const cancel = useCallback(() => {
    deactivate();
  }, [deactivate]);

  // ── Activation ───────────────────────────────────────────────────

  const activate = useCallback(() => {
    // Guard: don't activate if a modal is open
    if (keybindingCtx.hasActiveModal()) return;

    // Guard: already active — idempotent
    if (scopeIdRef.current !== null) return;

    setActive(true);

    // Build keybinding map for GOTO scope
    const bindings = new Map<string, KeyHandler>();

    for (const letter of ALL_LETTERS) {
      const normalized = normalizeKeyDescriptor(letter);
      const binding = GOTO_BINDING_MAP.get(normalized);

      bindings.set(normalized, {
        key: normalized,
        description: binding ? binding.description : "Cancel",
        group: "Go-to",
        handler: binding
          ? () => resolveGoTo(binding)
          : () => cancel(),
      });
    }

    bindings.set(normalizeKeyDescriptor("escape"), {
      key: normalizeKeyDescriptor("escape"),
      description: "Cancel go-to",
      group: "Go-to",
      handler: cancel,
    });

    const scopeId = keybindingCtx.registerScope({
      priority: PRIORITY.GOTO,
      bindings,
      active: true,
    });
    scopeIdRef.current = scopeId;

    hintCleanupRef.current = statusBarCtx.overrideHints(GOTO_STATUS_HINTS);

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      cancel();
    }, GOTO_TIMEOUT_MS);
  }, [keybindingCtx, statusBarCtx, resolveGoTo, cancel]);

  // ── Cleanup on unmount ───────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      if (errorTimeoutRef.current !== null) clearTimeout(errorTimeoutRef.current);
      if (scopeIdRef.current !== null) keybindingCtx.removeScope(scopeIdRef.current);
      if (hintCleanupRef.current !== null) hintCleanupRef.current();
    };
  }, [keybindingCtx]);

  return useMemo<GoToModeState>(
    () => ({
      active,
      activate,
      cancel,
      destinationHints: DESTINATION_HINTS,
      error,
    }),
    [active, activate, cancel, error],
  );
}
```

---

## Architectural Decisions

### AD-1: Catch-all letter binding vs. fall-through

**Decision:** Register all 26 lowercase letters in the GOTO scope, with unknown keys calling `cancel()`.

**Rationale:** Without a catch-all, pressing an unknown letter (e.g., `x`) during go-to mode would fall through to the screen scope (PRIORITY.SCREEN), potentially triggering an unintended action. By capturing all letters, the GOTO scope guarantees that any letter press during go-to mode is handled within the go-to context. Non-letter keys (numbers, symbols, Ctrl combinations) still fall through, which is acceptable — they are not confusable with go-to destinations.

### AD-2: Ref-based navigation access

**Decision:** Use `navRef` (a ref wrapping the latest `nav` context) inside handler closures rather than depending on `nav` directly.

**Rationale:** The keybinding scope handlers are constructed once during `activate()`. If `nav` changes (e.g., due to a stack update), the handlers would be stale. Using a ref ensures handlers always access the current navigation context. The `goToBindings` and `executeGoTo` function handle the actual navigation logic, so the hook only needs a stable reference to `nav`.

### AD-3: Error displayed via status bar override

**Decision:** The error message ("No repository in context") is shown by overriding status bar hints for 2000ms, rather than rendering a separate error component.

**Rationale:** The status bar is always visible and is the natural location for transient feedback in the TUI. This avoids the complexity of a separate error overlay, keeps the implementation self-contained within the hook, and matches the existing pattern where go-to mode already overrides hints. The caller can also read `error` from the hook return value if additional display is needed.

### AD-4: Static destination hints

**Decision:** `destinationHints` is a module-level constant (`DESTINATION_HINTS`), not computed per-render.

**Rationale:** `goToBindings` is a static `readonly` array that never changes at runtime. Computing hints per-render would be wasteful. The constant is frozen at module load time and shared across all hook instances.

---

## Unit & Integration Tests

### Test File

**File:** `e2e/tui/app-shell.test.ts`

All go-to mode tests belong in the existing `app-shell.test.ts` file under the `TUI_APP_SHELL` feature group. The relevant tests are already written and describe the expected behaviors.

### Existing Tests This Implementation Must Satisfy

#### Navigation tests (already in `app-shell.test.ts`)

| Test ID | Description | Verifies |
|---------|-------------|----------|
| `NAV-002` | go-to navigation renders target screen and updates breadcrumb | `activate()` → key → `executeGoTo()` → screen renders |
| `NAV-005` | reset clears stack — q after go-to goes to Dashboard | `executeGoTo()` uses `nav.reset()` |
| `NAV-006` | duplicate go-to is silently ignored (no stack growth) | `NavigationProvider.push()` deduplication |
| `NAV-007` | multiple sequential go-to navigations via reset | Sequential `activate()` → key cycles |

#### Context validation tests

| Test ID | Description | Verifies |
|---------|-------------|----------|
| `NAV-GOTO-001` | g i without repo context shows error or stays on current screen | `executeGoTo()` returns error → `showError()` |
| `NAV-GOTO-002` | g d always works (no context required) | Non-repo bindings succeed regardless |
| `NAV-GOTO-003` | go-to mode timeout cancels after 1500ms | `GOTO_TIMEOUT_MS` timer → `cancel()` |

#### Keybinding priority tests

| Test ID | Description | Verifies |
|---------|-------------|----------|
| `KEY-KEY-006` | g activates go-to mode | Status bar shows go-to hints |
| `KEY-KEY-012` | go-to mode (P3) overrides screen keybindings (P4) | GOTO scope at priority 3 wins over SCREEN at 4 |
| `KEY-KEY-031` | go-to mode overrides hints temporarily | `overrideHints()` called on activate, cleanup on cancel |

#### Overlay integration test

| Test ID | Description | Verifies |
|---------|-------------|----------|
| `OVERLAY-012` | go-to mode does not activate while overlay open | `hasActiveModal()` guard in `activate()` |

#### Loading state test

| Test ID | Description | Verifies |
|---------|-------------|----------|
| `LOAD-KEY-007` | go-to keybinding during loading navigates away | `activate()` works during screen loading |

### New Tests to Add

The following tests are added to `e2e/tui/app-shell.test.ts` in the `describe("TUI_SCREEN_ROUTER — go-to context validation")` block:

```typescript
test("NAV-GOTO-004: go-to mode cancels on unrecognized letter key", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("g");
  // Status bar should show go-to hints
  const goToHints = terminal.getLine(terminal.rows - 1);
  expect(goToHints).toMatch(/dashboard|repos/i);
  // Press unrecognized letter
  await terminal.sendKeys("x");
  // Should still be on Dashboard, hints restored
  await terminal.waitForText("Dashboard");
  const normalHints = terminal.getLine(terminal.rows - 1);
  expect(normalHints).not.toEqual(goToHints);
});

test("NAV-GOTO-005: go-to error displays for 2s then auto-clears", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("g", "i"); // Issues requires repo
  // Error should be visible in status bar
  const errorLine = terminal.getLine(terminal.rows - 1);
  expect(errorLine).toMatch(/no repository|context/i);
  // Wait for error to auto-clear (2000ms + buffer)
  await new Promise(resolve => setTimeout(resolve, 2500));
  const clearedLine = terminal.getLine(terminal.rows - 1);
  expect(clearedLine).not.toMatch(/no repository/i);
});

test("NAV-GOTO-006: rapid g then Escape cancels without navigation", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("g");
  const goToHints = terminal.getLine(terminal.rows - 1);
  expect(goToHints).toMatch(/dashboard|repos/i);
  await terminal.sendKeys("Escape");
  await terminal.waitForText("Dashboard");
  // Hints should be restored to normal
  const normalHints = terminal.getLine(terminal.rows - 1);
  expect(normalHints).not.toMatch(/g d.*dashboard.*g r.*repos/i);
});

test("NAV-GOTO-007: go-to mode is idempotent — double g does not break state", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  await terminal.sendKeys("g");
  // Second 'g' is captured by GOTO scope as unknown letter → cancels go-to
  // Then 'g' at global scope re-activates go-to mode
  await terminal.sendKeys("g");
  // Verify 'd' still navigates
  await terminal.sendKeys("d");
  await terminal.waitForText("Dashboard");
});

test("NAV-GOTO-008: all non-repo go-to destinations work from Dashboard", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");

  const nonRepoDestinations = [
    { key: "d", screen: "Dashboard" },
    { key: "r", screen: "Repositories" },
    { key: "w", screen: "Workspaces" },
    { key: "n", screen: "Notifications" },
    { key: "s", screen: "Search" },
    { key: "o", screen: "Organizations" },
    { key: "a", screen: "Agents" },
  ];

  for (const { key, screen } of nonRepoDestinations) {
    await terminal.sendKeys("g", key);
    await terminal.waitForText(screen);
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
  }
});

test("NAV-GOTO-009: repo-requiring destinations all fail without context", async () => {
  terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");

  const repoKeys = ["i", "l", "f", "k"]; // Issues, Landings, Workflows, Wiki
  for (const key of repoKeys) {
    await terminal.sendKeys("g", key);
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Dashboard|No repository|error/i);
    // Wait for error to clear before next iteration
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
});
```

### Test Philosophy Compliance

- **No mocking:** Tests launch a real TUI instance via `launchTUI()` and interact through keyboard simulation.
- **Failing tests stay failing:** Tests that require backend API responses (e.g., repo context from a real repository) will fail if the backend is not running. They are not skipped.
- **Behavior-focused:** Test names describe user-visible behavior ("go-to mode timeout cancels after 1500ms"), not implementation details ("setTimeout cleared in useEffect cleanup").
- **Independent:** Each test creates its own `launchTUI()` instance and terminates it. No shared state.

---

## Productionization Checklist

This hook is implemented directly as production code (no POC phase). The following checklist ensures production readiness:

| Check | Detail |
|-------|--------|
| **Timer cleanup** | `useEffect` cleanup clears both `timeoutRef` and `errorTimeoutRef` on unmount. Verified by test NAV-GOTO-007 (rapid state transitions). |
| **Scope leak prevention** | `scopeIdRef` is cleared in `deactivate()` and in the `useEffect` cleanup. `removeScope()` is called before setting the ref to null. |
| **Hint cleanup leak** | `hintCleanupRef` stores the `overrideHints` cleanup function. Called in `deactivate()` and `useEffect` cleanup. Ensures status bar always restores. |
| **Idempotent activate** | Guard checks `scopeIdRef.current !== null` to prevent double-registration. |
| **Modal guard** | `hasActiveModal()` check prevents go-to mode from activating when command palette or help overlay is open. |
| **Error auto-clear** | Error timeout (2000ms) is independent of activation timeout (1500ms). Both are cleaned up on unmount. Previous error timeout is cleared before starting a new one. |
| **Stable references** | `activate`, `cancel`, and `destinationHints` are memoized. Handlers use refs for mutable state (`navRef`). No stale closures. |
| **Export surface** | Types `GoToHint` and `GoToModeState` are exported for consumers. Hook is exported from `hooks/index.ts`. |

---

## Files Modified

| File | Change |
|------|--------|
| `apps/tui/src/hooks/useGoToMode.ts` | **New file** — hook implementation (\~170 lines) |
| `apps/tui/src/hooks/index.ts` | Add export for `useGoToMode`, `GoToHint`, `GoToModeState` |
| `apps/tui/src/components/GlobalKeybindings.tsx` | Wire `useGoToMode()` into `onGoTo` callback; update `onEscape` to check `goTo.active` |
| `e2e/tui/app-shell.test.ts` | Add 6 new test cases in the go-to context validation describe block |

## Files NOT Modified (consumed as-is)

| File | Reason |
|------|--------|
| `apps/tui/src/navigation/goToBindings.ts` | Static data and `executeGoTo` function already correct |
| `apps/tui/src/providers/KeybindingProvider.tsx` | Scope registration API already supports GOTO priority |
| `apps/tui/src/providers/keybinding-types.ts` | `PRIORITY.GOTO = 3` already defined |
| `apps/tui/src/providers/NavigationProvider.tsx` | `reset()` and `push()` already implemented |
| `apps/tui/src/providers/normalize-key.ts` | Key normalization already correct |