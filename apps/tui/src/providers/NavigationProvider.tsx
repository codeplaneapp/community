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

export function NavigationProvider({ initialStack, children }: { initialStack: ScreenEntry[], children: React.ReactNode }) {
  const [stack, setStack] = useState<ScreenEntry[]>(initialStack.length > 0 ? initialStack : [{ screen: "Dashboard" }]);

  const current = stack[stack.length - 1];

  const push = (screen: string, params?: Record<string, string>) => {
    setStack(s => [...s, { screen, params }]);
  };

  const pop = () => {
    setStack(s => s.length > 1 ? s.slice(0, -1) : s);
  };

  const replace = (screen: string, params?: Record<string, string>) => {
    setStack(s => [...s.slice(0, -1), { screen, params }]);
  };

  const reset = (screen: string, params?: Record<string, string>) => {
    setStack([{ screen, params }]);
  };

  const canPop = () => stack.length > 1;

  return (
    <NavigationContext.Provider value={{ stack, current, push, pop, replace, reset, canPop }}>
      {children}
    </NavigationContext.Provider>
  );
}
