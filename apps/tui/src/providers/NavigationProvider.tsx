import {
  createContext,
  useCallback,
  useMemo,
  useState,
} from "react";
import type {
  NavigationContextType,
  NavigationProviderProps,
  ScreenEntry,
} from "../router/types.js";
import {
  DEFAULT_ROOT_SCREEN,
  MAX_STACK_DEPTH,
  screenEntriesEqual,
} from "../router/types.js";

export const NavigationContext = createContext<NavigationContextType | null>(null);

function normalizeParams(
  params?: Record<string, string>,
): Record<string, string> | undefined {
  if (!params) {
    return undefined;
  }

  const keys = Object.keys(params);
  if (keys.length === 0) {
    return undefined;
  }

  return { ...params };
}

export function createScreenEntry(
  screen: string,
  params?: Record<string, string>,
): ScreenEntry {
  return {
    id: crypto.randomUUID(),
    screen,
    params: normalizeParams(params),
  };
}

export function pushStack(
  prev: readonly ScreenEntry[],
  screen: string,
  params?: Record<string, string>,
): ScreenEntry[] {
  const top = prev[prev.length - 1];
  if (top && screenEntriesEqual(top, { screen, params })) {
    return prev as ScreenEntry[];
  }

  const next = [...prev, createScreenEntry(screen, params)];
  if (next.length > MAX_STACK_DEPTH) {
    return next.slice(next.length - MAX_STACK_DEPTH);
  }

  return next;
}

export function popStack(prev: readonly ScreenEntry[]): ScreenEntry[] {
  if (prev.length <= 1) {
    return prev as ScreenEntry[];
  }

  return prev.slice(0, -1);
}

export function replaceStack(
  prev: readonly ScreenEntry[],
  screen: string,
  params?: Record<string, string>,
): ScreenEntry[] {
  const nextEntry = createScreenEntry(screen, params);
  if (prev.length <= 1) {
    return [nextEntry];
  }

  return [...prev.slice(0, -1), nextEntry];
}

export function resetStack(
  screen: string,
  params?: Record<string, string>,
): ScreenEntry[] {
  return [createScreenEntry(screen, params)];
}

export function NavigationProvider({
  initialScreen = DEFAULT_ROOT_SCREEN,
  initialParams,
  initialStack,
  children,
}: NavigationProviderProps) {
  const [stack, setStack] = useState<ScreenEntry[]>(() => {
    if (initialStack && initialStack.length > 0) {
      const capped = initialStack.slice(-MAX_STACK_DEPTH);
      return capped.map((entry) => createScreenEntry(entry.screen, entry.params));
    }

    return [createScreenEntry(initialScreen, initialParams)];
  });

  const push = useCallback((screen: string, params?: Record<string, string>) => {
    const normalizedParams = normalizeParams(params);
    setStack((prev) => pushStack(prev, screen, normalizedParams));
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => popStack(prev));
  }, []);

  const replace = useCallback((screen: string, params?: Record<string, string>) => {
    const normalizedParams = normalizeParams(params);
    setStack((prev) => replaceStack(prev, screen, normalizedParams));
  }, []);

  const reset = useCallback((screen: string, params?: Record<string, string>) => {
    const normalizedParams = normalizeParams(params);
    setStack(resetStack(screen, normalizedParams));
  }, []);

  const current = stack[stack.length - 1];
  const canPop = useCallback(() => stack.length > 1, [stack.length]);

  const contextValue = useMemo<NavigationContextType>(
    () => ({
      push,
      pop,
      replace,
      reset,
      canPop,
      stack,
      current,
    }),
    [push, pop, replace, reset, canPop, stack, current],
  );

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
}
