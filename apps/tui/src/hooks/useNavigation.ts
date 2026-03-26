import { useContext } from "react";
import { NavigationContext } from "../providers/NavigationProvider.js";
import type { NavigationContextType } from "../router/types.js";

/**
 * Access the navigation context from the nearest NavigationProvider.
 *
 * @throws {Error} if called outside a NavigationProvider.
 */
export function useNavigation(): NavigationContextType {
  const context = useContext(NavigationContext);
  if (context === null) {
    throw new Error(
      "useNavigation must be used within a NavigationProvider. " +
      "Ensure the component is rendered inside the provider hierarchy."
    );
  }
  return context;
}
