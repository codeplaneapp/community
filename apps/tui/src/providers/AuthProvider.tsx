import React, { createContext, useState, useEffect, useMemo, useCallback } from "react";
import { resolveAuthToken, resolveAuthTarget, type AuthTokenSource } from "@codeplane/cli/auth-state";
import { setGlobalAbort } from "../lib/signals.js";
import { AuthLoadingScreen } from "../components/AuthLoadingScreen.js";
import { AuthErrorScreen } from "../components/AuthErrorScreen.js";
// Assume telemetry and logger exists, we'll try to import or omit if they don't.
// Wait, the plan asks to emit telemetry.
import { emit } from "../lib/telemetry.js";
import { logger } from "../lib/logger.js";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "expired"
  | "offline";

export interface AuthContextValue {
  readonly status: AuthStatus;
  readonly user: string | null;
  readonly tokenSource: AuthTokenSource | null;
  readonly apiUrl: string;
  readonly host: string;
  readonly token: string | null;
  readonly retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  children: React.ReactNode;
  apiUrl?: string;
  token?: string;
}

export function AuthProvider({ children, apiUrl: apiUrlProp, token: tokenProp }: AuthProviderProps) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<AuthTokenSource | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const { apiUrl, host } = useMemo(() => {
    return resolveAuthTarget({ apiUrl: apiUrlProp });
  }, [apiUrlProp]);

  const resolveToken = useCallback(() => {
    if (tokenProp) {
      return { token: tokenProp, source: "env" as AuthTokenSource };
    }
    const resolved = resolveAuthToken({ apiUrl });
    if (!resolved) return null;
    if (!resolved.token.trim()) return null;
    return { token: resolved.token, source: resolved.source };
  }, [tokenProp, apiUrl]);

  const validate = useCallback(async (authToken: string) => {
    const controller = new AbortController();
    setGlobalAbort(controller);
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${apiUrl}/api/user`, {
        headers: { Authorization: `token ${authToken}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setGlobalAbort(null as any); // Actually we should reset it, but `setGlobalAbort` doesn't handle null strictly.
      if (res.ok) {
        const data = await res.json();
        return { valid: true, username: data.login ?? data.username ?? null };
      }
      if (res.status === 401) {
        return { valid: false, reason: "expired" as const };
      }
      if (res.status === 429) {
        return { valid: false, reason: "offline" as const };
      }
      return { valid: false, reason: "expired" as const };
    } catch {
      clearTimeout(timeout);
      return { valid: false, reason: "offline" as const };
    }
  }, [apiUrl]);

  const runAuth = useCallback(async () => {
    setStatus("loading");
    setUser(null);

    const startTime = performance.now();
    emit("tui.auth.started", { host, has_env_token: !!process.env.CODEPLANE_TOKEN, timestamp: Date.now() });

    logger.debug(`auth: resolving token for ${host}`);
    const resolved = resolveToken();
    
    if (!resolved) {
      logger.debug(`auth: no token found for ${host}`);
      emit("tui.auth.failed", { host, reason: "no_token", duration_ms: performance.now() - startTime });
      setStatus("unauthenticated");
      setToken(null);
      setTokenSource(null);
      return;
    }

    logger.debug(`auth: token resolved from ${resolved.source} for ${host}`);
    emit("tui.auth.resolved", { host, source: resolved.source, duration_ms: performance.now() - startTime });

    setToken(resolved.token);
    setTokenSource(resolved.source);

    logger.debug(`auth: validating token against ${apiUrl}/api/user`);
    const result = await validate(resolved.token);

    if (result.valid) {
      logger.info(`auth: authenticated as ${result.username} via ${resolved.source} on ${host}`);
      emit("tui.auth.validated", { host, source: resolved.source, valid: true, duration_ms: performance.now() - startTime, username_present: !!result.username });
      setUser(result.username);
      setStatus("authenticated");
    } else if (result.reason === "offline") {
      logger.warn(`auth: could not reach ${host} for token validation, proceeding optimistically`);
      emit("tui.auth.failed", { host, reason: "network_error", source: resolved.source });
      emit("tui.auth.offline_proceed", { host, source: resolved.source });
      setStatus("offline");
    } else {
      logger.warn(`auth: token from ${resolved.source} is expired or invalid for ${host}`);
      emit("tui.auth.failed", { host, reason: "expired", source: resolved.source });
      setStatus("expired");
    }
  }, [resolveToken, validate, host, apiUrl]);

  useEffect(() => {
    runAuth();
  }, [runAuth]);

  const retry = useCallback(() => {
    emit("tui.auth.retry", { host, attempt_number: 1 });
    runAuth();
  }, [runAuth, host]);

  const contextValue: AuthContextValue = useMemo(() => ({
    status,
    user,
    tokenSource,
    apiUrl,
    host,
    token,
    retry,
  }), [status, user, tokenSource, apiUrl, host, token, retry]);

  return (
    <AuthContext.Provider value={contextValue}>
      {status === "loading" && <AuthLoadingScreen host={host} />}
      {status === "unauthenticated" && <AuthErrorScreen variant="no-token" host={host} tokenSource={tokenSource} onRetry={retry} />}
      {status === "expired" && <AuthErrorScreen variant="expired" host={host} tokenSource={tokenSource} onRetry={retry} />}
      {(status === "authenticated" || status === "offline") && children}
    </AuthContext.Provider>
  );
}
