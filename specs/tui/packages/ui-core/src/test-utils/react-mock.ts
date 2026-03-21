import type { APIClient } from "../client/types.js";
import { APIClientProvider } from "../client/context.js";

// A mini hook environment since we don't have react-test-renderer.
export const state = {
  currentHookIndex: 0,
  hooks: [] as any[],
  effects: [] as Array<() => void | (() => void)>,
  unmounts: [] as Array<() => void>,
  pendingStateUpdates: false,
  resolveUpdate: null as (() => void) | null,
  currentContextValue: null as any
};

export const ReactMock = {
  useState<T>(initialValue: T | (() => T)): [T, (val: T | ((prev: T) => T)) => void] {
    const idx = state.currentHookIndex++;
    if (state.hooks.length <= idx) {
      state.hooks[idx] = typeof initialValue === "function" ? (initialValue as any)() : initialValue;
    }
    const setState = (newVal: any) => {
      const prev = state.hooks[idx];
      const next = typeof newVal === "function" ? newVal(prev) : newVal;
      if (prev !== next) {
        state.hooks[idx] = next;
        state.pendingStateUpdates = true;
        if (state.resolveUpdate) {
          state.resolveUpdate();
          state.resolveUpdate = null;
        }
      }
    };
    return [state.hooks[idx], setState];
  },
  useEffect(effect: () => void | (() => void), deps?: any[]) {
    const idx = state.currentHookIndex++;
    const prevDeps = state.hooks[idx];
    
    let hasChanged = true;
    if (prevDeps && deps) {
      hasChanged = deps.length !== prevDeps.length || deps.some((d, i) => !Object.is(d, prevDeps[i]));
    }
    
    if (hasChanged) {
      state.hooks[idx] = deps;
      state.effects.push(effect);
    }
  },
  useRef<T>(initialValue: T): { current: T } {
    const idx = state.currentHookIndex++;
    if (state.hooks.length <= idx) {
      state.hooks[idx] = { current: initialValue };
    }
    return state.hooks[idx];
  },
  useCallback<T extends Function>(cb: T, deps: any[]): T {
    const idx = state.currentHookIndex++;
    const prev = state.hooks[idx];
    if (prev) {
      const [prevCb, prevDeps] = prev;
      const hasChanged = deps.length !== prevDeps.length || deps.some((d, i) => !Object.is(d, prevDeps[i]));
      if (!hasChanged) return prevCb;
    }
    state.hooks[idx] = [cb, deps];
    return cb;
  },
  useMemo<T>(factory: () => T, deps: any[]): T {
    const idx = state.currentHookIndex++;
    const prev = state.hooks[idx];
    if (prev) {
      const [prevVal, prevDeps] = prev;
      const hasChanged = deps.length !== prevDeps.length || deps.some((d, i) => !Object.is(d, prevDeps[i]));
      if (!hasChanged) return prevVal;
    }
    const val = factory();
    state.hooks[idx] = [val, deps];
    return val;
  },
  useContext(ctx: any): any {
    return state.currentContextValue;
  },
  createContext(val: any) {
    return { Provider: {} };
  }
};