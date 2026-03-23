import { createContext, useContext, useState, useRef, useMemo } from "react";
import type { ScreenEntry, NavigationContext as INavigationContext } from "../router/types.js";
import { ScreenName, MAX_STACK_DEPTH, DEFAULT_ROOT_SCREEN } from "../router/types.js";
import { screenRegistry } from "../router/registry.js";

export const NavigationContext = createContext<INavigationContext | null>(null);

export interface NavigationProviderProps {
  /** Pre-built initial stack for deep-link launch. */
  initialStack?: ScreenEntry[];
  /** Initial screen to render if no initialStack. Defaults to Dashboard. */
  initialScreen?: ScreenName;
  /** Initial params for the initial screen. */
  initialParams?: Record<string, string>;
  children: React.ReactNode;
}

export function createEntry(
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

export function NavigationProvider({
  initialStack,
  initialScreen,
  initialParams,
  children,
}: NavigationProviderProps) {
  const [stack, setStack] = useState<ScreenEntry[]>(() => {
    if (initialStack && initialStack.length > 0) {
      return initialStack;
    }
    return [createEntry(initialScreen || DEFAULT_ROOT_SCREEN, initialParams)];
  });

  const scrollCacheRef = useRef<Map<string, number>>(new Map());

  const push = (screen: ScreenName, params: Record<string, string> = {}) => {
    setStack((prev) => {
      const top = prev[prev.length - 1];

      let resolvedParams = { ...params };

      const definition = screenRegistry[screen];
      if (definition.requiresRepo && !resolvedParams.owner && !resolvedParams.repo) {
        const rc = extractRepoContext(prev);
        if (rc) {
          resolvedParams.owner = rc.owner;
          resolvedParams.repo = rc.repo;
        }
      }

      if (definition.requiresOrg && !resolvedParams.org) {
        const oc = extractOrgContext(prev);
        if (oc) {
          resolvedParams.org = oc.org;
        }
      }

      // Duplicate prevention
      if (top.screen === screen) {
        const topKeys = Object.keys(top.params).sort();
        const newKeys = Object.keys(resolvedParams).sort();
        if (topKeys.length === newKeys.length) {
          const same = topKeys.every((k) => top.params[k] === resolvedParams[k]);
          if (same) return prev;
        }
      }

      const entry = createEntry(screen, resolvedParams);
      const next = [...prev, entry];
      if (next.length > MAX_STACK_DEPTH) {
        return next.slice(next.length - MAX_STACK_DEPTH);
      }
      return next;
    });
  };

  const pop = () => {
    setStack((prev) => {
      if (prev.length <= 1) return prev;
      const popped = prev[prev.length - 1];
      scrollCacheRef.current.delete(popped.id);
      return prev.slice(0, -1);
    });
  };

  const replace = (screen: ScreenName, params: Record<string, string> = {}) => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const popped = prev[prev.length - 1];
      scrollCacheRef.current.delete(popped.id);

      let resolvedParams = { ...params };
      const definition = screenRegistry[screen];
      if (definition.requiresRepo && !resolvedParams.owner && !resolvedParams.repo) {
        const rc = extractRepoContext(prev.slice(0, -1));
        if (rc) {
          resolvedParams.owner = rc.owner;
          resolvedParams.repo = rc.repo;
        }
      }

      if (definition.requiresOrg && !resolvedParams.org) {
        const oc = extractOrgContext(prev.slice(0, -1));
        if (oc) {
          resolvedParams.org = oc.org;
        }
      }

      const entry = createEntry(screen, resolvedParams);
      return [...prev.slice(0, -1), entry];
    });
  };

  const reset = (screen: ScreenName, params: Record<string, string> = {}) => {
    setStack(() => {
      scrollCacheRef.current.clear();
      return [createEntry(screen, params)];
    });
  };

  const contextValue = useMemo<INavigationContext>(() => {
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
      saveScrollPosition: (entryId: string, position: number) => {
        scrollCacheRef.current.set(entryId, position);
      },
      getScrollPosition: (entryId: string) => {
        return scrollCacheRef.current.get(entryId);
      },
    };
  }, [stack]);

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
}

function extractRepoContext(stack: readonly ScreenEntry[]): { owner: string; repo: string } | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const p = stack[i].params;
    if (p && p.owner && p.repo) {
      return { owner: p.owner, repo: p.repo };
    }
  }
  return null;
}

function extractOrgContext(stack: readonly ScreenEntry[]): { org: string } | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const p = stack[i].params;
    if (p && p.org) {
      return { org: p.org };
    }
  }
  return null;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within a NavigationProvider");
  return ctx;
}

export function useScrollPositionCache() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useScrollPositionCache must be used within a NavigationProvider");
  
  return {
    saveScrollPosition: ctx.saveScrollPosition,
    getScrollPosition: ctx.getScrollPosition,
  };
}
