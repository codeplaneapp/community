import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import {
  badRequest,
  unauthorized,
  forbidden,
  internal,
  writeError,
  writeJSON,
  writeRouteError,
  getAuthInfo,
} from "@jjhub/sdk";

// ---------------------------------------------------------------------------
// Types matching Go's services layer
// ---------------------------------------------------------------------------

interface VerifyKeyAuthResult {
  user: { id: number; username: string };
  sessionKey: string;
  expiresAt: Date;
}

interface OAuthCallbackResult {
  user: { id: number; username: string };
  sessionKey: string;
  expiresAt: Date;
  redirectUrl: string;
}

interface CreateTokenRequest {
  name: string;
  scopes: string[];
}

interface CreateTokenResult {
  id: number;
  name: string;
  tokenLastEight: string;
  scopes: string[];
  token: string;
}

// ---------------------------------------------------------------------------
// AuthService interface — matches Go's routes.AuthService
// All methods are stubbed to return not-implemented errors until the service
// layer is wired up with a real DB.
// ---------------------------------------------------------------------------

interface AuthService {
  createKeyAuthNonce(): Promise<string>;
  verifyKeyAuth(
    message: string,
    signature: string
  ): Promise<VerifyKeyAuthResult>;
  startGitHubOAuth(stateVerifier: string): Promise<string>;
  completeGitHubOAuth(
    code: string,
    state: string,
    stateVerifier: string
  ): Promise<OAuthCallbackResult>;
  createToken(
    userId: number,
    req: CreateTokenRequest
  ): Promise<CreateTokenResult>;
  logout(sessionKey: string): Promise<void>;
}

// Stubbed service that returns not-implemented errors for all operations.
// Route-level parsing/validation is real; only the DB-dependent service calls are stubbed.
class StubAuthService implements AuthService {
  async createKeyAuthNonce(): Promise<string> {
    throw internal("auth service not implemented");
  }
  async verifyKeyAuth(): Promise<VerifyKeyAuthResult> {
    throw internal("auth service not implemented");
  }
  async startGitHubOAuth(): Promise<string> {
    throw internal("auth service not implemented");
  }
  async completeGitHubOAuth(): Promise<OAuthCallbackResult> {
    throw internal("auth service not implemented");
  }
  async createToken(): Promise<CreateTokenResult> {
    throw internal("auth service not implemented");
  }
  async logout(): Promise<void> {
    throw internal("auth service not implemented");
  }
}

// ---------------------------------------------------------------------------
// Constants — match Go's cookie/config constants
// ---------------------------------------------------------------------------

const OAUTH_STATE_COOKIE_NAME = "jjhub_oauth_state";
const CLI_CALLBACK_COOKIE_NAME = "jjhub_cli_callback";
const CSRF_COOKIE_NAME = "__csrf";
const DEFAULT_SESSION_COOKIE_NAME = "jjhub_session";

// ---------------------------------------------------------------------------
// Config — matches Go's config.AuthConfig fields used by auth routes
// ---------------------------------------------------------------------------

interface AuthConfig {
  sessionCookieName: string;
  cookieSecure: boolean;
}

function getAuthConfig(): AuthConfig {
  return {
    sessionCookieName:
      process.env.JJHUB_AUTH_SESSION_COOKIE_NAME || DEFAULT_SESSION_COOKIE_NAME,
    cookieSecure: process.env.JJHUB_AUTH_COOKIE_SECURE === "true",
  };
}

function sessionCookieName(configuredName: string): string {
  const trimmed = configuredName.trim();
  if (trimmed === "") {
    return DEFAULT_SESSION_COOKIE_NAME;
  }
  return trimmed;
}

// ---------------------------------------------------------------------------
// Helpers — match Go helper functions in auth.go
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically secure random hex string.
 * Matches Go's randomHex in auth.go.
 */
function randomHex(bytesLen: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytesLen));
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Request body types — match Go structs
// ---------------------------------------------------------------------------

interface PostKeyAuthVerifyRequest {
  message: string;
  signature: string;
}

// ---------------------------------------------------------------------------
// Cookie helpers — match Go's setSessionCookie, setCSRFCookie, etc.
// ---------------------------------------------------------------------------

