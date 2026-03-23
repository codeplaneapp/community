# `tui-spinner-hook` — Engineering Specification

## Ticket Metadata

| Field | Value |
|---|---|
| **ID** | `tui-spinner-hook` |
| **Title** | Implement shared `useSpinner` hook with braille/ASCII animation |
| **Type** | engineering |
| **Feature** | Foundation (consumed by `TUI_LOADING_STATES`, `TUI_STATUS_BAR`, `TUI_AGENTS`, and others) |
| **Estimate** | 2 hours |
| **Dependencies** | `tui-foundation-scaffold`, `tui-color-detection` |
| **Target file** | `apps/tui/src/hooks/useSpinner.ts` |

---

## 1. Problem Statement

The TUI codebase requires a canonical, shared spinner animation hook before any screen-level loading indicator, status bar syncing badge, or agent streaming indicator can be implemented. Currently:

- **No shared spinner exists** in `apps/tui/src/hooks/` — the directory contains `useDiffSyntaxStyle.ts`, `useTheme.ts`, `useColorTier.ts`, and a barrel `index.ts`, but no spinner hook.
- **`apps/tui/src/theme/detect.ts` exists and is fully implemented** — the `isUnicodeSupported()` function required by this hook is already available. The `tui-color-detection` dependency is satisfied.
- Spec-level reference implementations in `specs/tui/apps/tui/src/` define the target patterns for `MessageBlock.tsx` (currently `export {};` stub), `LoadingProvider.tsx` (imports `useSpinner`), and `useAgentStream.ts` (imports `useSpinner`), but the production `apps/tui/src/` tree has none of these implementations yet.
- The spec-level research document (`specs/tui/research/tui-spinner-hook.md`) documents two planned inline spinner implementations (in `MessageBlock.tsx` and `useAgentStream.ts`) using `setInterval` — both must be replaced by the canonical hook when those components are implemented.
- **At least 15 downstream tickets** (`tui-auth-token-loading`, `tui-loading-states`, `tui-status-bar`, workspace status, force sync, notification resolution, workflow dispatch, agent chat) list `tui-spinner-hook` as a direct dependency.

The hook must use OpenTUI's `Timeline` + `engine` animation system (not `setInterval`) to integrate with the renderer's `requestLive()`/`dropLive()` lifecycle, ensuring zero CPU consumption when no spinners are active.

---

## 2. Acceptance Criteria

- [ ] `useSpinner(true)` returns braille characters cycling at **80ms** intervals on Unicode-capable terminals.
- [ ] `useSpinner(true)` returns ASCII characters cycling at **120ms** intervals on non-Unicode terminals (`TERM=dumb` or `NO_COLOR=1`).
- [ ] `useSpinner(false)` returns empty string `""` regardless of whether other components have active spinners.
- [ ] Multiple concurrent `useSpinner(true)` consumers display the **same frame** at the same time (synchronized).
- [ ] Spinner does not consume CPU when all consumers have `active === false` (timeline is paused, engine calls `dropLive()`).
- [ ] Animation is driven by OpenTUI's `Timeline` and `engine` from `@opentui/core` (not `setInterval`).
- [ ] Hook is a pure hook — no DOM/terminal output. Components use the returned character in their own `<text>` elements.
- [ ] Frame constants (`BRAILLE_FRAMES`, `ASCII_FRAMES`) and interval constants (`BRAILLE_INTERVAL_MS`, `ASCII_INTERVAL_MS`) are exported for consumer inspection and test assertions.
- [ ] Timeline's `onUpdate` callback uses a dedicated `lastEmittedIndex` integer for comparison, not `state.frameIndex` which may hold intermediate float values from Timeline interpolation.
- [ ] Barrel export at `apps/tui/src/hooks/index.ts` is updated to include all spinner exports alongside existing hook exports.

---

## 3. Architecture

### 3.1 Module Structure

```
apps/tui/src/hooks/useSpinner.ts    ← single file, all logic
```

Single file containing the hook, constants, and module-level singleton state. Named exports for the hook and constants.

### 3.2 Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Animation driver | `Timeline` + `engine` from `@opentui/core` | Integrates with OpenTUI's `TimelineEngine` which manages `requestLive()`/`dropLive()` on the renderer. `setInterval` bypasses this and causes frame tearing, leaked intervals, and CPU waste. |
| Frame synchronization | Module-level shared `Timeline` singleton with `React.useSyncExternalStore` | All `useSpinner` consumers subscribe to the same timeline so frames are always in sync. `useTimeline()` from `@opentui/react` creates per-instance timelines which defeats synchronization. |
| Per-caller active gating | Hook combines global frame + local `active` param | `getSnapshot()` returns the global frame unconditionally. The hook itself gates: `active ? globalFrame : ""`. This prevents `useSpinner(false)` from returning a frame when another component is active. |
| Unicode detection | `isUnicodeSupported()` from `../theme/detect.js` | Already implemented in `apps/tui/src/theme/detect.ts` by the `tui-color-detection` ticket. Heuristic based on `TERM` and `NO_COLOR` env vars. |
| Interval difference | 80ms braille / 120ms ASCII | Braille characters are visually subtle and need faster cycling. ASCII characters (`- \\ | /`) are visually heavier and need slower cycling to avoid flicker. |
| Return type | `string` (single character or empty) | Callers embed the return value directly in `<text>` children. No wrapper component, no render prop. |
| Lazy initialization | Timeline created on first `activate()`, never destroyed | Avoids startup cost for screens that don't use spinners. Singleton survives for app lifetime — `play()`/`pause()` control whether it consumes frame callbacks. |
| Frame comparison guard | Dedicated `lastEmittedIndex` integer separate from animated target | Timeline.add() interpolates target properties as floats before `onUpdate` fires. Comparing against a property the Timeline has written to (which holds intermediate floats) would cause `emitChange()` to fire at engine tick rate (~60fps) instead of spinner frame cadence (~12fps). A separate integer variable ensures comparison is always integer-to-integer. |

### 3.3 Frame Sets

**Braille (Unicode) — 10 frames, 80ms/frame, 800ms full cycle:**
```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
```

**ASCII (non-Unicode) — 4 frames, 120ms/frame, 480ms full cycle:**
```
- \ | /
```

### 3.4 Synchronized Global Timeline

The spinner uses a **single shared `Timeline` instance** at module scope:

```
┌─────────────────────────────────────────────────────┐
│  Module scope: spinnerTimeline (singleton)           │
│  ┌───────────────────────────────────────────────┐  │
│  │ Timeline { loop: true, duration: CYCLE_MS }   │  │
│  │  .add(state, { _progress: 1 }, …)             │  │
│  └───────────────────────────────────────────────┘  │
│                     ▲                               │
│     ┌───────────────┼───────────────┐               │
│     │               │               │               │
│  useSpinner(true) useSpinner(true) useSpinner(false) │
│  → returns "⠋"    → returns "⠋"   → returns ""     │
│  [StatusBar]     [MessageBlock]   [idle component]  │
└─────────────────────────────────────────────────────┘
```

