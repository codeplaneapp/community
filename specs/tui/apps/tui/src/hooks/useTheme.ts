import { useContext } from "react";
import { ThemeContext } from "../providers/ThemeProvider.js";
import type { ThemeTokens } from "../theme/tokens.js";

/**
 * Access the resolved semantic color tokens for the current terminal.
 *
 * Returns a frozen ThemeTokens object with RGBA values appropriate for
 * the detected terminal color capability (truecolor, ansi256, or ansi16).
 *
 * Must be called within a <ThemeProvider> descendant. Throws if used
 * outside the provider tree.
 *
 * The returned object is referentially stable — it never changes during
 * the lifetime of the TUI session. Components can safely use tokens
 * in dependency arrays without causing re-renders.
 *
 * @returns Frozen ThemeTokens object.
 * @throws Error if called outside ThemeProvider.
 *
 * @example
 * ```tsx
 * const theme = useTheme();
 * <text fg={theme.primary}>Focused item</text>
 * <text fg={theme.muted}>Secondary text</text>
 * <box borderColor={theme.border}>Content</box>
 * ```
 */
export function useTheme(): Readonly<ThemeTokens> {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error(
      "useTheme() must be used within a <ThemeProvider>. " +
      "Ensure ThemeProvider is in the component ancestor chain."
    );
  }
  return context.tokens;
}
