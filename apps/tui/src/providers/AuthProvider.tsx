import { createContext, useState, useEffect, useMemo } from "react";

export type AuthState = 
  | "loading" 
  | "authenticated" 
  | "expired" 
  | "offline" 
  | "unauthenticated";

export type AuthSource = "env" | "keyring" | "config";

export interface AuthContextValue {
  readonly token: string | null;
  readonly authState: AuthState;
  readonly source: AuthSource | null;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  token?: string;
  apiUrl?: string;
  children: React.ReactNode;
}

function resolveToken(preResolved?: string): { token: string | null; source: AuthSource | null } {
  if (preResolved) return { token: preResolved, source: "env" };
  const envToken = process.env.CODEPLANE_TOKEN;
  if (envToken) return { token: envToken, source: "env" };
  return { token: null, source: null };
}

export function AuthProvider({ token: preResolved, apiUrl, children }: AuthProviderProps) {
  const resolved = useMemo(() => resolveToken(preResolved), [preResolved]);
  const [authState, setAuthState] = useState<AuthState>(
    resolved.token ? "loading" : "unauthenticated"
  );

  useEffect(() => {
    if (!resolved.token || !apiUrl) {
      setAuthState(resolved.token ? "authenticated" : "unauthenticated");
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`${apiUrl}/api/v1/user`, {
      headers: { Authorization: `token ${resolved.token}` },
      signal: controller.signal,
    })
      .then((res) => {
        clearTimeout(timeout);
        if (res.ok) setAuthState("authenticated");
        else if (res.status === 401) setAuthState("expired");
        else setAuthState("offline");
      })
      .catch(() => {
        clearTimeout(timeout);
        setAuthState("offline");
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [resolved.token, apiUrl]);

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      token: resolved.token,
      authState,
      source: resolved.source,
    }),
    [resolved.token, authState, resolved.source]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}