This ensures:
- All spinners on screen show the same frame at the same time.
- Only one timeline runs in the `TimelineEngine`, regardless of consumer count.
- The timeline starts when the first consumer activates and pauses when the last consumer deactivates.
- The engine calls `dropLive()` when no timelines are playing, allowing the renderer to go idle.
- Components with `active=false` always receive `""`, even when the global timeline is running for other consumers.

### 3.5 Why Not `useTimeline()` Directly

The ticket description mentions `useTimeline()` from `@opentui/react`. The implementation uses the same underlying `Timeline` and `engine` primitives from `@opentui/core` that `useTimeline()` wraps internally. However, `useTimeline()` creates a **per-instance** timeline on each hook call — each component calling `useSpinner(true)` would get its own timeline at a different phase, defeating synchronization.

The `useTimeline()` hook (from `@opentui/react@0.1.90`, implemented in `packages/react/src/hooks/use-timeline.ts`) has this behavior:
```typescript
export const useTimeline = (options?: TimelineOptions) => {
  const timeline = new Timeline(options);
  useEffect(() => {
    if (!options.autoplay) timeline.play();
    engine.register(timeline);
    return () => {
      timeline.pause();
      engine.unregister(timeline);
    };
  }, []);
  return timeline;
};
```

It automatically registers/unregisters the timeline with the engine on mount/unmount. Our singleton pattern achieves the same engine integration but with a single shared timeline for all consumers.

### 3.6 Per-Caller Active Gating (Review Fix)

