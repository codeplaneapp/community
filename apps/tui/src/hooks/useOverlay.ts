import { useContext } from "react";
import { OverlayContext } from "../providers/OverlayManager.js";
import type { OverlayContextType } from "../providers/overlay-types.js";

/**
 * Access the OverlayManager context.
 *
 * Returns the overlay state and control functions.
 * Must be used within an <OverlayManager> provider.
 *
 * const { activeOverlay, openOverlay, closeOverlay, isOpen } = useOverlay();
 *
 * // Toggle help overlay
 * openOverlay("help");
 *
 * // Check if command palette is open
 * if (isOpen("command-palette")) { ... }
 *
 * // Open confirmation dialog
 * openOverlay("confirm", {
 *   title: "Delete issue?",
 *   message: "This action cannot be undone.",
 *   onConfirm: () => deleteIssue(id),
 * });
 */
export function useOverlay(): OverlayContextType {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error(
      "useOverlay() must be used within an <OverlayManager> provider. " +
      "Ensure OverlayManager is in the provider stack above this component."
    );
  }
  return ctx;
}
