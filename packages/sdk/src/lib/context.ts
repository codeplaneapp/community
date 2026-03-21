/**
 * Request context patterns matching Go's middleware approach.
 *
 * In Go, authentication info is stored in context.Context via middleware and
 * retrieved with AuthInfoFromContext / UserFromContext. In the Community Edition,
 * we use Hono's context variables (c.set / c.get) which serve the same purpose.
 */

/**
 * Minimal user type for auth context. Matches the shape used by Go's db.User
 * in auth middleware.
 */
export interface AuthUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

/**
 * AuthInfo mirrors Go's middleware.AuthInfo struct.
 */
export interface AuthInfo {
  user: AuthUser | null;
  tokenId: number;
  tokenHash: string;
  rawScopes: string;
  isTokenAuth: boolean;
  tokenSource: "personal_access_token" | "oauth2_access_token" | "";
}

// Hono context variable keys (used with c.set / c.get)
export const AUTH_INFO_KEY = "authInfo" as const;
export const USER_KEY = "user" as const;

/**
 * Type-safe helpers for Hono context variables.
 * Usage in middleware: c.set(AUTH_INFO_KEY, authInfo)
 * Usage in handlers: const authInfo = getAuthInfo(c)
 */
import type { Context } from "hono";

export function getAuthInfo(c: Context): AuthInfo | undefined {
  return c.get(AUTH_INFO_KEY) as AuthInfo | undefined;
}

export function getUser(c: Context): AuthUser | undefined {
  const authInfo = getAuthInfo(c);
  if (authInfo?.user) {
    return authInfo.user;
  }
  return c.get(USER_KEY) as AuthUser | undefined;
}
