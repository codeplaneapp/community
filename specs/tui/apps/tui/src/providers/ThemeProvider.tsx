import { createContext, useMemo } from "react";
import { detectColorCapability, type ColorTier } from "../theme/detect.js";
import { createTheme, type ThemeTokens } from "../theme/tokens.js";

/**
 * Internal context value shape.
 *
 * Components access this via useTheme() (for tokens) or useColorTier() (for tier).
 * The context is never exposed directly — always consumed through hooks.
 */
export interface ThemeContextValue {
  /** The frozen semantic color tokens resolved for the detected terminal capability. */
  readonly tokens: Readonly<ThemeTokens>;
  /** The detected terminal color capability tier. */
  readonly colorTier: ColorTier;
}

/**
 * React context for the theme system.
 *
 * Default value is `null` — hooks throw if used outside the provider.
 * This ensures misuse is caught early with a clear error message.
 */
export const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * ThemeProvider — provides resolved color tokens to the entire TUI component tree.
 *
 * On mount:
 * 1. Calls detectColorCapability() to determine the terminal's color tier.
 * 2. Calls createTheme(tier) to get the frozen ThemeTokens object.
 * 3. Stores both in a memoized context value that never changes.
 *
 * The provider renders no layout nodes — it is a pure context wrapper.
 * Children are passed through without any wrapping box or text nodes.
 *
 * Single dark theme only. No user-supplied themes. No runtime switching.
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <AppShell />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.ReactNode {
  // Detection and theme creation happen once. useMemo with [] deps ensures
  // this runs exactly once per provider mount. Since detectColorCapability()
  // reads process.env (which doesn't change during a TUI session) and
  // createTheme() returns a pre-allocated frozen singleton, this is safe.
  const contextValue = useMemo<ThemeContextValue>(() => {
    const colorTier = detectColorCapability();
    const tokens = createTheme(colorTier);
    return { tokens, colorTier };
  }, []);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}