function setSessionCookie(
  c: any,
  name: string,
  sessionKey: string,
  expiresAt: Date,
  secure: boolean
): void {
  const cookieName = sessionCookieName(name);
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  setCookie(c, cookieName, sessionKey, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    expires: expiresAt,
    maxAge,
  });
}

function setOAuthStateCookie(
  c: any,
  stateVerifier: string,
  expiresAt: Date,
  secure: boolean
): void {
  const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
  setCookie(c, OAUTH_STATE_COOKIE_NAME, stateVerifier, {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    expires: expiresAt,
    maxAge,
  });
}

function setCSRFCookie(c: any, token: string, secure: boolean): void {
  setCookie(c, CSRF_COOKIE_NAME, token, {
    path: "/",
    httpOnly: false,
    secure,
    sameSite: "Strict",
  });
}

function clearCSRFCookie(c: any, secure: boolean): void {
  setCookie(c, CSRF_COOKIE_NAME, "", {
    path: "/",
    httpOnly: false,
    secure,
    sameSite: "Strict",
    expires: new Date(0),
    maxAge: -1,
  });
}

function clearOAuthStateCookie(c: any, secure: boolean): void {
  setCookie(c, OAUTH_STATE_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    secure,
    sameSite: "Lax",
    expires: new Date(0),
    maxAge: -1,
  });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const service: AuthService = new StubAuthService();
const app = new Hono();

