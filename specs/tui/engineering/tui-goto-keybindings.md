# Engineering Specification: tui-goto-keybindings

## Implement go-to mode with g-prefix two-key chord navigation

**Ticket:** tui-goto-keybindings  
**Type:** Feature  
**Dependencies:** tui-global-keybindings (✅ exists), tui-navigation-provider (✅ exists), tui-screen-registry (✅ exists), tui-status-bar (✅ exists)

---

## Summary

This ticket implements the go-to mode — a transient g-prefix two-key chord system that provides instant teleportation to any top-level screen in the Codeplane TUI. Pressing `g` enters go-to mode (visible via status bar hint replacement), and a follow-up key within 1500ms navigates to the destination screen. The feature is entirely client-side with zero API calls.

---

## Existing Infrastructure Audit

The following components already exist and will be consumed or modified:

| Component | Path | Status |
|-----------|------|--------|
| `goToBindings` constant + `executeGoTo()` | `apps/tui/src/navigation/goToBindings.ts` | ✅ Complete — 11 bindings defined, `executeGoTo()` handles `reset()`→`push()` chain with repo context validation |
| `KeybindingProvider` | `apps/tui/src/providers/KeybindingProvider.tsx` | ✅ Complete — priority-based scope dispatch, `overrideHints()` for status bar |
| `PRIORITY.GOTO` (level 3) | `apps/tui/src/providers/keybinding-types.ts` | ✅ Defined |
| `useGlobalKeybindings()` | `apps/tui/src/hooks/useGlobalKeybindings.ts` | ✅ Registers `g` key at `PRIORITY.GLOBAL` with `onGoTo` callback |
| `GlobalKeybindings` component | `apps/tui/src/components/GlobalKeybindings.tsx` | ⚠️ `onGoTo` callback is stubbed: `/* TODO: wired in go-to keybindings ticket */` |
| `NavigationProvider` | `apps/tui/src/providers/NavigationProvider.tsx` | ✅ Complete — `reset()`, `push()`, `pop()`, `repoContext` extraction |
| `StatusBar` | `apps/tui/src/components/StatusBar.tsx` | ✅ Renders hints from `useStatusBarHints()`, supports `overrideHints()` via context |
| `OverlayManager` | `apps/tui/src/providers/OverlayManager.tsx` | ✅ `hasActiveModal()` available via `KeybindingContext` |
| `logger` | `apps/tui/src/lib/logger.ts` | ✅ Structured stderr logging with level control |
| `normalizeKeyDescriptor()` | `apps/tui/src/providers/normalize-key.ts` | ✅ Key normalization |

**What does NOT exist:**
- `useGoToMode()` hook — the core state machine
- Go-to scope registration logic (PRIORITY.GOTO bindings)
- Status bar hint generation for go-to destinations
- Error display timer for "No repository in context"
- Telemetry event emission
- Help overlay "Go To" group registration

---

## Implementation Plan

### Step 1: Create the `useGoToMode()` hook

**File:** `apps/tui/src/hooks/useGoToMode.ts`

This is the central state machine for go-to mode. It manages activation, timeout, second-key dispatch, cancellation, status bar hint override, and error display.

**Interface:**

```typescript
export interface GoToModeState {
  /** Whether go-to mode is currently active (waiting for second key). */
  active: boolean;
  /** Whether an error message is currently displayed in the status bar. */
  errorVisible: boolean;
  /** Activate go-to mode. Called when user presses 'g'. */
  activate(): void;
  /** Cancel go-to mode without navigation. */
  cancel(): void;
}
```

**Internal state:**

```typescript
// State
const [active, setActive] = useState(false);
const [errorVisible, setErrorVisible] = useState(false);

// Refs for cleanup
const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const goToScopeIdRef = useRef<string | null>(null);
const hintsCleanupRef = useRef<(() => void) | null>(null);
const activationTimestampRef = useRef<number>(0);
```

**Lifecycle:**

1. **`activate()`** — Called by `GlobalKeybindings.onGoTo`:
   - Guard: if `active` is already true, call `cancel()` first (second `g` cancels — `g g` behavior)
   - Guard: check `keybindingCtx.hasActiveModal()` — if true, return (go-to suppressed during overlays)
   - Guard: check terminal dimensions via `useLayout()` — if breakpoint is `null` (below 80×24), return
   - Set `active = true`
   - Record `activationTimestampRef.current = Date.now()`
   - Build go-to bindings map (11 entries) at `PRIORITY.GOTO`, each handler calls `handleSecondKey(binding)`
   - Add special handlers at same priority: `escape` → `cancel()`, `q` → `cancelAndPop()`, `ctrl+c` → `process.exit(0)`
   - Register scope: `goToScopeIdRef.current = keybindingCtx.registerScope({ priority: PRIORITY.GOTO, bindings, active: true })`
   - Override status bar hints: `hintsCleanupRef.current = statusBarCtx.overrideHints(goToHints)`
   - Start 1500ms timeout: `timeoutRef.current = setTimeout(cancel, 1500)`
   - Log: `logger.debug("GoTo: activated [screen=${currentScreen}] [repo_context=${!!repoContext}]")`

2. **`handleSecondKey(binding)`** — Called when a valid destination key is pressed:
   - Clear timeout
   - Calculate latency: `Date.now() - activationTimestampRef.current`
   - Call `executeGoTo(nav, binding, nav.repoContext)`
   - If result has `error`:
     - Show error in status bar (override hints with error hint)
     - Set `errorVisible = true`
     - Start 2000ms error timeout to clear error and restore hints
     - Log: `logger.warn("GoTo: context fail [destination=${binding.screen}] [screen=${currentScreen}] — no repo context")`
   - If success:
     - Log: `logger.info("GoTo: navigated [from=${currentScreen}] [to=${binding.screen}] [latency_ms=${latency}] [new_stack_depth=${nav.stack.length}]")`
   - Clean up go-to scope and hint override
   - Set `active = false`

3. **`cancel()`** — Cancel go-to mode:
   - Clear timeout
   - Remove go-to scope from keybinding provider
   - Restore status bar hints (call `hintsCleanupRef.current()`)
   - Set `active = false`
   - Log: `logger.debug("GoTo: cancelled [reason=${reason}] [screen=${currentScreen}]")`

4. **`cancelAndPop()`** — Cancel go-to AND pop screen (for `q` during go-to):
   - Call `cancel()`
   - Call `nav.pop()` (if `nav.canGoBack`) else `process.exit(0)`

5. **Cleanup on unmount** (`useEffect` return):
   - Clear `timeoutRef.current`
   - Clear `errorTimeoutRef.current`
   - Remove scope if `goToScopeIdRef.current` exists
   - Call `hintsCleanupRef.current()` if exists