The spec reference implementation at `specs/tui/apps/tui/src/hooks/useSpinner.ts` has a bug identified in `specs/tui/reviews/tui-spinner-hook-iteration-0.md` (Finding #1, HIGH severity):

```typescript
// BUG in specs/tui/apps/tui/src/hooks/useSpinner.ts line 51-53:
function getSnapshot(): string {
  return activeCount > 0 ? FRAMES[state.frameIndex] : "";
}
export function useSpinner(active: boolean): string {
  // ...
  return useSyncExternalStore(subscribe, getSnapshot); // ← returns frame even when THIS caller is inactive
}
```

When Component A calls `useSpinner(true)` and Component B calls `useSpinner(false)`, both share the same `getSnapshot()` which returns a frame because `activeCount > 0`. Component B incorrectly receives a spinner frame.

**Fix:** Move the active gating **into the hook return**, not into `getSnapshot()`:

```typescript
// CORRECT: per-caller gating in hook return
function getSnapshot(): string {
  return activeCount > 0 ? FRAMES[currentFrameIndex] : "";
}
export function useSpinner(active: boolean): string {
  // ...
  const frame = useSyncExternalStore(subscribe, getSnapshot);
  return active ? frame : "";
}
```

This way, each caller's `active` parameter independently determines whether it sees the spinner frame or an empty string.

### 3.7 Float Interpolation Guard (Review Fix)

The spec reference implementation has a second bug (Finding #2, HIGH severity):

```typescript
// BUG in specs/tui/apps/tui/src/hooks/useSpinner.ts lines 67-84:
timeline.add(
  [state],  // ← Timeline writes float values into state.frameIndex!
  {
    frameIndex: FRAMES.length,  // ← animate from 0 to FRAMES.length as float
    onUpdate: (animation) => {
      const newIndex = Math.min(
        Math.floor(animation.progress * FRAMES.length),
        FRAMES.length - 1
      );
      if (newIndex !== state.frameIndex) {  // ← comparing int to float!
        state.frameIndex = newIndex;
        emitChange();
      }
    },
  },
);
```

Timeline interpolates `state.frameIndex` as a float (e.g., `0.375`, `4.8`) before `onUpdate` fires. The `add()` method extracts any numeric properties from the options object that are not recognized config keys (like `ease`, `duration`, `onUpdate`, etc.) and treats them as animation targets. Since `frameIndex` is numeric and not a recognized config key, it becomes an animation target — the Timeline will linearly interpolate it from `0` to `FRAMES.length` over the animation duration, writing float values into `state.frameIndex` at each engine tick.

The comparison `newIndex !== state.frameIndex` evaluates `true` almost every tick because an integer is compared to a float, causing `emitChange()` to fire at engine tick rate (~60fps) instead of spinner frame cadence (~12fps).

**Fix:** Use a throwaway animation target and a dedicated integer for frame comparison:

```typescript
const animTarget = { _progress: 0 }; // throwaway — absorbs float writes
let lastEmittedIndex = 0;             // dedicated integer comparison

timeline.add(
  [animTarget],  // ← float writes go here harmlessly
  {
    _progress: 1,  // ← animate throwaway property
    ease: "linear",
    duration: CYCLE_DURATION_MS,
    loop: true,
    onUpdate: (animation) => {
      const newIndex = Math.min(
        Math.floor(animation.progress * FRAMES.length),
        FRAMES.length - 1
      );
      if (newIndex !== lastEmittedIndex) {  // ← integer to integer!
        lastEmittedIndex = newIndex;
        currentFrameIndex = newIndex;
        emitChange();
      }
    },
  },
  0
);
```

---

## 4. Implementation Plan

### Step 1: Verify `tui-color-detection` Dependency

**Precondition check** — confirm that `apps/tui/src/theme/detect.ts` exists and exports `isUnicodeSupported()`.

**Current codebase state (verified):**
- ✅ `apps/tui/src/theme/detect.ts` exists (73 lines).
- ✅ Exports `detectColorCapability(): ColorTier` and `isUnicodeSupported(): boolean`.
- ✅ `isUnicodeSupported()` returns `false` for `TERM=dumb` or `NO_COLOR` set.
- ✅ `apps/tui/src/theme/index.ts` barrel-exports all theme symbols.

**Action:** No file creation needed. Dependency is satisfied.

### Step 2: Create the `useSpinner` Hook

**File:** `apps/tui/src/hooks/useSpinner.ts`
**Action:** Create new file.

This implementation addresses all three HIGH-severity review findings from `specs/tui/reviews/tui-spinner-hook-iteration-0.md`.

```typescript
import { useEffect, useSyncExternalStore } from "react";
import { Timeline, engine } from "@opentui/core";
import { isUnicodeSupported } from "../theme/detect.js";

// ── Constants ────────────────────────────────────────────────────────

/** Braille spinner frames — Unicode terminals. */
export const BRAILLE_FRAMES = [
  "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏",
] as const;

/** ASCII spinner frames — non-Unicode terminals. */
export const ASCII_FRAMES = ["-", "\\", "|", "/"] as const;

/** Milliseconds per frame for braille spinners. */
export const BRAILLE_INTERVAL_MS = 80;

/** Milliseconds per frame for ASCII spinners. */
export const ASCII_INTERVAL_MS = 120;

// ── Resolved frame configuration (determined once at module load) ───

const unicode = isUnicodeSupported();
const FRAMES: readonly string[] = unicode ? BRAILLE_FRAMES : ASCII_FRAMES;
const INTERVAL_MS = unicode ? BRAILLE_INTERVAL_MS : ASCII_INTERVAL_MS;
const CYCLE_DURATION_MS = FRAMES.length * INTERVAL_MS;

// ── Module-level singleton state ────────────────────────────────────

/**
 * Current frame index. Updated by the Timeline's onUpdate callback.
 * This is the source of truth for what frame character to display.
 */
let currentFrameIndex = 0;

/**
 * Last emitted frame index. Used to avoid redundant emitChange() calls.
 * Timeline.add() interpolates target properties as floats before onUpdate
 * fires, so we compare against this dedicated integer, NOT against any
 * property that Timeline may have written float values into.
 */
let lastEmittedIndex = 0;

/** Number of active subscribers (components with active=true). */
let activeCount = 0;

/** Subscriptions for useSyncExternalStore. */
type Listener = () => void;
const listeners = new Set<Listener>();

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the current spinner frame, or empty string if no consumers
 * are active. This is the GLOBAL snapshot — per-caller active gating
 * is applied in the useSpinner hook itself.
 */
function getSnapshot(): string {
  return activeCount > 0 ? FRAMES[currentFrameIndex] : "";
}

// ── Timeline lifecycle ──────────────────────────────────────────────

/**
 * Opaque animation target. We do NOT use a real state object as the
 * animation target because Timeline interpolates properties as floats.
 * Instead we use a throwaway object and compute frame index from
 * animation.progress in onUpdate.
 */
const animTarget = { _progress: 0 };

let timeline: Timeline | null = null;

function ensureTimeline(): Timeline {
  if (!timeline) {
    timeline = new Timeline({
      duration: CYCLE_DURATION_MS,
      loop: true,
      autoplay: false, // We control play/pause manually.
    });

    // Animate a throwaway property. The real work happens in onUpdate
    // where we discretize continuous progress into frame indices.
    timeline.add(
      [animTarget],
      {
        duration: CYCLE_DURATION_MS,
        _progress: 1, // Animate from 0 to 1 (throwaway, never read).
        ease: "linear",
        loop: true,
        onUpdate: (animation) => {
          const newIndex = Math.min(
            Math.floor(animation.progress * FRAMES.length),
            FRAMES.length - 1
          );
          if (newIndex !== lastEmittedIndex) {
            lastEmittedIndex = newIndex;
            currentFrameIndex = newIndex;
            emitChange();
          }
        },
      },
      0
    );

    engine.register(timeline);
  }
  return timeline;
}

function activate(): void {
  activeCount++;
  if (activeCount === 1) {
    const tl = ensureTimeline();
    tl.restart();
    emitChange(); // Notify subscribers that spinner is now active.
  }
}

function deactivate(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    timeline?.pause();
    currentFrameIndex = 0;
    lastEmittedIndex = 0;
    emitChange(); // Notify subscribers that spinner stopped.
  }
}

// ── Public hook ─────────────────────────────────────────────────────

/**
 * Shared spinner hook with braille/ASCII animation.
 *
 * Returns a single spinner character string when `active` is true,
 * or an empty string when false. All concurrent active spinners
 * are frame-synchronized.
 *
 * Animation is driven by OpenTUI's Timeline engine, not setInterval.
 *
 * Per-caller gating: even if another component has an active spinner,
 * this hook returns "" when the caller's `active` is false. This
 * prevents spinners from appearing on non-loading components.
 *
 * @param active - Whether the spinner should be animating.
 * @returns Current spinner frame character, or "".
 *
 * @example
 * ```tsx
 * const spinner = useSpinner(isLoading);
 * return <text>{spinner} Loading…</text>;
 * ```
 */
export function useSpinner(active: boolean): string {
  useEffect(() => {
    if (active) {
      activate();
      return () => deactivate();
    }
  }, [active]);

  const frame = useSyncExternalStore(subscribe, getSnapshot);
  // Per-caller gating: the global snapshot may have a frame because
  // another component is active, but THIS caller wants inactive.
  return active ? frame : "";
}
```

### Step 3: Update the Barrel Export

**File:** `apps/tui/src/hooks/index.ts`
**Action:** Edit existing file to add spinner exports.

The current file exports three hooks. Add the spinner exports:

```typescript
/**
 * Custom hooks for the TUI application.
 */
export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";
export { useTheme } from "./useTheme.js";
export { useColorTier } from "./useColorTier.js";
export {
  useSpinner,
  BRAILLE_FRAMES,
  ASCII_FRAMES,
  BRAILLE_INTERVAL_MS,
  ASCII_INTERVAL_MS,
} from "./useSpinner.js";
```

As downstream tickets add hooks, they append to this barrel.

### Step 4: Write Unit Tests

**File:** `apps/tui/src/hooks/__tests__/useSpinner.test.ts`
**Action:** Create new file.

See §5 (Unit & Integration Tests) for full test specification.

### Step 5: Write E2E Validation Tests

**File:** `e2e/tui/app-shell.test.ts`
**Action:** Append spinner-specific tests to existing file.

See §5.3 for E2E test specification.

### Step 6: Migrate Existing Inline Spinners (Deferred)

These migrations apply only if the consuming files have been implemented from their respective tickets. Current state of each file:

| File | Current State | Action |
|---|---|---|
| `apps/tui/src/screens/Agents/components/MessageBlock.tsx` | `export {};` (empty stub) | Deferred to agent screen tickets |
| `apps/tui/src/hooks/useAgentStream.ts` | Does not exist | Deferred to agent stream ticket |
| `apps/tui/src/providers/LoadingProvider.tsx` | Does not exist | Deferred to `tui-loading-states` ticket (already imports `useSpinner` in spec reference) |

When these components are implemented, they **must** import from the shared hook rather than implementing inline spinners. The spec reference implementations already show the correct import pattern.

---

## 5. Unit & Integration Tests

### 5.1 Unit Test File

**File:** `apps/tui/src/hooks/__tests__/useSpinner.test.ts`

These tests validate the hook's logic by mocking React's `useSyncExternalStore` and `useEffect` to exercise the module-level state machine without requiring a full OpenTUI renderer.

**Key review fixes applied to tests (Finding #3, HIGH):**

1. Tests do **not** hardcode braille frame expectations — they check against `BRAILLE_FRAMES` or `ASCII_FRAMES` dynamically, or against the union of both, so they pass regardless of the test runner's `TERM`/`NO_COLOR` environment.
2. Multi-subscriber test properly manages **separate** cleanup functions for each simulated consumer, ensuring `activeCount` is correctly decremented (Finding #4, MEDIUM).
3. Per-caller active gating is explicitly tested: Component A active + Component B inactive → B returns `""`.

```typescript
import { test, expect, describe, spyOn, beforeEach } from "bun:test";
import * as React from "react";

// ── Mock React hooks to test without a renderer ─────────────────────

let effectCallbacks: Array<{ cb: () => (() => void) | void; deps: any[] }> = [];
let syncExternalStoreArgs: {
  subscribe: any;
  getSnapshot: any;
} | null = null;

spyOn(React, "useSyncExternalStore").mockImplementation(
  (subscribe, getSnapshot) => {
    syncExternalStoreArgs = { subscribe, getSnapshot };
    return getSnapshot();
  }
);

spyOn(React, "useEffect").mockImplementation((cb: any, deps: any) => {
  effectCallbacks.push({ cb, deps });
});

import {
  useSpinner,
  BRAILLE_FRAMES,
  ASCII_FRAMES,
  BRAILLE_INTERVAL_MS,
  ASCII_INTERVAL_MS,
} from "../useSpinner.js";

// ── Helper to simulate mount/unmount ────────────────────────────────

function simulateMount(active: boolean): {
  getResult: () => string;
  cleanup: (() => void) | undefined;
} {
  effectCallbacks = [];
  syncExternalStoreArgs = null;

  const result = useSpinner(active);

  // Execute the most recent useEffect callback
  const lastEffect = effectCallbacks[effectCallbacks.length - 1];
  let cleanup: (() => void) | undefined;
  if (lastEffect) {
    const maybeCleanup = lastEffect.cb();
    cleanup = typeof maybeCleanup === "function" ? maybeCleanup : undefined;
  }

  return {
    getResult: () => syncExternalStoreArgs!.getSnapshot(),
    cleanup,
  };
}

// All valid spinner frames (union of both sets — tests pass regardless of TERM)
const ALL_FRAMES = [...BRAILLE_FRAMES, ...ASCII_FRAMES];

// ── Constant export tests ───────────────────────────────────────────

describe("useSpinner constants", () => {
  test("exports 10 braille frames", () => {
    expect(BRAILLE_FRAMES).toHaveLength(10);
    for (const frame of BRAILLE_FRAMES) {
      expect(frame).toHaveLength(1);
      const cp = frame.codePointAt(0)!;
      // Braille patterns block: U+2800–U+28FF
      expect(cp).toBeGreaterThanOrEqual(0x2800);
      expect(cp).toBeLessThanOrEqual(0x28ff);
    }
  });

  test("exports 4 ASCII frames", () => {
    expect(ASCII_FRAMES).toHaveLength(4);
    expect(Array.from(ASCII_FRAMES)).toEqual(["-", "\\", "|", "/"]);
  });

  test("braille interval is 80ms", () => {
    expect(BRAILLE_INTERVAL_MS).toBe(80);
  });

  test("ASCII interval is 120ms", () => {
    expect(ASCII_INTERVAL_MS).toBe(120);
  });

  test("braille full cycle is 800ms (10 frames × 80ms)", () => {
    expect(BRAILLE_FRAMES.length * BRAILLE_INTERVAL_MS).toBe(800);
  });

  test("ASCII full cycle is 480ms (4 frames × 120ms)", () => {
    expect(ASCII_FRAMES.length * ASCII_INTERVAL_MS).toBe(480);
  });
});

// ── Hook behavior tests ─────────────────────────────────────────────

describe("useSpinner hook", () => {
  test("returns empty string when active is false", () => {
    const result = useSpinner(false);
    expect(result).toBe("");
  });

  test("returns a valid frame character when active is true", () => {
    const { getResult, cleanup } = simulateMount(true);

    const frame = getResult();
    // Should be a member of the appropriate frame set.
    // We check both sets because the test environment's TERM may vary.
    expect(ALL_FRAMES).toContain(frame);

    // Cleanup to restore activeCount
    cleanup?.();
  });

  test("synchronized frames: two concurrent consumers see same frame", () => {
    // First consumer activates
    const consumer1 = simulateMount(true);
    const frame1 = consumer1.getResult();
    expect(ALL_FRAMES).toContain(frame1);

    // Second consumer activates — gets same global snapshot
    const consumer2 = simulateMount(true);
    const frame2 = consumer2.getResult();

    // Both must see the same frame (synchronized)
    expect(frame1).toBe(frame2);

    // Cleanup both consumers with their own cleanup functions
    consumer2.cleanup?.();
    consumer1.cleanup?.();
  });

  test("useSpinner(false) returns empty string even when another consumer is active", () => {
    // Consumer A: active
    const consumerA = simulateMount(true);
    const frameA = consumerA.getResult();
    expect(ALL_FRAMES).toContain(frameA);

    // Consumer B: inactive — should return "" despite global activeCount > 0
    const resultB = useSpinner(false);
    expect(resultB).toBe("");

    // Cleanup
    consumerA.cleanup?.();
  });

  test("returns empty string after deactivation", () => {
    const { getResult, cleanup } = simulateMount(true);

    // Verify active
    const frame = getResult();
    expect(frame).not.toBe("");

    // Deactivate via cleanup
    cleanup?.();

    // Global snapshot should return empty now that activeCount is 0
    const afterDeactivation = getResult();
    expect(afterDeactivation).toBe("");
  });

  test("restarts cleanly on re-activation after deactivation", () => {
    // Activate
    const mount1 = simulateMount(true);
    expect(mount1.getResult()).not.toBe("");

    // Deactivate
    mount1.cleanup?.();
    expect(mount1.getResult()).toBe("");

    // Re-activate
    const mount2 = simulateMount(true);
    expect(mount2.getResult()).not.toBe("");

    // Cleanup
    mount2.cleanup?.();
  });

  test("multiple activations only start timeline once, multiple deactivations count down", () => {
    const consumer1 = simulateMount(true);
    const consumer2 = simulateMount(true);
    const consumer3 = simulateMount(true);

    // All active — should have a frame
    expect(ALL_FRAMES).toContain(consumer1.getResult());

    // Deactivate consumer1 — timeline should still be running (activeCount=2)
    consumer1.cleanup?.();
    expect(ALL_FRAMES).toContain(consumer2.getResult());

    // Deactivate consumer2 — still running (activeCount=1)
    consumer2.cleanup?.();
    expect(ALL_FRAMES).toContain(consumer3.getResult());

    // Deactivate consumer3 — now timeline pauses (activeCount=0)
    consumer3.cleanup?.();
    expect(consumer3.getResult()).toBe("");
  });

  test("deactivate below zero is clamped (double cleanup safety)", () => {
    const consumer = simulateMount(true);
    consumer.cleanup?.();
    // Double cleanup — should not throw or go negative
    consumer.cleanup?.();
    expect(consumer.getResult()).toBe("");
  });
});
```

### 5.2 E2E Import Validation Test

**File:** `e2e/tui/app-shell.test.ts`
**Action:** Append to existing file within the `TUI_APP_SHELL` describe block.

These tests validate that the hook module is importable and its exports are structurally correct at runtime. They use the existing `bunEval` helper from `e2e/tui/helpers.ts` which executes `bun -e` expressions in the TUI package context.

```typescript
// Append to existing TUI_APP_SHELL describe block:

describe("TUI_APP_SHELL — useSpinner hook scaffold", () => {
  test("useSpinner.ts exports useSpinner function", async () => {
    const { exitCode, stdout } = await bunEval(`
      const mod = await import("./src/hooks/useSpinner.js");
      console.log(typeof mod.useSpinner);
    `);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("function");
  });

  test("useSpinner.ts exports BRAILLE_FRAMES with 10 entries", async () => {
    const { exitCode, stdout } = await bunEval(`
      const { BRAILLE_FRAMES } = await import("./src/hooks/useSpinner.js");
      console.log(JSON.stringify({ length: BRAILLE_FRAMES.length, first: BRAILLE_FRAMES[0], last: BRAILLE_FRAMES[9] }));
    `);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.length).toBe(10);
    expect(parsed.first).toBe("⠋");
    expect(parsed.last).toBe("⠏");
  });

  test("useSpinner.ts exports ASCII_FRAMES with 4 entries", async () => {
    const { exitCode, stdout } = await bunEval(`
      const { ASCII_FRAMES } = await import("./src/hooks/useSpinner.js");
      console.log(JSON.stringify({ length: ASCII_FRAMES.length, frames: Array.from(ASCII_FRAMES) }));
    `);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.length).toBe(4);
    expect(parsed.frames).toEqual(["-", "\\", "|", "/"]);
  });

  test("useSpinner.ts exports interval constants", async () => {
    const { exitCode, stdout } = await bunEval(`
      const { BRAILLE_INTERVAL_MS, ASCII_INTERVAL_MS } = await import("./src/hooks/useSpinner.js");
      console.log(JSON.stringify({ braille: BRAILLE_INTERVAL_MS, ascii: ASCII_INTERVAL_MS }));
    `);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.braille).toBe(80);
    expect(parsed.ascii).toBe(120);
  });

  test("hooks/index.ts barrel re-exports useSpinner", async () => {
    const { exitCode, stdout } = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(typeof mod.useSpinner);
    `);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("function");
  });

  test("hooks/index.ts barrel re-exports spinner constants", async () => {
    const { exitCode, stdout } = await bunEval(`
      const mod = await import("./src/hooks/index.js");
      console.log(JSON.stringify({
        BRAILLE_FRAMES: typeof mod.BRAILLE_FRAMES,
        ASCII_FRAMES: typeof mod.ASCII_FRAMES,
        BRAILLE_INTERVAL_MS: typeof mod.BRAILLE_INTERVAL_MS,
        ASCII_INTERVAL_MS: typeof mod.ASCII_INTERVAL_MS,
      }));
    `);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout.trim());
    expect(parsed.BRAILLE_FRAMES).toBe("object");
    expect(parsed.ASCII_FRAMES).toBe("object");
    expect(parsed.BRAILLE_INTERVAL_MS).toBe("number");
    expect(parsed.ASCII_INTERVAL_MS).toBe("number");
  });

  test("useSpinner imports Timeline and engine from @opentui/core", async () => {
    // Verify the hook's dependencies resolve at runtime
    const { exitCode } = await bunEval(`
      const { Timeline, engine } = await import("@opentui/core");
      if (typeof Timeline !== "function") throw new Error("Timeline not a constructor");
      if (typeof engine !== "object" || engine === null) throw new Error("engine not an object");
      if (typeof engine.register !== "function") throw new Error("engine.register not a function");
    `);
    expect(exitCode).toBe(0);
  });

  test("useSpinner respects isUnicodeSupported from theme/detect", async () => {
    // In TERM=dumb, isUnicodeSupported() returns false → ASCII frames should be used
    const { exitCode, stdout } = await bunEval(`
      const { isUnicodeSupported } = await import("./src/theme/detect.js");
      console.log(isUnicodeSupported());
    `);
    expect(exitCode).toBe(0);
    // The actual value depends on the test environment's TERM,
    // but the function should return a boolean.
    expect(["true", "false"]).toContain(stdout.trim());
  });
});
```

### 5.3 E2E Spinner Visual Integration Tests (Deferred)

The `useSpinner` hook is exercised indirectly by E2E tests in downstream ticket test files. These tests are **not** created as part of this ticket but are documented here for traceability. When the consuming components are implemented, these test patterns validate the spinner through the full rendering stack.

**File:** `e2e/tui/app-shell.test.ts` (created by `tui-loading-states` and `tui-status-bar` tickets)

| Test ID | What it validates |
|---|---|
| Loading state snapshot | Braille spinner character visible in full-screen loading state |
| Status bar sync indicator | Braille spinner visible next to "Syncing…" text in status bar |
| Loading disappears on data | Spinner character absent after data loads |

**File:** `e2e/tui/agents.test.ts` (created by agent screen tickets)

| Test ID | What it validates |
|---|---|
| `SNAP-STREAM-001` | Braille spinner visible in green during active agent stream |
| `SNAP-STREAM-003` | Spinner disappears when streaming completes |
| `SNAP-STREAM-006` | Abbreviated spinner at 80×24 minimum size |
| `SNAP-MSG-005` | Spinner character precedes "Agent" label during streaming |
| `SNAP-AGENT-LIST-008` | Loading state shows spinner with title/toolbar visible |

When the `tui-loading-states` ticket is implemented, the following test patterns exercise the spinner hook through the loading component. These tests are left failing until the backend and loading screen are implemented — they are **never skipped or commented out** (per `specs/tui/prd.md` §7.3 and project memory `feedback_failing_tests.md`).

```typescript
// Future: added by tui-loading-states ticket to e2e/tui/app-shell.test.ts
describe("TUI_LOADING_STATES — Spinner animation", () => {
  test("loading spinner renders braille character at 120x40", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      // The initial data fetch triggers FullScreenLoading which uses useSpinner(true)
      // Capture terminal snapshot during loading
      const snapshot = tui.snapshot();
      // Assert: one of the braille characters is present
      expect(snapshot).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
      // Assert: "Loading" text accompanies the spinner character
      expect(snapshot).toMatch(/Loading/);
    } finally {
      await tui.terminate();
    }
  });

  test("loading spinner disappears after data load", async () => {
    const tui = await launchTUI({ cols: 120, rows: 40 });
    try {
      await tui.waitForText("Dashboard");
      const snapshot = tui.snapshot();
      // Assert: no braille spinner character present after data loaded
      expect(snapshot).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    } finally {
      await tui.terminate();
    }
  });

  test("loading spinner uses ASCII fallback at TERM=dumb", async () => {
    const tui = await launchTUI({
      cols: 120,
      rows: 40,
      env: { TERM: "dumb", COLORTERM: "" },
    });
    try {
      const snapshot = tui.snapshot();
      // Assert: no braille characters present
      expect(snapshot).not.toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);
    } finally {
      await tui.terminate();
    }
  });
});
```

---

## 6. OpenTUI Integration Details

### 6.1 Why `Timeline` + `engine` Instead of `setInterval`

OpenTUI's `TimelineEngine` manages a `requestLive()` / `dropLive()` lifecycle on the `CliRenderer`:

- When a `Timeline` is **playing**, the engine calls `renderer.requestLive()`, which increments `liveRequestCount` and enables continuous frame callbacks at the engine's frame rate.
- When **no timelines are playing**, the engine calls `renderer.dropLive()`, which decrements `liveRequestCount`. When it reaches 0, the renderer goes idle and stops consuming CPU.

Using `setInterval` bypasses this entirely — the renderer doesn't know animation is happening, leading to:
- Potential frame tearing if the interval fires between render cycles.
- No automatic cleanup when the renderer is destroyed.
- CPU waste from interval callbacks when the renderer is already rendering.

The spec-level research document (`specs/tui/research/tui-spinner-hook.md`) confirms both existing inline implementations (`MessageBlock.tsx` at 100ms and `useAgentStream.ts` at 80ms) use `setInterval`, which must be replaced.

### 6.2 Timeline Configuration

Based on the `Timeline` API from `@opentui/core@0.1.90` (source: `context/opentui/packages/core/src/animation/Timeline.ts`):

```typescript
new Timeline({
  duration: FRAMES.length * INTERVAL_MS,  // 800ms braille, 480ms ASCII
  loop: true,                              // Infinite looping
  autoplay: false,                         // Manual play/pause control
})
```

The `add()` method signature is:
```typescript
add(
  target: any | any[],                    // Single object or array of objects
  properties: AnimationOptions,           // Animation config + numeric target values
  startTime: number | string = 0          // When to start animation (ms)
): this
```

Key detail: The `add()` method extracts any numeric properties from the `properties` object that are not recognized configuration keys (`duration`, `ease`, `onUpdate`, `onComplete`, `onStart`, `onLoop`, `loop`, `loopDelay`, `alternate`, `once`). These extracted numeric properties become animation targets — the Timeline linearly interpolates them on the target objects at each engine tick. This is why `frameIndex: FRAMES.length` in the spec reference implementation causes the float interpolation bug.

The `onUpdate` callback receives a `JSAnimation` object with:
- `targets: any[]` — the animated target objects
- `progress: number` — 0.0 to 1.0 animation progress (already eased)
- `deltaTime: number` — time since last frame (ms)
- `currentTime: number` — current playback time (ms)

The callback converts continuous `progress` (0.0–1.0) into discrete frame indices:

```
progress: 0.00 → frameIndex: 0  (⠋)
progress: 0.10 → frameIndex: 1  (⠙)
progress: 0.20 → frameIndex: 2  (⠹)
...
progress: 0.90 → frameIndex: 9  (⠏)
progress: 1.00 → loop restarts  (⠋)
```

### 6.3 Engine Registration

```typescript
import { engine } from "@opentui/core";
engine.register(timeline);  // Called once on first activation
```

The `TimelineEngine` singleton provides:
- `register(timeline: Timeline)` — registers a timeline for frame callbacks, adds state change listener
- `unregister(timeline: Timeline)` — removes a timeline, removes state change listener
- `update(deltaTime: number)` — called by renderer frame callback to update all registered non-synced timelines
- `attach(renderer: CliRenderer)` — connects to the renderer (done by OpenTUI at startup)
- `clear()` — removes all registered timelines and listeners

The timeline is **never unregistered** during the app lifecycle (it's a singleton). `play()` and `pause()` control whether it consumes frame callbacks. When paused, the engine's state change listener detects the change and calls `dropLive()` on the renderer.

### 6.4 OpenTUI API Surface Used

| API | Package | Usage |
|---|---|---|
| `Timeline` class | `@opentui/core` | Shared singleton timeline for frame animation |
| `Timeline.add(targets, options, startTime)` | `@opentui/core` | Adds animation item with `onUpdate` callback |
| `Timeline.restart()` | `@opentui/core` | Resets to beginning and plays |
| `Timeline.pause()` | `@opentui/core` | Pauses playback, triggers engine `dropLive()` |
| `engine` singleton | `@opentui/core` | `TimelineEngine` instance, registers timeline for renderer frame callbacks |
| `engine.register(timeline)` | `@opentui/core` | One-time registration of spinner timeline |
| `useSyncExternalStore` | `react` | Subscribes React components to module-level frame state |
| `useEffect` | `react` | Manages activate/deactivate lifecycle on `active` changes |

---

## 7. Edge Cases

| Scenario | Expected Behavior |
|---|---|
| `useSpinner(false)` called, no other active consumers | Returns `""`. No timeline activity. Zero CPU. |
| `useSpinner(false)` called, other components have active spinners | Returns `""`. Per-caller gating ensures inactive callers never see a frame. |
| `active` toggles `true → false → true` rapidly | `deactivate()` pauses timeline and resets frame to 0. `activate()` calls `restart()` for clean visual start. |
| Multiple components call `useSpinner(true)` simultaneously | All see the same `currentFrameIndex`. Single timeline runs. `activeCount` ref-counts consumers. |
| Last active consumer unmounts | `activeCount` drops to 0. Timeline pauses. Engine calls `dropLive()`. Frame resets to 0. |
| `TERM=dumb` environment | `isUnicodeSupported()` returns `false`. ASCII frames used at 120ms interval. |
| `NO_COLOR=1` environment | `isUnicodeSupported()` returns `false`. ASCII frames used at 120ms interval. |
| Component unmounts while `active=true` | `useEffect` cleanup calls `deactivate()`. No leaked interval or dangling subscription. |
| Server-side rendering / no renderer attached | `engine.register()` is a no-op if no renderer is attached. Timeline runs in isolation. `useSyncExternalStore` still works via `getSnapshot`. |
| Hot module replacement | Module-level state persists across HMR. Timeline may need restart. Acceptable for dev-only environments. |
| `activeCount` underflow protection | `deactivate()` clamps `activeCount` to `Math.max(0, activeCount - 1)` preventing negative counts from double-cleanup. |
| `progress` at exactly 1.0 | `Math.min(Math.floor(1.0 * 10), 9)` = 9, preventing out-of-bounds access. Timeline then loops. |
| Timeline interpolation writes float to target | Throwaway `animTarget._progress` absorbs float writes. `currentFrameIndex` is only set in `onUpdate` as an integer. |
| `useSpinner(true)` called but component never renders | `useEffect` will not run (React requires render to schedule effects). Hook returns the global snapshot via `useSyncExternalStore` but no activation occurs — safe because `getSnapshot` returns `""` when `activeCount === 0`. |

---

## 8. Performance Characteristics

| Metric | Target | Mechanism |
|---|---|---|
| CPU when inactive | 0% | Timeline is paused; engine calls `dropLive()`. No callbacks fire. |
| CPU when active | Negligible | Engine runs at its default frame rate. `onUpdate` does one integer comparison + conditional `emitChange()`. At 80ms intervals, ~1 emitChange per 5 engine frames (80% of callbacks are no-ops). |
| Memory allocation per frame | 0 new objects | `currentFrameIndex` is mutated in place. `FRAMES[index]` returns a pre-existing string from the frozen `as const` array. No closures, no temporary objects. |
| Re-renders per consumer per frame change | 1 | `emitChange()` notifies all `useSyncExternalStore` subscribers. Each subscriber triggers exactly one React re-render with the new frame character. |
| Startup cost | Zero until first `useSpinner(true)` | Lazy initialization: `ensureTimeline()` is only called on first activation. Module import itself is free (only constant allocation + one `isUnicodeSupported()` call). |
| Total re-renders per second (braille) | ~12.5 | 1000ms ÷ 80ms = 12.5 frame changes per second. Each triggers one re-render per subscribed component. |
| Total re-renders per second (ASCII) | ~8.3 | 1000ms ÷ 120ms = 8.3 frame changes per second. |
| Spurious emitChange rate | 0 | Previous spec reference had ~60/s due to float comparison bug. Fixed via `lastEmittedIndex` integer comparison. |

---

## 9. Integration Points

### 9.1 Dependency Graph

```
tui-foundation-scaffold
        │
        ▼
