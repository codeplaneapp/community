import { createContext, useMemo, useContext } from "react";
import { AuthContext } from "./AuthProvider.js";

// Mock implementation of APIClient since @codeplane/ui-core is missing
export interface APIClient {
  baseUrl: string;
  token: string;
}

export function createAPIClient(opts: { baseUrl: string; token: string }): APIClient {
  return opts;
}

const APIClientContext = createContext<APIClient | null>(null);

export interface APIClientProviderProps {
  baseUrl?: string;
  token?: string | null;
  children: React.ReactNode;
}

export function APIClientProvider({ baseUrl, token, children }: APIClientProviderProps) {
  const auth = useContext(AuthContext);
  const resolvedBaseUrl = baseUrl ?? auth?.apiUrl;
  const resolvedToken = token ?? auth?.token;

  if (!resolvedBaseUrl || !resolvedToken) {
    throw new Error("APIClientProvider requires an authenticated baseUrl and token");
  }

  const client = useMemo(
    () => createAPIClient({ baseUrl: resolvedBaseUrl, token: resolvedToken }),
    [resolvedBaseUrl, resolvedToken],
  );
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
