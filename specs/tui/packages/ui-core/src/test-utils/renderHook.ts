import { mock } from "bun:test";
import { ReactMock } from "./react-mock.js";

mock.module("react", () => ({
  ...ReactMock,
  default: ReactMock,
}));

import type { APIClient } from "../client/types.js";

export interface RenderHookResult<T> {
  result: { current: T };
  rerender: (props?: Record<string, unknown>) => void;
  unmount: () => void;
  waitForNextUpdate: (timeoutMs?: number) => Promise<void>;
}

export interface RenderHookOptions {
  apiClient?: APIClient;
}

export function renderHook<T>(
  hookFn: () => T,
  options?: RenderHookOptions,
): RenderHookResult<T> {
  
  const { state } = require("./react-mock.js");
  
  // Reset context for this render
  state.currentHookIndex = 0;
  state.hooks = [];
  state.effects = [];
  state.unmounts = [];
  state.pendingStateUpdates = false;
  state.resolveUpdate = null;
  state.currentContextValue = options?.apiClient || null;
  
  const result: { current: T } = { current: undefined as any };

  function renderCycle() {
    state.pendingStateUpdates = false;
    state.currentHookIndex = 0;
    
    // Execute hook
    result.current = hookFn();
    
    // Process effects
    const currentEffects = state.effects;
    state.effects = []; // Clear for next render
    
    for (const effect of currentEffects) {
      const cleanup = effect();
      if (typeof cleanup === "function") {
        state.unmounts.push(cleanup);
      }
    }
    
    // If state was updated during render or effects, loop
    if (state.pendingStateUpdates) {
      renderCycle();
    }
  }

  // Initial render
  renderCycle();

  return {
    result,
    rerender: () => {
      renderCycle();
    },
    unmount: () => {
      for (const cleanup of state.unmounts) {
        cleanup();
      }
      state.unmounts = [];
      state.hooks = [];
    },
    waitForNextUpdate: async (timeoutMs = 1000) => {
      if (state.pendingStateUpdates) {
        renderCycle();
        return;
      }
      return new Promise<void>((resolve, reject) => {
        state.resolveUpdate = () => {
          renderCycle();
          resolve();
        };
        setTimeout(() => {
          reject(new Error("timed out waiting for next update"));
        }, timeoutMs);
      });
    },
  };
}