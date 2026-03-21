import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";
import { useSidebarState, type SidebarState } from "./useSidebarState.js";

/**
 * Composite layout context.
 *
 * All values are derived from the current terminal dimensions and
 * sidebar state. Recalculates synchronously on terminal resize
 * (no debounce, no animation).
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
   * - null / minimum: "0%" (sidebar hidden)
   * - standard: "25%"
   * - large: "30%"
   * When sidebarVisible is false (user toggled off), returns "0%"
   * regardless of breakpoint.
   */
  sidebarWidth: string;
  /**
   * Modal overlay width as a percentage string.
   * Wider at smaller breakpoints to maximize usable space.
   * - null / minimum: "90%"
   * - standard: "60%"
   * - large: "50%"
   */
  modalWidth: string;
  /**
   * Modal overlay height as a percentage string.
   * Follows the same scaling as modalWidth.
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
 * Combines terminal dimensions, breakpoint detection, sidebar state,
 * and derived layout values into a single memoized object.
 *
 * Every screen and layout component should consume this hook
 * (or one of the lower-level hooks it composes) rather than
 * calling useTerminalDimensions() directly.
 *
 * @example
 * function MyScreen() {
 *   const layout = useLayout();
 *   if (!layout.breakpoint) return <TerminalTooSmall />;
 *
 *   return (
 *     <box flexDirection="row" height={layout.contentHeight}>
 *       {layout.sidebarVisible && (
 *         <box width={layout.sidebarWidth}>
 *           <Sidebar />
 *         </box>
 *       )}
 *       <box flexGrow={1}>
 *         <MainContent />
 *       </box>
 *     </box>
 *   );
 * }
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