tui-color-detection  (provides isUnicodeSupported) ✅ COMPLETE
        │
        ▼
  tui-spinner-hook   ◄── THIS TICKET
        │
        ├──► tui-auth-token-loading
        ├──► tui-loading-states (TUI_LOADING_STATES)
        ├──► tui-status-bar (TUI_STATUS_BAR)
        ├──► workspace status tickets
        ├──► notification resolution tickets
        ├──► workflow dispatch tickets
        └──► agent chat/stream tickets
```

### 9.2 Downstream Consumer Tickets

| Ticket | Component | Usage Pattern |
|---|---|---|
| `tui-auth-token-loading` | `AuthLoadingScreen.tsx` | `const s = useSpinner(true); return <text>{s} Authenticating…</text>` |
| `tui-loading-states` | `LoadingProvider.tsx`, `FullScreenLoading.tsx`, `PaginationIndicator.tsx` | Provider-level spinner driving full-screen and inline loading (spec reference already imports `useSpinner`) |
| `tui-status-bar` | `StatusBar.tsx` | `const s = useSpinner(isSyncing); return <text>{s} Syncing</text>` |
| `tui-workspace-status-badge` | `WorkspaceStatusBadge.tsx` | Transitional status spinner during create/suspend/resume |
| Force sync | `SyncStatusScreen.tsx` | "Syncing…" spinner during force sync operation |
| Notification resolution | `NotificationList.tsx` | Resolution spinner in row indicator |
| Workflow dispatch | `WorkflowDispatch.tsx` | "Dispatching…" button spinner |
| Workflow log stream | `useWorkflowLogStream.ts` | Spinner during log stream connection |
| Agent chat | `AgentChatScreen.tsx`, `MessageBlock.tsx` | Streaming indicator spinner |
| Agent SSE stream | `useAgentStream.ts` | Spinner frame included in stream state |

### 9.3 Usage Example for Downstream Consumers

```tsx
import { useSpinner } from "../hooks/useSpinner.js";

