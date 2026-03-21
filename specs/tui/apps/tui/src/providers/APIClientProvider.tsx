import { createContext, useContext } from "react";
import { useAuth } from "../hooks/useAuth.js";

// Dummy APIClient for testing
export interface APIClient {
  request: (path: string) => Promise<any>;
}

const APIClientContext = createContext<APIClient | null>(null);

export interface APIClientProviderProps {
  children: React.ReactNode;
}

export function APIClientProvider({ children }: APIClientProviderProps) {
  const { apiUrl, token } = useAuth();
  
  // Dummy client
  const client: APIClient | null = token ? { request: async () => ({}) } : null;

  return (
    <APIClientContext.Provider value={client}>
      {children}
    </APIClientContext.Provider>
  );
}

export function useAPIClient(): APIClient {
  const ctx = useContext(APIClientContext);
  if (!ctx) throw new Error("useAPIClient must be used within an APIClientProvider");
  return ctx;
}
