import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";
import { useSidebarState, type SidebarState } from "./useSidebarState.js";

/**
 * Responsive layout context returned by useLayout().
 *
 * All values are derived from the current terminal dimensions and
 * recalculate synchronously on resize (no debounce, no animation).
 */
export interface LayoutContext {
  /** Raw terminal width in columns. */
  width: number;
  /** Raw terminal height in rows. */
  height: number;
  /**
   * Current breakpoint classification.
   * null when terminal is below 80×24 (unsupported).
   */
  breakpoint: Breakpoint | null;
  /**
   * Available content height in rows, excluding the 1-row header bar
   * and 1-row status bar. Always `height - 2`, floored at 0.
   */
  contentHeight: number;
  /**
   * Whether the sidebar should be rendered.
   * Combines breakpoint auto-collapse with user Ctrl+B toggle.
   */
  sidebarVisible: boolean;
  /**
   * Sidebar width as a percentage string for OpenTUI's <box width={...}>.
   */
  sidebarWidth: string;
  /**
   * Modal overlay width as a percentage string.
   */
  modalWidth: string;
  /**
   * Modal overlay height as a percentage string.
   */
  modalHeight: string;
  /**
   * Full sidebar state object for advanced consumers.
   * Exposes toggle(), userPreference, and autoOverride.
   */
  sidebar: SidebarState;
}

function getSidebarWidth(
  breakpoint: Breakpoint | null,
  sidebarVisible: boolean,
): string {
  if (!sidebarVisible) return "0%";
  switch (breakpoint) {
    case "large":    return "30%";
    case "standard": return "25%";
    default:         return "0%";
  }
}

function getModalWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

function getModalHeight(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

/**
 * Central responsive layout hook for the Codeplane TUI.
 *
 * Reads terminal dimensions from `@opentui/react`'s
 * `useTerminalDimensions()` and returns a memoized set of
 * breakpoint-aware layout values. The object recalculates
 * synchronously on terminal resize — no debounce, no animation.
 *
 * This hook is the ONLY place where breakpoint → layout value
 * mapping is defined. Components must NOT duplicate this logic.
 * If a component needs a responsive value not covered here, it
 * should be added to LayoutContext, not computed inline.
 */
export function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions();
  const sidebar = useSidebarState();

  return useMemo((): LayoutContext => {
    const breakpoint = getBreakpoint(width, height);
    return {
      width,
      height,
      breakpoint,
      contentHeight: Math.max(0, height - 2),
      sidebarVisible: sidebar.visible,
      sidebarWidth: getSidebarWidth(breakpoint, sidebar.visible),
      modalWidth: getModalWidth(breakpoint),
      modalHeight: getModalHeight(breakpoint),
      sidebar,
    };
  }, [width, height, sidebar]);
}
