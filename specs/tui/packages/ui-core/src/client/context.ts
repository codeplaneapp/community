import { createContext, useContext } from "react";
import type { APIClient } from "./types.js";

const APIClientContext = createContext<APIClient | null>(null);

export const APIClientProvider = APIClientContext.Provider;

export function useAPIClient(): APIClient {
  const client = useContext(APIClientContext);
  if (!client) {
    throw new Error(
      "useAPIClient must be used within an <APIClientProvider>. " +
      "Wrap your component tree with <APIClientProvider value={apiClient}>.",
    );
  }
  return client;
}