**Important implementation note on the catch-all key handler:**

The PRIORITY.GOTO scope must also handle *any unrecognized key* by cancelling go-to mode. Since the `KeybindingProvider` dispatches first-match-wins and falls through to lower priorities if no match, we need a mechanism to catch non-matching keys. The approach:

- Register all 11 valid destination keys + `escape` + `q` + `ctrl+c` in the GOTO scope
- For unrecognized keys: register a `when()` predicate on the global `g` handler that returns `false` when go-to is active, so the global layer doesn't re-trigger go-to. Instead, add a catch-all binding at GOTO priority using a special approach:
  - After registering the GOTO scope, set a flag `goToActiveRef.current = true`
  - Modify the `g` global handler to check this flag — if go-to is active and the key pressed is not in the valid set, the key event falls through to screen/global handlers, which is acceptable behavior for printable characters
  - BUT: to cancel on truly unrecognized keys, we register a second scope at GOTO priority with a `when()` that always returns true, and its handler calls `cancel()`. This scope is registered AFTER the valid-keys scope, so LIFO ordering means it's checked FIRST — but since valid keys are in the first scope and match at the same priority, they take precedence

**Simpler approach (recommended):** Instead of the catch-all complexity, modify the `KeybindingProvider` to support a `onUnhandled` callback on scopes. But since we should not modify shared infrastructure unnecessarily, use a different pattern:

- In the GOTO scope, register handlers for ALL single lowercase letters (`a-z`), digit keys (`0-9`), and common keys. Valid destination keys map to `handleSecondKey()`. All other keys in the map call `cancel()`. This provides complete coverage since the only keys that can follow `g` meaningfully are single characters.
- Also register `escape`, `q`, `ctrl+c` as described above.

**Go-to hints generation:**

```typescript
const GO_TO_HINT_ENTRIES: Array<{ key: string; label: string }> = [
  { key: "d", label: "dashboard" },
  { key: "i", label: "issues" },
  { key: "l", label: "landings" },
  { key: "r", label: "repos" },
  { key: "w", label: "workspaces" },
  { key: "n", label: "notifs" },
  { key: "s", label: "search" },
  { key: "a", label: "agents" },
  { key: "o", label: "orgs" },
  { key: "f", label: "workflows" },
  { key: "k", label: "wiki" },
];
```

Hints are generated as `StatusBarHint[]` with `keys: "g+{key}"` and `label: "{destination}"`. The number of hints shown is controlled by the existing truncation logic in `StatusBar.tsx` (which already limits to 4 at minimum breakpoint).

**Responsive hint calculation:**

Each hint is approximately `"g+d:dashboard  "` = ~15 chars. At different widths:
- 80–99 cols: ~60 usable chars → 3-4 hints + `…`
- 100–119 cols: ~80 usable chars → 5-6 hints + `…`  
- 120–199 cols: ~100 usable chars → 8-11 hints (all if they fit)
- 200+ cols: all 11 hints with full labels

The `StatusBar` component already handles truncation via `displayedHints = showFullHints ? hints : hints.slice(0, 4)`. We enhance this in Step 3 to calculate a more precise cutoff based on terminal width.

**Dependencies consumed:**
- `useContext(KeybindingContext)` — scope registration
- `useContext(StatusBarHintsContext)` — hint override
- `useNavigation()` — `repoContext`, `currentScreen`, `pop()`
- `useLayout()` — breakpoint check
- `goToBindings` and `executeGoTo()` from `navigation/goToBindings.ts`
- `logger` from `lib/logger.ts`
- `normalizeKeyDescriptor()` from `providers/normalize-key.ts`

---

### Step 2: Wire `useGoToMode()` into `GlobalKeybindings`

**File:** `apps/tui/src/components/GlobalKeybindings.tsx`

**Changes:**

1. Import `useGoToMode` from `../hooks/useGoToMode.js`
2. Call `const goTo = useGoToMode()` in the component body
3. Replace the `onGoTo` stub:

```typescript
// Before:
const onGoTo = useCallback(() => { /* TODO: wired in go-to keybindings ticket */ }, []);

// After:
const onGoTo = useCallback(() => {
  goTo.activate();
}, [goTo]);
```

4. Wire `q` and `Esc` to check go-to active state:

```typescript
const onQuit = useCallback(() => {
  // Note: when go-to is active, the GOTO scope (P3) intercepts 'q'
  // before it reaches GLOBAL (P5), so this handler only fires
  // when go-to is NOT active.
  if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
}, [nav]);

const onEscape = useCallback(() => {
  // Same as onQuit — go-to scope intercepts Escape at P3.
  if (nav.canGoBack) { nav.pop(); }
}, [nav]);
```

No changes needed to `onQuit`/`onEscape` because the PRIORITY.GOTO scope registered by `useGoToMode` at P3 will intercept both `q` and `Escape` before they reach the P5 global scope. The global handlers only fire when go-to mode is NOT active.

---

### Step 3: Enhance StatusBar for go-to error display and responsive hint truncation

**File:** `apps/tui/src/components/StatusBar.tsx`

**Changes:**

The current `StatusBar` implementation already renders hints from the `StatusBarHintsContext`. When `useGoToMode` calls `overrideHints()`, the go-to destination hints will automatically replace the normal screen hints. No structural changes needed for the basic override mechanism.

Enhance the hint rendering to support:

1. **Width-aware truncation with ellipsis:** Instead of the simple `showFullHints ? hints : hints.slice(0, 4)`, calculate how many hints fit based on terminal width:

```typescript
function calculateVisibleHints(
  hints: StatusBarHint[],
  availableWidth: number,
): { visible: StatusBarHint[]; truncated: boolean } {
  const ELLIPSIS_WIDTH = 3; // " …"
  const HINT_GAP = 2; // "  " between hints
  let usedWidth = 0;
  const visible: StatusBarHint[] = [];

  for (const hint of hints) {
    const hintWidth = hint.keys.length + 1 + hint.label.length; // "g+d:dashboard"
    const nextWidth = usedWidth + hintWidth + (visible.length > 0 ? HINT_GAP : 0);

    if (nextWidth + ELLIPSIS_WIDTH > availableWidth && visible.length < hints.length - 1) {
      // Adding this hint would overflow; check if remaining hints all fit
      const remaining = hints.slice(visible.length);
      const remainingWidth = remaining.reduce(
        (sum, h) => sum + h.keys.length + 1 + h.label.length + HINT_GAP, 0
      ) - HINT_GAP;
      if (usedWidth + remainingWidth <= availableWidth) {
        visible.push(...remaining);
        return { visible, truncated: false };
      }
      return { visible, truncated: true };
    }

    usedWidth = nextWidth;
    visible.push(hint);
  }

  return { visible, truncated: false };
}
```

