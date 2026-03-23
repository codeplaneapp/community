import { useState, useMemo, useCallback } from "react";
import { useBreakpoint } from "./useBreakpoint.js";
import type { Breakpoint } from "../types/breakpoint.js";

/**
 * Sidebar state combines two independent signals:
 *
 * 1. userPreference: Explicit user intent via Ctrl+B toggle.
 *    - null: no preference expressed (use auto behavior)
 *    - true: user explicitly wants sidebar visible
 *    - false: user explicitly wants sidebar hidden
 *
 * 2. autoOverride: Breakpoint-driven auto-collapse.
 *    - At 'minimum' breakpoint, sidebar is auto-hidden regardless
 *      of user preference (there isn't enough space).
 *    - At 'standard' and 'large' breakpoints, auto-override is false
 *      (defer to user preference or default visible).
 *
 * Resolution logic:
 *   if (breakpoint is null) → hidden (terminal too small)
 *   if (breakpoint is 'minimum') → hidden (auto-override)
 *   if (userPreference !== null) → userPreference
 *   else → true (default visible at standard/large)
 */
export interface SidebarState {
  /** The resolved visibility. True = sidebar renders. */
  visible: boolean;
  /** Raw user toggle preference. null = no explicit preference. */
  userPreference: boolean | null;
  /** Whether the breakpoint auto-override is forcing the sidebar hidden. */
  autoOverride: boolean;
  /** Toggle sidebar visibility. Sets userPreference explicitly. */
  toggle: () => void;
}

/**
 * Resolve whether the sidebar should be visible given breakpoint
 * and user preference.
 *
 * Exported for direct unit testing without React.
 */
export function resolveSidebarVisibility(
  breakpoint: Breakpoint | null,
  userPreference: boolean | null,
): { visible: boolean; autoOverride: boolean } {
  // Below minimum: always hidden
  if (!breakpoint) {
    return { visible: false, autoOverride: true };
  }

  // At minimum breakpoint: auto-collapse regardless of user preference
  if (breakpoint === "minimum") {
    return { visible: false, autoOverride: true };
  }

  // At standard/large: respect user preference, default visible
  return {
    visible: userPreference !== null ? userPreference : true,
    autoOverride: false,
  };
}

/**
 * Hook that manages sidebar visibility as a combination of user
 * preference and breakpoint-driven auto-collapse.
 *
 * The toggle function (bound to Ctrl+B) sets an explicit user
 * preference. The preference is respected at standard and large
 * breakpoints but overridden at minimum (not enough space).
 *
 * When the user resizes from minimum back to standard/large,
 * their preference is restored if they had one.
 */
export function useSidebarState(): SidebarState {
  const breakpoint = useBreakpoint();
  const [userPreference, setUserPreference] = useState<boolean | null>(null);

  const { visible, autoOverride } = useMemo(
    () => resolveSidebarVisibility(breakpoint, userPreference),
    [breakpoint, userPreference],
  );

  const toggle = useCallback(() => {
    // If auto-override is active (minimum breakpoint), toggle is a no-op.
    // The user can't force the sidebar open at minimum.
    if (autoOverride) return;

    setUserPreference((prev) => {
      if (prev === null) return false; // default is visible, so toggle hides
      return !prev;
    });
  }, [autoOverride]);

  return useMemo(
    () => ({ visible, userPreference, autoOverride, toggle }),
    [visible, userPreference, autoOverride, toggle],
  );
}
