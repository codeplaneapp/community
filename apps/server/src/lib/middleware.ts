/**
 * Core middleware for JJHub Community Edition.
 *
 * Mirrors Go's internal/middleware/auth.go auth flow:
 *   1. Check for `Authorization: token jjhub_xxx` or `Authorization: Bearer jjhub_xxx`
 *   2. SHA-256 hash the raw token
 *   3. Look up hash in access_tokens table (via sqlc-generated getAuthInfoByTokenHash)
 *   4. Load user + scopes onto Hono context
 *
 * Also supports session-cookie auth via the `jjhub_session` cookie,
 * looking up the session in the auth_sessions table.
 */

import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import {
  getDb,
  type AuthInfo,
  type AuthUser,
  AUTH_INFO_KEY,
  USER_KEY,
  unauthorized,
  unsupportedMediaType,
  writeError,
  getAuthInfoByTokenHash,
  getAuthSessionBySessionKey,
  updateAccessTokenLastUsed,
} from "@jjhub/sdk";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_COOKIE_NAME = "jjhub_session";
const TOKEN_PREFIX = "jjhub_";
const OAUTH_TOKEN_PREFIX = "jjhub_oat_";

// ---------------------------------------------------------------------------
// Token extraction — matches Go's ExtractToken
// ---------------------------------------------------------------------------

/**
 * Extract the API token from the Authorization header.
 * Accepts: "Authorization: token jjhub_xxx" or "Authorization: Bearer jjhub_xxx"
 * Query-string auth is intentionally unsupported so tokens never leak into
 * request URLs, browser history, or intermediary logs.
 */
function extractToken(c: Context): string | null {
  const auth = c.req.header("Authorization");
  if (!auth) return null;

  const parts = auth.split(/\s+/);
  if (parts.length !== 2) return null;

  const scheme = parts[0]!.toLowerCase();
  if (scheme !== "token" && scheme !== "bearer") return null;

  const token = parts[1]!;
  if (!isValidTokenFormat(token)) return null;

  return token;
}

/**
 * Validate token format — must start with jjhub_ or jjhub_oat_ prefix.
 */
function isValidTokenFormat(token: string): boolean {
  return token.startsWith(OAUTH_TOKEN_PREFIX) || token.startsWith(TOKEN_PREFIX);
}

// ---------------------------------------------------------------------------
// SHA-256 hashing — matches Go's sha256.Sum256 + hex.EncodeToString
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Auth middleware — optional auth (does not reject unauthenticated requests)
// ---------------------------------------------------------------------------

/**
 * authLoader is middleware that attempts to authenticate the request via
 * API token or session cookie. It sets the user and authInfo on the Hono
 * context if authentication succeeds, but does NOT reject unauthenticated
 * requests — that is the job of requireAuth middleware on protected routes.
 *
 * This mirrors Go's AuthLoader middleware pattern.
 */
export const authLoader = createMiddleware(async (c: Context, next: Next) => {
  const db = getDb();

  // 1. Try token auth first
  const token = extractToken(c);
  if (token) {
    const tokenHash = await sha256Hex(token);
    const authRow = await getAuthInfoByTokenHash(db, { tokenHash });

    if (authRow) {
      const user: AuthUser = {
        id: Number(authRow.id),
        username: authRow.username,
        isAdmin: authRow.isAdmin,
      };

      const authInfo: AuthInfo = {
        user,
        tokenId: Number(authRow.tokenId),
        tokenHash,
        rawScopes: authRow.tokenScopes,
        isTokenAuth: true,
        tokenSource: token.startsWith(OAUTH_TOKEN_PREFIX)
          ? "oauth2_access_token"
          : "personal_access_token",
      };

      c.set(AUTH_INFO_KEY, authInfo);
      c.set(USER_KEY, user);

      // Fire-and-forget last_used_at update (non-blocking)
      updateAccessTokenLastUsed(db, { id: authRow.tokenId }).catch(() => {});
    }

    return next();
  }

  // 2. Try session cookie auth
  const sessionKey = getCookie(c, SESSION_COOKIE_NAME);
  if (sessionKey) {
    const session = await getAuthSessionBySessionKey(db, { sessionKey });

    if (session && session.expiresAt > new Date()) {
      const user: AuthUser = {
        id: Number(session.userId),
        username: session.username,
        isAdmin: session.isAdmin,
      };

      const authInfo: AuthInfo = {
        user,
        tokenId: 0,
        tokenHash: "",
        rawScopes: "",
        isTokenAuth: false,
        tokenSource: "",
      };

      c.set(AUTH_INFO_KEY, authInfo);
      c.set(USER_KEY, user);
    }
  }

  return next();
});

// ---------------------------------------------------------------------------
// requireAuth middleware — rejects unauthenticated requests
// ---------------------------------------------------------------------------

/**
 * requireAuth middleware that rejects requests without a valid user.
 * Mount on routes that require authentication.
 */
export const requireAuth = createMiddleware(async (c: Context, next: Next) => {
  const user = c.get(USER_KEY) as AuthUser | undefined;
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  return next();
});

// ---------------------------------------------------------------------------
// Request ID middleware
// ---------------------------------------------------------------------------

let requestCounter = 0;

/**
 * requestId middleware adds a unique X-Request-Id header to every response.
 * If the client sends one, it is preserved; otherwise one is generated.
 */
export const requestId = createMiddleware(async (c: Context, next: Next) => {
  let id = c.req.header("X-Request-Id");
  if (!id) {
    requestCounter += 1;
    id = `${Date.now().toString(36)}-${requestCounter.toString(36)}`;
  }
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  return next();
});

// ---------------------------------------------------------------------------
// JSON content type enforcement
// ---------------------------------------------------------------------------

/**
 * jsonContentType middleware enforces that mutation requests (POST, PUT, PATCH,
 * DELETE) include a Content-Type of application/json. GET and HEAD are exempt.
 * Matches Go's ContentType middleware behavior.
 */
export const jsonContentType = createMiddleware(
  async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();

    // Read-only methods are exempt
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }

    const contentType = c.req.header("Content-Type") ?? "";

    // Allow requests with no body (Content-Length: 0 or missing)
    const contentLength = c.req.header("Content-Length");
    if (contentLength === "0" || (!contentType && !contentLength)) {
      return next();
    }

    if (!contentType.includes("application/json")) {
      return writeError(
        c,
        unsupportedMediaType("Content-Type must be application/json"),
      );
    }

    return next();
  },
);

// ---------------------------------------------------------------------------
// Rate limiting middleware (simple in-memory)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupRateLimits(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Create a rate limiting middleware with the given configuration.
 *
 * @param maxRequests Maximum requests per window
 * @param windowMs Window duration in milliseconds (default: 60_000 = 1 minute)
 */
export function rateLimit(maxRequests: number, windowMs: number = 60_000) {
  return createMiddleware(async (c: Context, next: Next) => {
    cleanupRateLimits();

    // Use authenticated user ID if available, otherwise fall back to IP
    const user = c.get(USER_KEY) as AuthUser | undefined;
    const key = user ? `user:${user.id}` : `ip:${c.req.header("X-Real-Ip") ?? c.req.header("X-Forwarded-For") ?? "unknown"}`;

    const now = Date.now();
    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count += 1;

    // Set rate limit headers
    const remaining = Math.max(0, maxRequests - entry.count);
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json({ message: "rate limit exceeded" }, 429);
    }

    return next();
  });
}