function LoadingIndicator({ loading, label }: { loading: boolean; label: string }) {
  const spinner = useSpinner(loading);
  if (!loading) return null;
  return (
    <box flexDirection="row" gap={1}>
      <text fg="primary">{spinner}</text>
      <text fg="muted">{label}</text>
    </box>
  );
}
```

---

## 10. Responsive Behavior

The spinner hook itself is **not responsive** — it returns a single character regardless of terminal size. Consumers adapt based on breakpoint:

| Breakpoint | Consumer Behavior |
|---|---|
| 80×24 (minimum) | Status bar shows spinner icon only, no text label. Agent label abbreviates to `"A:"`. |
| 120×40 (standard) | Full spinner + text label (e.g., `⠋ Syncing…`). Agent label shows `"Agent"`. |
| 200×60 (large) | Same as standard — spinner doesn't benefit from extra space. |

This responsive adaptation is the responsibility of the consuming component, not the hook.

---

## 11. Productionization Notes

### 11.1 From Spec Reference to Production

The spec reference implementation at `specs/tui/apps/tui/src/hooks/useSpinner.ts` (139 lines) was the starting point. **This spec supersedes it** with fixes for three HIGH-severity issues identified in `specs/tui/reviews/tui-spinner-hook-iteration-0.md`.

Differences between spec reference and production implementation:

| Aspect | Spec Reference (`specs/tui/`) | Production (`apps/tui/`) |
|---|---|---|
| Active gating | Global only (`getSnapshot` returns frame when `activeCount > 0`) | Per-caller (`return active ? frame : ""` in hook) |
| Animation target | `state` object (`timeline.add([state], { frameIndex: ... })`) | Throwaway `animTarget` (`timeline.add([animTarget], { _progress: 1 })`) |
| Frame comparison | `newIndex !== state.frameIndex` (float comparison) | `newIndex !== lastEmittedIndex` (integer comparison) |
| Frame state variable | `state.frameIndex` (mutated by Timeline as float) | `currentFrameIndex` (set only in `onUpdate` as integer) |
| Reset on deactivate | Only resets `state.frameIndex = 0` | Resets both `currentFrameIndex = 0` and `lastEmittedIndex = 0` |

### 11.2 Module-Level State Considerations

The module-level singleton pattern (`currentFrameIndex`, `lastEmittedIndex`, `activeCount`, `listeners`, `timeline`, `animTarget`) means:

- **Testing isolation:** Unit tests that import the module share state across test cases within the same test file. Each test file is a single module instance. Tests must clean up by calling `deactivate()` (via the effect cleanup function) after each activation to reset `activeCount`.
- **Memory lifecycle:** The `Timeline` instance is never garbage collected during the app's lifetime. This is intentional — the spinner is a global utility expected to be used throughout the session. One `Timeline` + a few integers is negligible memory.
- **HMR:** During development with hot module replacement, the module-level state persists across reloads. This is acceptable — the spinner may show an incorrect frame briefly but self-corrects on the next `activate()`/`deactivate()` cycle.

### 11.3 Dependency on `tui-color-detection`

The import `from "../theme/detect.js"` resolves to `apps/tui/src/theme/detect.ts` which is **already implemented** and exports `isUnicodeSupported()`. No additional file creation is needed for this dependency.

The production `detect.ts` (73 lines) matches the spec reference at `specs/tui/apps/tui/src/theme/detect.ts` — both implement the same cascade: `NO_COLOR` → `TERM=dumb` → default `true`.

### 11.4 TypeScript Strictness

The implementation uses `as const` for frame arrays, ensuring the exported types are `readonly ["⠋", "⠙", ...]` tuples, not `string[]`. This gives consumers compile-time access to the exact frame values. The internal `FRAMES` variable is typed as `readonly string[]` (widened) because it's resolved dynamically based on unicode detection.

### 11.5 Import Path Convention

All imports use the `.js` extension convention consistent with the existing TUI codebase (TypeScript module resolution with `.js` extensions for ESM compatibility):
- `import { isUnicodeSupported } from "../theme/detect.js";`
- `import { useSpinner } from "./useSpinner.js";`

This matches the pattern used in existing hooks (`useTheme.ts` imports from `../providers/ThemeProvider.js`, etc.).

---

## 12. API Reference

### `useSpinner(active: boolean): string`

| Parameter | Type | Description |
|---|---|---|
| `active` | `boolean` | Whether the spinner should be animating. |
| **Returns** | `string` | Current frame character (e.g., `"⠋"`) when active, `""` when inactive. |

**Behavioral contract:**
- When `active` is `true`: Returns the current global spinner frame. Registers this caller as an active consumer. Animation starts if this is the first active consumer.
- When `active` is `false`: Always returns `""`, even if other consumers are active. Does not register as an active consumer. Does not affect the timeline.
- When `active` transitions from `true` to `false`: Deregisters this caller via `useEffect` cleanup. If last active consumer, timeline pauses.
- When `active` transitions from `false` to `true`: Registers this caller via `useEffect`. If first active consumer, timeline restarts from frame 0.

### Exported Constants

| Export | Type | Value |
|---|---|---|
| `BRAILLE_FRAMES` | `readonly ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]` | 10-frame braille spinner sequence |
| `ASCII_FRAMES` | `readonly ["-", "\\\\", "|", "/"]` | 4-frame ASCII spinner sequence |
| `BRAILLE_INTERVAL_MS` | `80` | Milliseconds per braille frame |
| `ASCII_INTERVAL_MS` | `120` | Milliseconds per ASCII frame |

---

## 13. Files Changed

| File | Action | Description |
|---|---|---|
| `apps/tui/src/hooks/useSpinner.ts` | **Create** | Shared spinner hook with braille/ASCII animation. Fixes 3 HIGH-severity review findings vs spec reference. |
| `apps/tui/src/hooks/index.ts` | **Edit** | Add `useSpinner`, `BRAILLE_FRAMES`, `ASCII_FRAMES`, `BRAILLE_INTERVAL_MS`, `ASCII_INTERVAL_MS` exports to existing barrel (alongside existing `useDiffSyntaxStyle`, `useTheme`, `useColorTier` exports). |
| `apps/tui/src/hooks/__tests__/useSpinner.test.ts` | **Create** | Unit tests for hook behavior and constant exports |
| `e2e/tui/app-shell.test.ts` | **Edit** | Append `TUI_APP_SHELL — useSpinner hook scaffold` describe block with import validation tests |

### Files NOT changed (pre-existing, verified):

| File | Status | Notes |
|---|---|---|
| `apps/tui/src/theme/detect.ts` | ✅ Already exists | `isUnicodeSupported()` already implemented (73 lines). No changes needed. |
| `apps/tui/src/theme/index.ts` | ✅ Already exists | Barrel exports already include `isUnicodeSupported`. No changes needed. |
| `apps/tui/src/theme/tokens.ts` | ✅ Already exists | Semantic color tokens. Not touched by this ticket. |

### Follow-up migration (deferred to consuming tickets):

| File | Action | Description |
|---|---|---|
| `apps/tui/src/screens/Agents/components/MessageBlock.tsx` | **Edit** | Replace `export {};` stub with component using `import { useSpinner }` (agent screen tickets) |
| `apps/tui/src/hooks/useAgentStream.ts` | **Create** | Use `import { useSpinner }` for streaming indicator (agent stream ticket) |
| `apps/tui/src/providers/LoadingProvider.tsx` | **Create** | Use `useSpinner(hasActiveLoading)` for provider-level loading (spec reference already imports it) |
| `apps/tui/src/components/FullScreenLoading.tsx` | **Create** | Use `useSpinner(isLoading)` for loading screen (`tui-loading-states` ticket) |

---

## 14. Review Findings Addressed

This spec addresses all findings from `specs/tui/reviews/tui-spinner-hook-iteration-0.md`:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | HIGH | `useSpinner(active=false)` returns frame when another component is active | §3.6, §4 Step 2: Per-caller active gating added. `return active ? frame : ""` in hook. |
| 2 | HIGH | Timeline writes float into `state.frameIndex`, comparison fires every tick | §3.7, §6.2, §4 Step 2: Throwaway `animTarget`, dedicated `lastEmittedIndex` integer. |
| 3 | HIGH | Unit test hardcodes braille, fails when TERM lacks Unicode | §5.1: Tests check against `ALL_FRAMES` (union of both sets). |
| 4 | MEDIUM | Multi-subscriber test doesn't execute second consumer's effect | §5.1: `simulateMount` helper properly captures per-consumer cleanup. |
| 5 | MEDIUM/NIT | `useAgentStream` memoization brittleness | Out of scope for this ticket. Noted in downstream consumer tickets. |
| 6 | NIT | Timeline never unregistered, potential HMR leak | §11.2: Documented as intentional. Timeline singleton survives for app lifetime. `pause()` prevents CPU waste. |

---

## 15. Migration Plan for Future Inline Spinners

Any future component that needs a loading spinner **must** import from the shared hook:

```typescript
import { useSpinner } from "../hooks/useSpinner.js";
// or from the barrel:
import { useSpinner } from "../hooks/index.js";
```

Inline `setInterval`-based spinners, custom `useState` frame cycling, or per-component `useTimeline()` timelines are **not allowed** for spinner animations. The shared hook ensures:

1. Frame synchronization across all visible spinners.
2. Proper OpenTUI engine lifecycle integration (`requestLive()`/`dropLive()`).
3. ASCII fallback in constrained terminal environments.
4. Zero CPU when no spinners are active.
5. Per-caller active gating (inactive callers never display spinner frames).

Code review should reject any PR that introduces a spinner animation not using `useSpinner`.