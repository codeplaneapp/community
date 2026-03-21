import { useMemo } from "react";
import { useBreakpoint } from "./useBreakpoint.js";
import type { Breakpoint } from "../types/breakpoint.js";

/**
 * Map of values keyed by breakpoint.
 *
 * All three breakpoints must be provided. There is no fallback
 * cascade — if the terminal is below minimum (breakpoint is null),
 * the hook returns `fallback` (or undefined if not provided).
 */
export interface ResponsiveValues<T> {
  minimum: T;
  standard: T;
  large: T;
}

/**
 * Returns the value corresponding to the current terminal breakpoint.
 *
 * When the terminal is below minimum supported size (breakpoint is null),
 * returns `fallback` if provided, otherwise returns `undefined`.
 *
 * @example
 * const padding = useResponsiveValue({
 *   minimum: 0,
 *   standard: 2,
 *   large: 4,
 * });
 *
 * @example
 * const label = useResponsiveValue({
 *   minimum: "Y:",
 *   standard: "You",
 *   large: "You",
 * }, "?");
 */
export function useResponsiveValue<T>(
  values: ResponsiveValues<T>,
  fallback?: T,
): T | undefined {
  const breakpoint = useBreakpoint();

  return useMemo(() => {
    if (!breakpoint) return fallback;
    return values[breakpoint];
  }, [breakpoint, values, fallback]);
}