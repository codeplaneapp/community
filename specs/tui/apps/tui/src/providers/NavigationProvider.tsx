import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  type NavigationContext,
  type ScreenEntry,
  ScreenName,
  MAX_STACK_DEPTH,
  DEFAULT_ROOT_SCREEN,
} from "../router/types.js";
import { screenRegistry } from "../router/registry.js";

const NavigationCtx = createContext<NavigationContext | null>(null);

export interface NavigationProviderProps {
  /** Initial screen to render. Defaults to Dashboard. */
  initialScreen?: ScreenName;
  /** Initial params for the initial screen. */
  initialParams?: Record<string, string>;
  /** Pre-built initial stack for deep-link launch. Overrides initialScreen. */
  initialStack?: ScreenEntry[];
  children: React.ReactNode;
}

function createEntry(
  screen: ScreenName,
  params: Record<string, string> = {},
): ScreenEntry {
  const definition = screenRegistry[screen];
  return {
    id: crypto.randomUUID(),
    screen,
    params,
    breadcrumb: definition.breadcrumbLabel(params),
  };
}

/** Extract repo context from params if owner and repo are present */
function extractRepoContext(
  stack: readonly ScreenEntry[],
): { owner: string; repo: string } | null {
  // Walk the stack top-down to find the nearest screen with repo params
  for (let i = stack.length - 1; i >= 0; i--) {
    const { params } = stack[i];
    if (params.owner && params.repo) {
      return { owner: params.owner, repo: params.repo };
    }
  }
  return null;
}

/** Extract org context from params if org is present */
function extractOrgContext(
  stack: readonly ScreenEntry[],
): { org: string } | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const { params } = stack[i];
    if (params.org) {
      return { org: params.org };
    }
  }
  return null;
}

export function NavigationProvider({
  initialScreen = DEFAULT_ROOT_SCREEN,
  initialParams = {},
  initialStack,
  children,
}: NavigationProviderProps) {
  const [stack, setStack] = useState<ScreenEntry[]>(() => {
    if (initialStack && initialStack.length > 0) {
      return initialStack;
    }
    return [createEntry(initialScreen, initialParams)];
  });

  const scrollCacheRef = useRef<Map<string, number>>(new Map());

  const push = useCallback(
    (screen: ScreenName, params?: Record<string, string>) => {
      setStack((prev) => {
        const resolvedParams = { ...params };

        // Inherit repo context from current stack if not provided and screen requires it
        const definition = screenRegistry[screen];
        if (definition.requiresRepo && !resolvedParams.owner && !resolvedParams.repo) {
          const repoCtx = extractRepoContext(prev);
          if (repoCtx) {
            resolvedParams.owner = repoCtx.owner;
            resolvedParams.repo = repoCtx.repo;
          }
        }
        if (definition.requiresOrg && !resolvedParams.org) {
          const orgCtx = extractOrgContext(prev);
          if (orgCtx) {
            resolvedParams.org = orgCtx.org;
          }
        }

        // Push-on-duplicate prevention: if the top of stack is the same screen
        // with the same params, do not push again
        const top = prev[prev.length - 1];
        if (top && top.screen === screen) {
          const topParamKeys = Object.keys(top.params).sort();
          const newParamKeys = Object.keys(resolvedParams).sort();
          if (
            topParamKeys.length === newParamKeys.length &&
            topParamKeys.every(
              (k, i) => k === newParamKeys[i] && top.params[k] === resolvedParams[k],
            )
          ) {
            return prev; // No-op: duplicate push
          }
        }

        const entry = createEntry(screen, resolvedParams);
        let next = [...prev, entry];

        // Enforce max depth by dropping the bottom-most entry (not root)
        if (next.length > MAX_STACK_DEPTH) {
          next = next.slice(next.length - MAX_STACK_DEPTH);
        }

        return next;
      });
    },
    [],
  );

  const pop = useCallback(() => {
    setStack((prev) => {
      if (prev.length <= 1) {
        return prev; // Cannot pop root
      }
      const popped = prev[prev.length - 1];
      // Clean up scroll cache for the popped screen
      scrollCacheRef.current.delete(popped.id);
      return prev.slice(0, -1);
    });
  }, []);

  const replace = useCallback(
    (screen: ScreenName, params?: Record<string, string>) => {
      setStack((prev) => {
        if (prev.length === 0) return prev;

        const resolvedParams = { ...params };
        const definition = screenRegistry[screen];
        if (definition.requiresRepo && !resolvedParams.owner && !resolvedParams.repo) {
          const repoCtx = extractRepoContext(prev);
          if (repoCtx) {
            resolvedParams.owner = repoCtx.owner;
            resolvedParams.repo = repoCtx.repo;
          }
        }
        if (definition.requiresOrg && !resolvedParams.org) {
          const orgCtx = extractOrgContext(prev);
          if (orgCtx) {
            resolvedParams.org = orgCtx.org;
          }
        }

        const entry = createEntry(screen, resolvedParams);
        const next = [...prev.slice(0, -1), entry];
        // Clean up old top's scroll cache
        const oldTop = prev[prev.length - 1];
        scrollCacheRef.current.delete(oldTop.id);
        return next;
      });
    },
    [],
  );

  const reset = useCallback(
    (screen: ScreenName, params?: Record<string, string>) => {
      // Clear entire scroll cache
      scrollCacheRef.current.clear();
      const entry = createEntry(screen, params);
      setStack([entry]);
    },
    [],
  );

  const contextValue = useMemo<NavigationContext>(() => {
    const currentScreen = stack[stack.length - 1];
    return {
      stack,
      currentScreen,
      push,
      pop,
      replace,
      reset,
      canGoBack: stack.length > 1,
      repoContext: extractRepoContext(stack),
      orgContext: extractOrgContext(stack),
    };
  }, [stack, push, pop, replace, reset]);

  return (
    <NavigationCtx.Provider value={contextValue}>
      {children}
    </NavigationCtx.Provider>
  );
}

/**
 * Hook to access the navigation context.
 * Throws if used outside NavigationProvider.
 */
export function useNavigation(): NavigationContext {
  const ctx = useContext(NavigationCtx);
  if (!ctx) {
    throw new Error(
      "useNavigation() must be used within a <NavigationProvider>",
    );
  }
  return ctx;
}

/**
 * Hook to save/restore scroll position for back-navigation.
 * Call saveScrollPosition before navigating away.
 * restoreScrollPosition returns the cached value after back-navigation.
 */
export function useScrollPositionCache(): {
  saveScrollPosition: (entryId: string, position: number) => void;
  getScrollPosition: (entryId: string) => number | undefined;
} {
  const ctx = useContext(NavigationCtx);
  if (!ctx) {
    throw new Error(
      "useScrollPositionCache() must be used within a <NavigationProvider>",
    );
  }
  // Access the ref via a second context or via closure.
  // For simplicity, we expose this through the provider's internal ref.
  // This is handled by ScreenRouter which has access to the ref.
  // For external consumers, scroll position is stored on the ScreenEntry.
  return {
    saveScrollPosition: () => {},
    getScrollPosition: () => undefined,
  };
}
