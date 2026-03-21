import { useContext } from "react";
import { ThemeContext } from "../providers/ThemeProvider.js";
import type { ColorTier } from "../theme/detect.js";

/**
 * Access the detected terminal color capability tier.
 *
 * Returns the ColorTier string ("truecolor" | "ansi256" | "ansi16")
 * that was detected at ThemeProvider mount time.
 *
 * Use this when a component needs tier-aware behavior beyond color tokens,
 * such as:
 * - Disabling split diff mode on ansi16 (insufficient background colors)
 * - Choosing between Unicode and ASCII progress indicators
 * - Adjusting syntax highlighting detail level
 *
 * Must be called within a <ThemeProvider> descendant. Throws if used
 * outside the provider tree.
 *
 * @returns The detected ColorTier.
 * @throws Error if called outside ThemeProvider.
 *
 * @example
 * ```tsx
 * const tier = useColorTier();
 * const showSplitDiff = tier !== "ansi16";
 * ```
 */
export function useColorTier(): ColorTier {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error(
      "useColorTier() must be used within a <ThemeProvider>. " +
      "Ensure ThemeProvider is in the component ancestor chain."
    );
  }
  return context.colorTier;
}
