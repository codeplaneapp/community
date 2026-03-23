import { useContext } from "react";
import { LoadingContext } from "../providers/LoadingProvider.js";
import type { LoadingContextValue } from "../loading/types.js";

/**
 * Access the loading state context from the nearest LoadingProvider.
 *
 * Provides methods to register/unregister loading states, access the
 * shared spinner frame, and manage optimistic mutations.
 *
 * @throws {Error} if called outside a LoadingProvider.
 */
export function useLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (context === null) {
    throw new Error(
      "useLoading() must be used within a <LoadingProvider>. " +
        "Ensure LoadingProvider is in the component ancestor chain."
    );
  }
  return context;
}
