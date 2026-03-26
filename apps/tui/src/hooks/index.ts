/**
 * Custom hooks for the TUI application.
 */
export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";
export { useTheme } from "./useTheme.js";
export { useColorTier } from "./useColorTier.js";
export {
  useSpinner,
  BRAILLE_FRAMES,
  ASCII_FRAMES,
  BRAILLE_INTERVAL_MS,
  ASCII_INTERVAL_MS,
} from "./useSpinner.js";
export { useLayout } from "./useLayout.js";
export type { LayoutContext } from "./useLayout.js";
export { useNavigation } from "./useNavigation.js";
export { useAuth } from "./useAuth.js";
export { useLoading } from "./useLoading.js";
export { useScreenLoading } from "./useScreenLoading.js";
export { useOptimisticMutation } from "./useOptimisticMutation.js";
export { usePaginationLoading } from "./usePaginationLoading.js";
export { useBreakpoint } from "./useBreakpoint.js";
export { useResponsiveValue, type ResponsiveValues } from "./useResponsiveValue.js";
export { useSidebarState, resolveSidebarVisibility, type SidebarState } from "./useSidebarState.js";
export { useOverlay } from "./useOverlay.js";