// GET /api/auth/key/nonce — matches Go's AuthHandler.GetKeyAuthNonce
app.get("/api/auth/key/nonce", async (c) => {
  try {
    const nonce = await service.createKeyAuthNonce();
    return writeJSON(c, 200, { nonce });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/auth/key/verify — matches Go's AuthHandler.PostKeyAuthVerify
app.post("/api/auth/key/verify", async (c) => {
  let req: PostKeyAuthVerifyRequest;
  try {
    req = await c.req.json<PostKeyAuthVerifyRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  if (!req.message?.trim() || !req.signature?.trim()) {
    return writeError(c, badRequest("message and signature are required"));
  }

  try {
    const result = await service.verifyKeyAuth(req.message, req.signature);
    const config = getAuthConfig();

    const csrfToken = randomHex(32);
    setSessionCookie(
      c,
      config.sessionCookieName,
      result.sessionKey,
      result.expiresAt,
      config.cookieSecure
    );
    setCSRFCookie(c, csrfToken, config.cookieSecure);

    return writeJSON(c, 200, {
      user: {
        id: result.user.id,
        username: result.user.username,
      },
    });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/auth/key/token — matches Go's AuthHandler.PostKeyAuthToken
// Verifies key signature and returns an API token directly (CLI/agent use).
app.post("/api/auth/key/token", async (c) => {
  let req: PostKeyAuthVerifyRequest;
  try {
    req = await c.req.json<PostKeyAuthVerifyRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  if (!req.message?.trim() || !req.signature?.trim()) {
    return writeError(c, badRequest("message and signature are required"));
  }

  try {
    const result = await service.verifyKeyAuth(req.message, req.signature);

    const tokenResult = await service.createToken(result.user.id, {
      name: "jjhub-cli",
      scopes: ["repo", "user", "org"],
    });

    return writeJSON(c, 200, {
      token: tokenResult.token,
      username: result.user.username,
    });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/auth/sse-ticket — matches Go's AuthHandler.PostSSETicket
app.post("/api/auth/sse-ticket", async (c) => {
  // SSE ticket exchange requires authenticated bearer token auth.
  const authInfo = getAuthInfo(c);
  if (!authInfo?.user) {
    return writeError(c, unauthorized("authentication required"));
  }
  if (!authInfo.isTokenAuth || !authInfo.tokenHash?.trim()) {
    return writeError(
      c,
      forbidden("sse tickets require bearer token authentication")
    );
  }

  // SSE ticket manager not implemented yet.
  return writeError(c, internal("sse ticket exchange not configured"));
});

// GET /api/auth/github — matches Go's AuthHandler.GetGitHubOAuthStart
app.get("/api/auth/github", async (c) => {
  try {
    const stateVerifier = randomHex(16);
    const redirectURL = await service.startGitHubOAuth(stateVerifier);
    const config = getAuthConfig();

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    setOAuthStateCookie(c, stateVerifier, expiresAt, config.cookieSecure);

    return c.redirect(redirectURL, 302);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/auth/github/cli — matches Go's AuthHandler.GetGitHubOAuthCLIStart
app.get("/api/auth/github/cli", async (c) => {
  const portStr = c.req.query("callback_port");
  if (!portStr) {
    return writeError(c, badRequest("callback_port is required"));
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    return writeError(
      c,
      badRequest("callback_port must be a valid port (1024-65535)")
    );
  }

  try {
    const stateVerifier = randomHex(16);
    const redirectURL = await service.startGitHubOAuth(stateVerifier);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000);

    // Not secure - localhost flow
    setOAuthStateCookie(c, stateVerifier, expiresAt, false);

    // Store callback port so the callback handler redirects to the CLI.
    setCookie(c, CLI_CALLBACK_COOKIE_NAME, portStr, {
      path: "/",
      httpOnly: true,
      secure: false, // CLI flow is always localhost
      sameSite: "Lax",
      expires: expiresAt,
      maxAge,
    });

    return c.redirect(redirectURL, 302);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/auth/github/callback — matches Go's AuthHandler.GetGitHubOAuthCallback
app.get("/api/auth/github/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code?.trim() || !state?.trim()) {
    return writeError(c, badRequest("code and state are required"));
  }

  const stateVerifier = getCookie(c, OAUTH_STATE_COOKIE_NAME)?.trim() ?? "";
  const config = getAuthConfig();

  let result: OAuthCallbackResult;
  try {
    result = await service.completeGitHubOAuth(code, state, stateVerifier);
  } catch (err) {
    clearOAuthStateCookie(c, config.cookieSecure);
    return writeRouteError(c, err);
  }

  // Check if this is a CLI login flow (callback port cookie present).
  const cliCallbackPort = getCookie(c, CLI_CALLBACK_COOKIE_NAME);
  if (cliCallbackPort) {
    return await completeCLIOAuth(c, result, cliCallbackPort);
  }

  const csrfToken = randomHex(32);

  setSessionCookie(
    c,
    config.sessionCookieName,
    result.sessionKey,
    result.expiresAt,
    config.cookieSecure
  );
  setCSRFCookie(c, csrfToken, config.cookieSecure);
  clearOAuthStateCookie(c, config.cookieSecure);

  const redirectUrl = result.redirectUrl || "/";
  return c.redirect(redirectUrl, 302);
});

/**
 * completeCLIOAuth handles the OAuth callback for CLI logins.
 * It creates an access token and redirects to the CLI's local HTTP server.
 * Matches Go's AuthHandler.completeCLIOAuth.
 */
async function completeCLIOAuth(
  c: any,
  result: OAuthCallbackResult,
  portStr: string
): Promise<Response> {
  // Clear both cookies.
  clearOAuthStateCookie(c, false);
  setCookie(c, CLI_CALLBACK_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
    expires: new Date(0),
    maxAge: -1,
  });

  try {
    // Create an access token for the CLI.
    const tokenResult = await service.createToken(result.user.id, {
      name: "jjhub-cli",
      scopes: ["repo", "user", "org"],
    });

    // Redirect to the CLI's local callback server with the token in the URL
    // fragment so intermediaries never log the credential-bearing value.
    const callbackURL = `http://127.0.0.1:${portStr}/callback#token=${encodeURIComponent(tokenResult.token)}&username=${encodeURIComponent(result.user.username)}`;
    return c.redirect(callbackURL, 302);
  } catch (err) {
    return writeRouteError(c, err);
  }
}

// POST /api/auth/logout — matches Go's AuthHandler.PostLogout
app.post("/api/auth/logout", async (c) => {
  const config = getAuthConfig();
  const cookieName = sessionCookieName(config.sessionCookieName);
  const sessionKey = getCookie(c, cookieName);

  if (sessionKey) {
    try {
      await service.logout(sessionKey);
    } catch (err) {
      return writeRouteError(c, err);
    }
  }

  // Clear session cookie.
  setCookie(c, cookieName, "", {
    path: "/",
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "Lax",
    expires: new Date(0),
    maxAge: -1,
  });
  clearCSRFCookie(c, config.cookieSecure);

  return c.body(null, 204);
});

export default app;
