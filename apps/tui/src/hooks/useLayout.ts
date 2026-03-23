import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";

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
   * Whether the sidebar (file tree, navigation panel) should be visible.
   * Hidden when breakpoint is null or "minimum" to maximize content
   * area width.
   *
   * Future: will incorporate user Ctrl+B toggle preference via
   * useSidebarState() when that hook is deployed.
   */
  sidebarVisible: boolean;
  /**
   * Sidebar width as a CSS-like percentage string.
   * - null / "minimum": "0%" (sidebar hidden)
   * - "standard": "25%"
   * - "large": "30%"
   *
   * Consumers pass this directly to OpenTUI's `<box width={...}>`.
   */
  sidebarWidth: string;
  /**
   * Modal overlay width as a percentage string.
   * Wider at smaller breakpoints to maximize usable space.
   * - null / "minimum": "90%"
   * - "standard": "60%"
   * - "large": "50%"
   */
  modalWidth: string;
  /**
   * Modal overlay height as a percentage string.
   * Follows the same scaling as modalWidth.
   */
  modalHeight: string;
}

/**
 * Derive sidebar width from breakpoint.
 * Returns "0%" when sidebar is not visible, so consumers can
 * always use the value without checking sidebarVisible separately.
 */
function getSidebarWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "30%";
    case "standard": return "25%";
    case "minimum":
    default:         return "0%";
  }
}

/**
 * Derive modal width from breakpoint.
 */
function getModalWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

/**
 * Derive modal height from breakpoint.
 */
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
 *
 * @example
 * ```tsx
 * function MyScreen() {
 *   const layout = useLayout();
 *   if (!layout.breakpoint) return <TerminalTooSmall />;
 *
 *   return (
 *     <box flexDirection="row" height={layout.contentHeight}>
 *       {layout.sidebarVisible && (
 *         <box width={layout.sidebarWidth}><FileTree /></box>
 *       )}
 *       <box flexGrow={1}><Content /></box>
 *     </box>
 *   );
 * }
 * ```
 */
export function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions();

  return useMemo((): LayoutContext => {
    const breakpoint = getBreakpoint(width, height);
    const sidebarVisible = breakpoint !== null && breakpoint !== "minimum";
    return {
      width,
      height,
      breakpoint,
      contentHeight: Math.max(0, height - 2),
      sidebarVisible,
      sidebarWidth: getSidebarWidth(breakpoint),
      modalWidth: getModalWidth(breakpoint),
      modalHeight: getModalHeight(breakpoint),
    };
  }, [width, height]);
}