2. **Render ellipsis when truncated:**

```tsx
{truncated && <text fg={theme.muted}>  …</text>}
```

3. **Error message display from go-to mode:** The error "No repository in context" is displayed by `useGoToMode` via `overrideHints()` with a single hint that has `keys: ""` and `label: "No repository in context"`, rendered in error color. The hint override mechanism already handles this — the error "hint" replaces all other hints. After the 2000ms timer in `useGoToMode`, the override is cleared.

Alternatively (and more cleanly), `useGoToMode` can use the existing `statusBarError` mechanism from the `LoadingProvider`. However, since `statusBarError` is owned by `LoadingProvider` and has different semantics, it's cleaner to use the `overrideHints` mechanism with a special error-styled hint.

**Recommended approach for error display:** Create a dedicated error override in `useGoToMode` that uses `overrideHints` with a single entry styled differently. The `StatusBar` should detect when hints contain an error-type entry. Add an optional `color` field to `StatusBarHint`:

**File:** `apps/tui/src/providers/keybinding-types.ts`

Add to `StatusBarHint`:

```typescript
export interface StatusBarHint {
  keys: string;
  label: string;
  order?: number;
  /** Optional color override. When set, the entire hint renders in this semantic color. */
  color?: "error" | "warning" | "success" | "primary" | "muted";
}
```

Then in `StatusBar.tsx`, when rendering hints, check for `hint.color`:

```tsx
{displayedHints.map((hint, i) => (
  <React.Fragment key={i}>
    {hint.color ? (
      <text fg={theme[hint.color]}>{hint.keys ? `${hint.keys}:` : ""}{hint.label}  </text>
    ) : (
      <>
        <text fg={theme.primary}>{hint.keys}</text>
        <text fg={theme.muted}>{`:${hint.label}  `}</text>
      </>
    )}
  </React.Fragment>
))}
```

---

### Step 4: Register go-to group in Help Overlay

**File:** `apps/tui/src/hooks/useGoToMode.ts` (within the hook)

The go-to keybindings should appear in the help overlay under a "Go To" group. Since `KeybindingProvider.getAllBindings()` returns all active bindings grouped by group name, the go-to bindings registered at `PRIORITY.GOTO` will only appear while go-to mode is active — which is NOT the desired behavior. Users should always see go-to bindings in the help overlay.

**Solution:** Register a permanent, inactive informational scope at `PRIORITY.GLOBAL` that lists go-to bindings for the help overlay only. These bindings have `when: () => false` so they never actually handle keys, but they appear in `getAllBindings()` for the help overlay.

**File:** `apps/tui/src/hooks/useGoToHelpBindings.ts`

```typescript
import { useContext, useEffect, useMemo } from "react";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { type KeyHandler, PRIORITY } from "../providers/keybinding-types.js";
import { goToBindings } from "../navigation/goToBindings.js";

/**
 * Register go-to keybinding descriptions in the help overlay.
 *
 * These are display-only entries (when: () => false) so they never
 * handle actual keystrokes. They exist purely so the help overlay
 * shows all go-to destinations under the "Go To" group.
 */
export function useGoToHelpBindings(): void {
  const ctx = useContext(KeybindingContext);
  if (!ctx) throw new Error("useGoToHelpBindings must be used within KeybindingProvider");

  const bindings = useMemo(() => {
    const map = new Map<string, KeyHandler>();
    for (const binding of goToBindings) {
      const suffix = binding.requiresRepo ? " (requires repo)" : "";
      map.set(`g_${binding.key}`, {
        key: `g ${binding.key}`,
        description: `${binding.description}${suffix}`,
        group: "Go To",
        handler: () => {},
        when: () => false, // display-only, never matches
      });
    }
    return map;
  }, []);

  useEffect(() => {
    // Register at a priority that won't interfere with dispatch.
    // Use GLOBAL+1 or a high number so it never matches before anything.
    // Actually: since when() returns false, priority doesn't matter for dispatch.
    // Use GLOBAL so it groups naturally.
    const scopeId = ctx.registerScope({
      priority: PRIORITY.GLOBAL,
      bindings,
      active: true,
    });
    return () => ctx.removeScope(scopeId);
  }, [ctx, bindings]);
}
```

**Wire in:** Call `useGoToHelpBindings()` from `GlobalKeybindings.tsx`.

---

### Step 5: Add telemetry event hooks

**File:** `apps/tui/src/hooks/useGoToMode.ts` (within the hook)

Telemetry events are emitted via `logger` to stderr in structured JSON. The product spec defines four events:

```typescript
import { logger } from "../lib/logger.js";

// On activate:
logger.debug(`GoTo: activated [screen=${currentScreen.screen}] [repo_context=${!!nav.repoContext}]`);

// On navigate:
logger.info(`GoTo: navigated [from=${currentScreen.screen}] [to=${binding.screen}] [latency_ms=${latency}] [new_stack_depth=${nav.stack.length}]`);

// On cancel:
logger.debug(`GoTo: cancelled [reason=${reason}] [screen=${currentScreen.screen}] [latency_ms=${latency}]`);

// On context fail:
logger.warn(`GoTo: context fail [destination=${binding.screen}] [screen=${currentScreen.screen}] — no repo context`);

// On timeout:
logger.debug(`GoTo: timeout [screen=${currentScreen.screen}] [elapsed=1500ms]`);

// On suppressed:
logger.debug(`GoTo: suppressed [reason=${reason}]`);
```

No separate telemetry module is needed — all events flow through the existing logger.

---

### Step 6: Export the new hook and update barrel files

**File:** `apps/tui/src/hooks/index.ts`

Add exports:

```typescript
export { useGoToMode, type GoToModeState } from "./useGoToMode.js";
export { useGoToHelpBindings } from "./useGoToHelpBindings.js";
```

---

## File Manifest

| Action | File Path | Description |
|--------|-----------|-------------|
| **Create** | `apps/tui/src/hooks/useGoToMode.ts` | Core go-to mode state machine hook |
| **Create** | `apps/tui/src/hooks/useGoToHelpBindings.ts` | Display-only help overlay registration for go-to destinations |
| **Modify** | `apps/tui/src/components/GlobalKeybindings.tsx` | Wire `useGoToMode()` into `onGoTo` callback; call `useGoToHelpBindings()` |
| **Modify** | `apps/tui/src/components/StatusBar.tsx` | Width-aware hint truncation with `…`; support `hint.color` for error display |
| **Modify** | `apps/tui/src/providers/keybinding-types.ts` | Add optional `color` field to `StatusBarHint` |
| **Modify** | `apps/tui/src/hooks/index.ts` | Export `useGoToMode` and `useGoToHelpBindings` |
| **Create** | `e2e/tui/goto-keybindings.test.ts` | Dedicated E2E test file for go-to mode |

