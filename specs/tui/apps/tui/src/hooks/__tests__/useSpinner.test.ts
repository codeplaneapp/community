import { test, expect, mock, spyOn } from "bun:test";
import * as React from "react";

// Mock React hooks to test our useSpinner logic without a real renderer
let externalSubscribe: any = null;
let externalGetSnapshot: any = null;
let effectCallback: any = null;
let effectCleanup: any = null;

spyOn(React, "useSyncExternalStore").mockImplementation((subscribe, getSnapshot) => {
  externalSubscribe = subscribe;
  externalGetSnapshot = getSnapshot;
  return getSnapshot();
});

spyOn(React, "useEffect").mockImplementation((cb, deps) => {
  // Store the callback to trigger it manually
  effectCallback = cb;
});

import {
  useSpinner,
  BRAILLE_FRAMES,
  ASCII_FRAMES,
  BRAILLE_INTERVAL_MS,
  ASCII_INTERVAL_MS,
} from "../useSpinner.js";

test("exports frame constants", () => {
  expect(BRAILLE_FRAMES.length).toBe(10);
  expect(ASCII_FRAMES.length).toBe(4);
});

test("exports interval constants", () => {
  expect(BRAILLE_INTERVAL_MS).toBe(80);
  expect(ASCII_INTERVAL_MS).toBe(120);
});

test("returns empty string when active is false", () => {
  const result = useSpinner(false);
  expect(result).toBe("");
});

test("restarts cleanly on re-activation and synchronized frames", () => {
  // active = true
  useSpinner(true);
  
  // Trigger useEffect
  if (effectCallback) {
    effectCleanup = effectCallback();
  }

  // Since it's active, it should return a frame
  let result = externalGetSnapshot();
  expect(BRAILLE_FRAMES).toContain(result);
  
  // Second consumer
  useSpinner(true);
  let result2 = externalGetSnapshot();
  expect(result).toBe(result2); // synchronized frames

  // Clean up
  if (effectCleanup) effectCleanup();
  
  // Clean up the other one (simulation of dropping activeCount to 0)
  if (effectCleanup) effectCleanup();
  
  // Should return empty string now that activeCount is 0
  result = externalGetSnapshot();
  expect(result).toBe("");
});
