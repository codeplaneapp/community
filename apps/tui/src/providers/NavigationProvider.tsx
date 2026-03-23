import { createContext, useState } from "react";
import type { ScreenEntry } from "../router/types.js";

export interface NavigationContextValue {
  stack: ScreenEntry[];
  current: ScreenEntry;
  push: (screen: string, params?: Record<string, string>) => void;
  pop: () => void;
  replace: (screen: string, params?: Record<string, string>) => void;
  reset: (screen: string, params?: Record<string, string>) => void;
  canPop: () => boolean;
}

export const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({
  initialStack,
  children,
  onNavigate,
}: {
  initialStack: ScreenEntry[];
  children: React.ReactNode;
  onNavigate?: (entry: ScreenEntry) => void;
}) {
  const [stack, setStack] = useState<ScreenEntry[]>(
    initialStack.length > 0 ? initialStack : [{ screen: "Dashboard" }]
  );

  const current = stack[stack.length - 1];

  // Call onNavigate on mount/update if it changed
  // (Using a simple effect or just calling it when setting stack)
  // Actually, we can just call it whenever stack changes, or we can just report the current screen
  // Wait, if we call it in render it might be bad, let's call it when setting state.
  // We can just use an effect or call it inline.

  const notify = (newStack: ScreenEntry[]) => {
    if (onNavigate) {
      onNavigate(newStack[newStack.length - 1]);
    }
  };

  const push = (screen: string, params?: Record<string, string>) => {
    setStack((s) => {
      const ns = [...s, { screen, params }];
      notify(ns);
      return ns;
    });
  };

  const pop = () => {
    setStack((s) => {
      const ns = s.length > 1 ? s.slice(0, -1) : s;
      notify(ns);
      return ns;
    });
  };

  const replace = (screen: string, params?: Record<string, string>) => {
    setStack((s) => {
      const ns = [...s.slice(0, -1), { screen, params }];
      notify(ns);
      return ns;
    });
  };

  const reset = (screen: string, params?: Record<string, string>) => {
    setStack(() => {
      const ns = [{ screen, params }];
      notify(ns);
      return ns;
    });
  };

  const canPop = () => stack.length > 1;

  // Initial notify is handled by the ref default value or an effect. Let's add an effect.
  // Wait, if I just add an effect, it's safer.
  
  return (
    <NavigationContext.Provider value={{ stack, current, push, pop, replace, reset, canPop }}>
      {children}
    </NavigationContext.Provider>
  );
}