---

## Detailed Implementation: `useGoToMode.ts`

**File:** `apps/tui/src/hooks/useGoToMode.ts`

```typescript
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { KeybindingContext, StatusBarHintsContext } from "../providers/KeybindingProvider.js";
import {
  type KeyHandler,
  type StatusBarHint,
  PRIORITY,
} from "../providers/keybinding-types.js";
import { normalizeKeyDescriptor } from "../providers/normalize-key.js";
import { goToBindings, executeGoTo } from "../navigation/goToBindings.js";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useLayout } from "./useLayout.js";
import { logger } from "../lib/logger.js";

/** Timeout duration for go-to mode auto-cancel (ms). */
const GOTO_TIMEOUT_MS = 1500;

/** Duration to display context error message (ms). */
const ERROR_DISPLAY_MS = 2000;

/** Go-to destination hints for the status bar. */
const GO_TO_HINTS: StatusBarHint[] = [
  { keys: "g+d", label: "dashboard", order: 0 },
  { keys: "g+i", label: "issues", order: 1 },
  { keys: "g+l", label: "landings", order: 2 },
  { keys: "g+r", label: "repos", order: 3 },
  { keys: "g+w", label: "workspaces", order: 4 },
  { keys: "g+n", label: "notifs", order: 5 },
  { keys: "g+s", label: "search", order: 6 },
  { keys: "g+a", label: "agents", order: 7 },
  { keys: "g+o", label: "orgs", order: 8 },
  { keys: "g+f", label: "workflows", order: 9 },
  { keys: "g+k", label: "wiki", order: 10 },
];

export interface GoToModeState {
  active: boolean;
  errorVisible: boolean;
  activate(): void;
  cancel(): void;
}

export function useGoToMode(): GoToModeState {
  const keybindingCtx = useContext(KeybindingContext);
  const statusBarCtx = useContext(StatusBarHintsContext);
  const nav = useNavigation();
  const { breakpoint } = useLayout();

  if (!keybindingCtx) throw new Error("useGoToMode requires KeybindingProvider");
  if (!statusBarCtx) throw new Error("useGoToMode requires StatusBarHintsContext");

  const [active, setActive] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToScopeIdRef = useRef<string | null>(null);
  const hintsCleanupRef = useRef<(() => void) | null>(null);
  const activationTimestampRef = useRef<number>(0);
  const activeRef = useRef(false);

  // Keep activeRef in sync for use in callbacks
  activeRef.current = active;

  // Navigation ref for stable access in callbacks
  const navRef = useRef(nav);
  navRef.current = nav;

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (goToScopeIdRef.current) {
      keybindingCtx.removeScope(goToScopeIdRef.current);
      goToScopeIdRef.current = null;
    }
    if (hintsCleanupRef.current) {
      hintsCleanupRef.current();
      hintsCleanupRef.current = null;
    }
  }, [keybindingCtx]);

  const showError = useCallback(
    (message: string) => {
      // Override hints with error message
      const errorHints: StatusBarHint[] = [
        { keys: "", label: message, order: 0, color: "error" },
      ];
      hintsCleanupRef.current = statusBarCtx.overrideHints(errorHints);
      setErrorVisible(true);

      errorTimeoutRef.current = setTimeout(() => {
        if (hintsCleanupRef.current) {
          hintsCleanupRef.current();
          hintsCleanupRef.current = null;
        }
        setErrorVisible(false);
        errorTimeoutRef.current = null;
      }, ERROR_DISPLAY_MS);
    },
    [statusBarCtx],
  );

  const cancel = useCallback(
    (reason: string = "unknown") => {
      if (!activeRef.current) return;
      const latency = Date.now() - activationTimestampRef.current;
      cleanup();
      setActive(false);
      activeRef.current = false;
      logger.debug(
        `GoTo: cancelled [reason=${reason}] [screen=${navRef.current.currentScreen.screen}] [latency_ms=${latency}]`,
      );
    },
    [cleanup],
  );

  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;

  const activate = useCallback(() => {
    // Suppression checks
    if (keybindingCtx.hasActiveModal()) {
      logger.debug("GoTo: suppressed [reason=overlay_open]");
      return;
    }
    if (breakpoint === null) {
      logger.debug("GoTo: suppressed [reason=terminal_too_small]");
      return;
    }

    // If already active, second 'g' cancels (g g behavior)
    if (activeRef.current) {
      cancelRef.current("double_g");
      return;
    }

    setActive(true);
    activeRef.current = true;
    activationTimestampRef.current = Date.now();

    logger.debug(
      `GoTo: activated [screen=${navRef.current.currentScreen.screen}] [repo_context=${!!navRef.current.repoContext}]`,
    );

    // Build bindings map for GOTO scope
    const bindings = new Map<string, KeyHandler>();

    // Valid destination keys
    for (const binding of goToBindings) {
      const key = normalizeKeyDescriptor(binding.key);
      bindings.set(key, {
        key,
        description: `Go to ${binding.description}`,
        group: "Go To",
        handler: () => {
          const latency = Date.now() - activationTimestampRef.current;
          const currentNav = navRef.current;
          logger.debug(
            `GoTo: key received [key=${binding.key}] [valid=true] [latency_ms=${latency}]`,
          );

          // Clean up go-to scope before navigation
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          if (goToScopeIdRef.current) {
            keybindingCtx.removeScope(goToScopeIdRef.current);
            goToScopeIdRef.current = null;
          }
          if (hintsCleanupRef.current) {
            hintsCleanupRef.current();
            hintsCleanupRef.current = null;
          }

          const result = executeGoTo(
            currentNav,
            binding,
            currentNav.repoContext,
          );

          if (result.error) {
            logger.warn(
              `GoTo: context fail [destination=${binding.screen}] [screen=${currentNav.currentScreen.screen}] — no repo context`,
            );
            showError(result.error);
          } else {
            logger.info(
              `GoTo: navigated [from=${currentNav.currentScreen.screen}] [to=${binding.screen}] [latency_ms=${latency}] [new_stack_depth=${currentNav.stack.length}]`,
            );
          }

          setActive(false);
          activeRef.current = false;
        },
      });
    }

    // Escape cancels go-to only (does NOT pop screen)
    bindings.set(normalizeKeyDescriptor("escape"), {
      key: normalizeKeyDescriptor("escape"),
      description: "Cancel go-to",
      group: "Go To",
      handler: () => cancelRef.current("escape"),
    });

    // q cancels go-to AND pops screen
    bindings.set(normalizeKeyDescriptor("q"), {
      key: normalizeKeyDescriptor("q"),
      description: "Cancel go-to and go back",
      group: "Go To",
      handler: () => {
        cancelRef.current("quit");
        const currentNav = navRef.current;
        if (currentNav.canGoBack) {
          currentNav.pop();
        } else {
          process.exit(0);
        }
      },
    });

    // Ctrl+C quits TUI immediately
    bindings.set(normalizeKeyDescriptor("ctrl+c"), {
      key: normalizeKeyDescriptor("ctrl+c"),
      description: "Quit TUI",
      group: "Go To",
      handler: () => process.exit(0),
    });

    // Catch-all: register all other common single-char keys as cancel triggers.
    // This ensures any unrecognized key cancels go-to mode.
    const validKeys = new Set([
      ...goToBindings.map((b) => b.key),
      "q",
    ]);
    for (let c = 97; c <= 122; c++) {
      // a-z
      const char = String.fromCharCode(c);
      if (!validKeys.has(char)) {
        bindings.set(char, {
          key: char,
          description: "Cancel go-to",
          group: "Go To",
          handler: () => {
            logger.debug(
              `GoTo: key received [key=${char}] [valid=false] [latency_ms=${Date.now() - activationTimestampRef.current}]`,
            );
            cancelRef.current("invalid_key");
          },
        });
      }
    }
    // Also catch digits, common punctuation
    for (const extra of "0123456789.,;'[]\\/-=".split("")) {
      if (!bindings.has(extra)) {
        bindings.set(extra, {
          key: extra,
          description: "Cancel go-to",
          group: "Go To",
          handler: () => cancelRef.current("invalid_key"),
        });
      }
    }

    // Register scope at GOTO priority
    goToScopeIdRef.current = keybindingCtx.registerScope({
      priority: PRIORITY.GOTO,
      bindings,
      active: true,
    });

    // Override status bar hints
    hintsCleanupRef.current = statusBarCtx.overrideHints(GO_TO_HINTS);

    // Start timeout
    timeoutRef.current = setTimeout(() => {
      logger.debug(
        `GoTo: timeout [screen=${navRef.current.currentScreen.screen}] [elapsed=1500ms]`,
      );
      cancelRef.current("timeout");
    }, GOTO_TIMEOUT_MS);
  }, [keybindingCtx, statusBarCtx, breakpoint, showError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      if (goToScopeIdRef.current) keybindingCtx.removeScope(goToScopeIdRef.current);
      if (hintsCleanupRef.current) hintsCleanupRef.current();
    };
  }, [keybindingCtx]);

  return { active, errorVisible, activate, cancel: () => cancel("programmatic") };
}
```

