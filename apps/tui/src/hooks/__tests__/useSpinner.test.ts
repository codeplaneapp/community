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
const ALL_FRAMES: string[] = [...BRAILLE_FRAMES, ...ASCII_FRAMES];

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