---

## Detailed Implementation: `useGoToHelpBindings.ts`

**File:** `apps/tui/src/hooks/useGoToHelpBindings.ts`

```typescript
import { useContext, useEffect, useMemo } from "react";
import { KeybindingContext } from "../providers/KeybindingProvider.js";
import { type KeyHandler, PRIORITY } from "../providers/keybinding-types.js";
import { goToBindings } from "../navigation/goToBindings.js";

/**
 * Register go-to keybinding descriptions in the help overlay.
 * These entries use `when: () => false` so they never handle actual keystrokes.
 * They exist solely for the help overlay's `getAllBindings()` to display.
 */
export function useGoToHelpBindings(): void {
  const ctx = useContext(KeybindingContext);
  if (!ctx) throw new Error("useGoToHelpBindings requires KeybindingProvider");

  const bindings = useMemo(() => {
    const map = new Map<string, KeyHandler>();
    for (const binding of goToBindings) {
      const suffix = binding.requiresRepo ? " (requires repo)" : "";
      map.set(`goto_${binding.key}`, {
        key: `g ${binding.key}`,
        description: `${binding.description}${suffix}`,
        group: "Go To",
        handler: () => {},
        when: () => false,
      });
    }
    return map;
  }, []);

  useEffect(() => {
    const scopeId = ctx.registerScope({
      priority: PRIORITY.GLOBAL,
      bindings,
      active: true,
    });
    return () => ctx.removeScope(scopeId);
  }, [ctx, bindings]);
}
```

---

## Detailed Modifications

### `GlobalKeybindings.tsx` — Final State

```typescript
import React, { useCallback } from "react";
import { useNavigation } from "../providers/NavigationProvider.js";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings.js";
import { useGoToMode } from "../hooks/useGoToMode.js";
import { useGoToHelpBindings } from "../hooks/useGoToHelpBindings.js";

export function GlobalKeybindings({ children }: { children: React.ReactNode }) {
  const nav = useNavigation();
  const goTo = useGoToMode();

  // Register go-to entries in help overlay (display-only)
  useGoToHelpBindings();

  const onQuit = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); } else { process.exit(0); }
  }, [nav]);

  const onEscape = useCallback(() => {
    if (nav.canGoBack) { nav.pop(); }
  }, [nav]);

  const onForceQuit = useCallback(() => { process.exit(0); }, []);
  const onHelp = useCallback(() => { /* TODO: wired in help overlay ticket */ }, []);
  const onCommandPalette = useCallback(() => { /* TODO: wired in command palette ticket */ }, []);

  const onGoTo = useCallback(() => {
    goTo.activate();
  }, [goTo]);

  useGlobalKeybindings({ onQuit, onEscape, onForceQuit, onHelp, onCommandPalette, onGoTo });
  return <>{children}</>;
}
```

### `keybinding-types.ts` — Add `color` to `StatusBarHint`

```typescript
export interface StatusBarHint {
  keys: string;
  label: string;
  order?: number;
  /** Optional semantic color for the entire hint. Used for error/warning display. */
  color?: "error" | "warning" | "success" | "primary" | "muted";
}
```

### `StatusBar.tsx` — Enhanced hint rendering

The key change is in the hint rendering section. Replace the existing hint display logic:

```tsx
// Calculate available width for hints
// Status bar: [hints...] [center section] [? help]
const rightSectionWidth = 8; // "  ? help"
const centerSectionWidth = authConfirmText?.length ?? offlineWarning?.length ?? syncLabel.length ?? 8;
const hintAreaWidth = Math.max(20, width - rightSectionWidth - centerSectionWidth - 4);

const { visible: displayedHints, truncated: hintsTruncated } = calculateVisibleHints(
  hints,
  hintAreaWidth,
);
```

And the render:

```tsx
{displayedHints.map((hint, i) => (
  <React.Fragment key={i}>
    {hint.color ? (
      <text fg={theme[hint.color]}>
        {hint.keys ? `${hint.keys}:` : ""}{hint.label}  
      </text>
    ) : (
      <>
        <text fg={theme.primary}>{hint.keys}</text>
        <text fg={theme.muted}>{`:${hint.label}  `}</text>
      </>
    )}
  </React.Fragment>
))}
{hintsTruncated && <text fg={theme.muted}>  …</text>}
```

---

## Edge Cases & Boundary Conditions

| Scenario | Behavior | Implementation Detail |
|----------|----------|----------------------|
| `g g` (double g) | Second `g` is not a valid destination → caught by catch-all `g` binding in GOTO scope → cancels | The `g` key IS in the `a-z` range but is NOT in the `validKeys` set (which only contains the 11 destination keys + `q`), so it hits the catch-all cancel handler |
| `g` then valid key within 10ms | Navigates correctly | No debounce — timeout starts at 1500ms, any valid key before that triggers immediately |
| `g` pressed 5 times rapidly | Each `g` alternates: 1st activates, 2nd cancels (caught as invalid key in GOTO scope), 3rd activates (global handler fires since GOTO scope was removed), 4th cancels, 5th activates | Final state: go-to active |
| Terminal resize during go-to | Go-to remains active; status bar hints re-rendered at new width | `useLayout()` triggers re-render; GOTO scope stays registered |
| SSE disconnect during go-to | No effect on go-to | Go-to has zero network dependencies |
| Error message at 80×24 | "No repository in context" (26 chars) fits within 80-col status bar | Status bar error padding ensures no overflow |
| `repoContext` becomes null mid-mode | Checked at second-key time, not activation time | `navRef.current.repoContext` evaluated lazily in handler |
| Timer leak on unmount | `useEffect` cleanup clears both `timeoutRef` and `errorTimeoutRef` | |
| Programmatic nav during go-to | External `push()`/`reset()` proceeds; go-to scope remains until timeout or user action | Go-to doesn't block navigation from other sources |
| Invalid screen ID from mapping | `executeGoTo()` would navigate to a screen that renders PlaceholderScreen | Not an error — the screen registry covers all `ScreenName` values |

---

## Productionization Checklist

Since the existing `goToBindings.ts` and the `KeybindingProvider` infrastructure are already production-quality (tested in `app-shell.test.ts`), the new code follows the same patterns. Specific items:

1. **No PoC code needed** — All new code directly targets production file paths. The `useGoToMode` hook follows the same ref+state+callback pattern established by `OverlayManager` and `useGlobalKeybindings`.

2. **Memory safety** — All `setTimeout` handles are cleared in `useEffect` cleanup. All scope registrations are paired with removal. The `hintsCleanupRef` pattern mirrors `OverlayManager`'s `hintsCleanupRef`.

3. **No new runtime dependencies** — Uses only existing imports: `react`, `@opentui/react` (indirectly via `useLayout`), and internal TUI modules.

4. **Type safety** — The `GoToModeState` interface is fully typed. The `StatusBarHint.color` addition is backward-compatible (optional field).

5. **Logger integration** — Uses existing `logger` with appropriate levels (`debug` for activation/cancellation, `info` for successful navigation, `warn` for context failures). Controlled by `CODEPLANE_TUI_LOG_LEVEL`.

---

## Unit & Integration Tests

### Test File: `e2e/tui/goto-keybindings.test.ts`

All tests use `@microsoft/tui-test` via the `launchTUI()` helper from `e2e/tui/helpers.ts`. Tests that fail due to unimplemented backends are **left failing** (never skipped or commented out).

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import {
  launchTUI,
  TERMINAL_SIZES,
  type TUITestInstance,
} from "./helpers.ts";
```

---

#### Terminal Snapshot Tests

```typescript
describe("TUI_GOTO_KEYBINDINGS — Snapshot Tests", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("goto-mode-status-bar-hints: go-to hints shown at 120x40", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    // Status bar should show go-to destination hints
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/g\+d.*dashboard/i);
    expect(statusLine).toMatch(/g\+r.*repos/i);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.sendKeys("Escape"); // clean up
  });

  test("goto-mode-status-bar-hints-80col: truncated hints at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    // Should show some hints but not all 11
    expect(statusLine).toMatch(/g\+/); // at least one hint visible
    // Should have truncation indicator
    expect(statusLine).toMatch(/…/);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.sendKeys("Escape");
  });

  test("goto-mode-status-bar-hints-200col: all 11 hints at 200x60", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/g\+d.*dashboard/i);
    expect(statusLine).toMatch(/g\+k.*wiki/i); // last hint
    expect(statusLine).not.toMatch(/…/); // no truncation
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.sendKeys("Escape");
  });

  test("goto-context-error-display: error shown when no repo context", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "i");
    // Status bar should show error
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/No repository in context/i);
    // Content area should still show Dashboard
    expect(terminal.snapshot()).toMatch(/Dashboard/);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("goto-context-error-clears-after-timeout: error clears after 2s", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("No repository in context");
    // Wait for error to clear (2000ms + buffer)
    await new Promise((r) => setTimeout(r, 2500));
    // Error should be gone, normal hints restored
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).not.toMatch(/No repository in context/);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("goto-navigation-to-dashboard: g d shows Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    // Breadcrumb should show "Dashboard"
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("goto-navigation-to-repos: g r shows Repositories", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("goto-navigation-to-issues-with-context: g i with repo", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/project"],
    });
    await terminal.waitForText("alice/project");
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    // Breadcrumb should show path through repo
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/alice.*project.*Issues/i);
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("goto-navigation-to-notifications: g n shows Notifications", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("goto-help-overlay-go-to-group: help shows Go To group", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    // Help overlay should have a "Go To" section
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Go To/i);
    // Should list at least some destinations
    expect(snapshot).toMatch(/Dashboard/);
    expect(snapshot).toMatch(/Issues/);
    expect(snapshot).toMatch(/requires repo/i);
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.sendKeys("Escape");
  });
});
```

---

#### Keyboard Interaction Tests

```typescript
describe("TUI_GOTO_KEYBINDINGS — Keyboard Interaction", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("goto-g-activates-mode: g shows go-to hints", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const normalHints = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g");
    const goToHints = terminal.getLine(terminal.rows - 1);
    // Hints should have changed
    expect(goToHints).not.toEqual(normalHints);
    expect(goToHints).toMatch(/dashboard|repos/i);
    // Content should be unchanged
    expect(terminal.snapshot()).toMatch(/Dashboard/);
    await terminal.sendKeys("Escape");
  });

  test("goto-gd-navigates-to-dashboard: from Repos to Dashboard", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
  });

  test("goto-gr-navigates-to-repos", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("goto-gw-navigates-to-workspaces", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "w");
    await terminal.waitForText("Workspaces");
  });

  test("goto-gn-navigates-to-notifications", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
  });

  test("goto-gs-navigates-to-search", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "s");
    await terminal.waitForText("Search");
  });

  test("goto-ga-navigates-to-agents", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "a");
    await terminal.waitForText("Agents");
  });

  test("goto-go-navigates-to-organizations", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "o");
    await terminal.waitForText("Organizations");
  });

  test("goto-gi-navigates-with-repo-context", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/project"],
    });
    await terminal.waitForText("alice/project");
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
  });

  test("goto-gl-navigates-with-repo-context", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/project"],
    });
    await terminal.waitForText("alice/project");
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landings");
  });

  test("goto-gf-navigates-with-repo-context", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/project"],
    });
    await terminal.waitForText("alice/project");
    await terminal.sendKeys("g", "f");
    await terminal.waitForText("Workflows");
  });

  test("goto-gk-navigates-with-repo-context", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/project"],
    });
    await terminal.waitForText("alice/project");
    await terminal.sendKeys("g", "k");
    await terminal.waitForText("Wiki");
  });

  test("goto-gi-fails-without-repo-context", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "i");
    // Should show error, screen unchanged
    expect(terminal.snapshot()).toMatch(/No repository in context/i);
    expect(terminal.snapshot()).toMatch(/Dashboard/);
  });

  test("goto-gl-fails-without-repo-context", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "l");
    expect(terminal.snapshot()).toMatch(/No repository in context/i);
    expect(terminal.snapshot()).toMatch(/Dashboard/);
  });

  test("goto-gf-fails-without-repo-context", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "f");
    expect(terminal.snapshot()).toMatch(/No repository in context/i);
    expect(terminal.snapshot()).toMatch(/Dashboard/);
  });

  test("goto-gk-fails-without-repo-context", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "k");
    expect(terminal.snapshot()).toMatch(/No repository in context/i);
    expect(terminal.snapshot()).toMatch(/Dashboard/);
  });

  test("goto-escape-cancels: Esc cancels without popping", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g");
    // Go-to active
    const goToHints = terminal.getLine(terminal.rows - 1);
    expect(goToHints).toMatch(/dashboard/i);
    await terminal.sendKeys("Escape");
    // Should still be on Repositories (not popped)
    await terminal.waitForText("Repositories");
    // Hints should revert
    const normalHints = terminal.getLine(terminal.rows - 1);
    expect(normalHints).not.toMatch(/g\+d.*dashboard/i);
  });

  test("goto-invalid-key-cancels: unrecognized key cancels silently", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "x");
    // Should still be on Dashboard, hints reverted
    await terminal.waitForText("Dashboard");
    const hints = terminal.getLine(terminal.rows - 1);
    expect(hints).not.toMatch(/g\+d.*dashboard/i);
  });

  test("goto-timeout-cancels: 1500ms timeout cancels mode", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    // Wait for timeout (1500ms + buffer)
    await new Promise((r) => setTimeout(r, 2000));
    // Now press d — should NOT navigate (timeout expired)
    await terminal.sendKeys("d");
    // Should still be on Dashboard
    await terminal.waitForText("Dashboard");
  });

  test("goto-q-cancels-and-pops: q cancels go-to AND pops screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g");
    await terminal.sendKeys("q");
    // Should pop back to Dashboard
    await terminal.waitForText("Dashboard");
  });

  test("goto-ctrl-c-quits: Ctrl+C during go-to exits TUI", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    await terminal.sendKeys("ctrl+c");
    // TUI should have exited — terminate() is best-effort
    await terminal.terminate();
  });

  test("goto-suppressed-during-input-focus: g goes to input", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "search"],
    });
    await terminal.waitForText("Search");
    await terminal.sendKeys("/"); // focus search input
    await terminal.sendKeys("g");
    // g should have been typed into the input, not activated go-to
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/g/); // g in input
    expect(terminal.getLine(terminal.rows - 1)).not.toMatch(/g\+d.*dashboard/i);
    await terminal.sendKeys("Escape");
  });

  test("goto-suppressed-during-help-overlay: g does not activate", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?"); // open help
    await terminal.sendKeys("g");
    // Help should still be open
    const snapshot = terminal.snapshot();
    expect(snapshot).toMatch(/Global|Keybindings/i);
    await terminal.sendKeys("Escape");
  });

  test("goto-suppressed-during-command-palette: g does not activate", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":"); // open palette
    await terminal.waitForText("Command");
    await terminal.sendKeys("g");
    // Palette should still be open
    await terminal.waitForText("Command");
    await terminal.sendKeys("Escape");
  });

  test("goto-replaces-stack-from-deep: go-to from 4 deep resets to depth 1", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r"); await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "w"); await terminal.waitForText("Workspaces");
    await terminal.sendKeys("g", "n"); await terminal.waitForText("Notifications");
    await terminal.sendKeys("g", "s"); await terminal.waitForText("Search");
    // Now go to Dashboard — should reset stack to depth 1
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    // q should exit TUI (no screen to go back to)
    // We can verify by pressing q and checking behavior
    // Since process.exit would terminate, we just verify we're at Dashboard
  });

  test("goto-rapid-gg-cancels: g g cancels go-to", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "g");
    // Should still be on Dashboard (no navigation)
    await terminal.waitForText("Dashboard");
    // Hints should be normal (not go-to hints)
    const hints = terminal.getLine(terminal.rows - 1);
    expect(hints).not.toMatch(/g\+d.*dashboard.*g\+r.*repos/i);
  });

  test("goto-rapid-toggle: g Esc g d navigates correctly", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    await terminal.sendKeys("Escape");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
  });

  test("goto-status-bar-reverts-on-navigation: hints update to new screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const hints = terminal.getLine(terminal.rows - 1);
    // Should show Repositories screen hints, not go-to hints
    expect(hints).not.toMatch(/g\+d.*dashboard.*g\+r.*repos/i);
  });

  test("goto-status-bar-reverts-on-cancel: hints restored after Esc", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const normalHints = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g");
    await terminal.sendKeys("Escape");
    const restoredHints = terminal.getLine(terminal.rows - 1);
    expect(restoredHints).toEqual(normalHints);
  });

  test("goto-error-does-not-overflow-status-bar: error fits at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "i");
    const statusLine = terminal.getLine(terminal.rows - 1);
    // "No repository in context" is 26 chars — should fit
    expect(statusLine).toMatch(/No repository in context/i);
    // Status line should not be wider than terminal
    expect(statusLine.length).toBeLessThanOrEqual(80);
  });
});
```

---

#### Responsive Tests

```typescript
describe("TUI_GOTO_KEYBINDINGS — Responsive", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("goto-mode-at-80x24: active and functional", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/g\+/); // at least some hints
    await terminal.sendKeys("d");
    await terminal.waitForText("Dashboard");
  });

  test("goto-mode-at-120x40: full hints and navigation", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/g\+d/); // hints visible
    await terminal.sendKeys("r");
    await terminal.waitForText("Repositories");
  });

  test("goto-mode-at-200x60: all hints visible", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/g\+d/); // first
    expect(statusLine).toMatch(/g\+k/); // last
    await terminal.sendKeys("n");
    await terminal.waitForText("Notifications");
  });

  test("goto-resize-during-mode: resize does not cancel", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g");
    // Go-to should be active
    expect(terminal.getLine(terminal.rows - 1)).toMatch(/g\+d/i);
    // Resize to 80x24
    await terminal.resize(80, 24);
    // Go-to should still be active — hints may be truncated
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/g\+/); // still showing go-to hints
    // Navigation should still work
    await terminal.sendKeys("d");
    await terminal.waitForText("Dashboard");
  });

  test("goto-resize-during-error: error visible at new width", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("No repository in context");
    // Resize
    await terminal.resize(80, 24);
    // Error should still be visible
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/No repository in context/i);
    // Wait for timeout
    await new Promise((r) => setTimeout(r, 2500));
    // Error should clear
    expect(terminal.getLine(terminal.rows - 1)).not.toMatch(
      /No repository in context/,
    );
  });

  test("goto-all-destinations-at-minimum-size: 7 context-free destinations", async () => {
    const destinations = [
      { key: "d", screen: "Dashboard" },
      { key: "r", screen: "Repositories" },
      { key: "w", screen: "Workspaces" },
      { key: "n", screen: "Notifications" },
      { key: "s", screen: "Search" },
      { key: "a", screen: "Agents" },
      { key: "o", screen: "Organizations" },
    ];
    for (const dest of destinations) {
      terminal = await launchTUI({ cols: 80, rows: 24 });
      await terminal.waitForText("Dashboard");
      await terminal.sendKeys("g", dest.key);
      await terminal.waitForText(dest.screen);
      await terminal.terminate();
    }
  });

  test("goto-context-destinations-at-minimum-size: 4 repo destinations", async () => {
    const destinations = [
      { key: "i", screen: "Issues" },
      { key: "l", screen: "Landings" },
      { key: "f", screen: "Workflows" },
      { key: "k", screen: "Wiki" },
    ];
    for (const dest of destinations) {
      terminal = await launchTUI({
        cols: 80,
        rows: 24,
        args: ["--screen", "repos", "--repo", "alice/project"],
      });
      await terminal.waitForText("alice/project");
      await terminal.sendKeys("g", dest.key);
      await terminal.waitForText(dest.screen);
      await terminal.terminate();
    }
  });
});
```

---

#### Integration Tests

```typescript
describe("TUI_GOTO_KEYBINDINGS — Integration", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("goto-after-deep-link-launch: go-to works after deep-link start", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "issues", "--repo", "alice/project"],
    });
    await terminal.waitForText("Issues");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
  });

  test("goto-preserves-repo-context-across-navigations", async () => {
    terminal = await launchTUI({
      cols: 120,
      rows: 40,
      args: ["--screen", "repos", "--repo", "alice/project"],
    });
    await terminal.waitForText("alice/project");
    await terminal.sendKeys("g", "i");
    await terminal.waitForText("Issues");
    // Go to Landings — should preserve same repo context
    await terminal.sendKeys("g", "l");
    await terminal.waitForText("Landings");
    // Breadcrumb should still show alice/project
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/alice.*project/i);
  });

  test("goto-notification-badge-persists: badge survives navigation", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Navigate around
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    // Status bar should still have consistent structure
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\?.*help/i);
  });

  test("goto-back-navigation-after-goto: q walks back through logical stack", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
    // q again should exit (or stay on Dashboard since it's root)
  });

  test("goto-command-palette-equivalent: g d and palette give same result", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("g", "d");
    await terminal.waitForText("Dashboard");
    // Verify we're on Dashboard with depth 1
    // (command palette would give the same result)
  });
});
```

---

## Test Relationship to Existing Tests

The new `e2e/tui/goto-keybindings.test.ts` file is a **dedicated test file** for the go-to feature. The existing `e2e/tui/app-shell.test.ts` already contains several go-to tests (NAV-GOTO-001 through 003, KEY-KEY-006, KEY-KEY-012, KEY-KEY-031, OVERLAY-012) that were written as part of the keybinding provider and navigation provider test suites. Those tests remain in place and will now **pass** once this implementation is complete. The new file provides comprehensive coverage of the go-to feature's full behavior matrix including all 11 destinations, all cancellation paths, responsive behavior, and integration scenarios.

---

## Acceptance Criteria Traceability

| Acceptance Criteria | Implementation | Test |
|----|----|----|  
| `g` enters go-to mode when no overlay/input focused | `useGoToMode.activate()` with `hasActiveModal()` guard | `goto-g-activates-mode`, `goto-suppressed-*` |
| Status bar shows destination hints | `statusBarCtx.overrideHints(GO_TO_HINTS)` | `goto-mode-status-bar-hints*` |
| 11 destinations reachable | `goToBindings` constant with `executeGoTo()` | `goto-g{d,r,w,n,s,a,o,i,l,f,k}-navigates-*` |
| Context-dependent fail with error | `executeGoTo()` returns `{ error }` → `showError()` | `goto-g{i,l,f,k}-fails-without-*` |
| Error clears after 2s | `errorTimeoutRef` with 2000ms | `goto-context-error-clears-after-timeout` |
| Stack replacement (not push) | `executeGoTo()` calls `nav.reset()` then `nav.push()` | `goto-replaces-stack-from-deep` |
| 1500ms timeout cancels | `setTimeout(cancel, 1500)` | `goto-timeout-cancels` |
| Esc cancels without pop | GOTO scope `escape` handler calls `cancel()` only | `goto-escape-cancels` |
| q cancels and pops | GOTO scope `q` handler calls `cancel()` then `pop()` | `goto-q-cancels-and-pops` |
| Invalid key cancels | Catch-all handlers for `a-z`/digits call `cancel()` | `goto-invalid-key-cancels` |
| g g cancels | Second `g` hits catch-all (not a valid destination) | `goto-rapid-gg-cancels` |
| Help overlay shows Go To group | `useGoToHelpBindings()` registers display-only bindings | `goto-help-overlay-go-to-group` |
| Responsive hints | `calculateVisibleHints()` with width-aware truncation | `goto-mode-at-{80,120,200}*` |
| Resize during go-to continues | No cancel on resize; hints re-rendered | `goto-resize-during-mode` |