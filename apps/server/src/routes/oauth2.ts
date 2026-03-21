import { Hono } from "hono";
import {
  getUser,
  badRequest,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
} from "@jjhub/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateOAuth2ApplicationRequest {
  name: string;
  redirect_uris: string[];
  confidential_client?: boolean;
}

interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  code_verifier?: string;
}

interface RevokeRequest {
  token: string;
}

/** Lazily resolve the OAuth2 service from the registry on each request. */
function service() {
  return getServices().oauth2;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse Basic Auth header and return [username, password] or null.
 */
function parseBasicAuth(
  header: string | undefined,
): [string, string] | null {
  if (!header || !header.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return [decoded.slice(0, idx), decoded.slice(idx + 1)];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /api/oauth2/applications
app.post("/api/oauth2/applications", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  let body: CreateOAuth2ApplicationRequest;
  try {
    body = await c.req.json<CreateOAuth2ApplicationRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const result = await service().createApplication(user.id, body);
    return writeJSON(c, 201, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/oauth2/applications
app.get("/api/oauth2/applications", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  try {
    const apps = await service().listApplications(user.id);
    return writeJSON(c, 200, apps);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/oauth2/applications/:id
app.get("/api/oauth2/applications/:id", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  const appId = parseInt(id, 10);
  if (isNaN(appId)) {
    return writeError(c, badRequest("invalid application id"));
  }

  try {
    const application = await service().getApplication(appId, user.id);
    return writeJSON(c, 200, application);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/oauth2/applications/:id
app.delete("/api/oauth2/applications/:id", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  const appId = parseInt(id, 10);
  if (isNaN(appId)) {
    return writeError(c, badRequest("invalid application id"));
  }

  try {
    await service().deleteApplication(appId, user.id);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/oauth2/authorize
app.get("/api/oauth2/authorize", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const responseType = query.get("response_type") ?? "";
  const clientId = query.get("client_id") ?? "";
  const redirectUri = query.get("redirect_uri") ?? "";
  const scope = query.get("scope") ?? "";
  const state = query.get("state") ?? "";
  const codeChallenge = query.get("code_challenge") ?? "";
  const codeChallengeMethod = query.get("code_challenge_method") ?? "";

  if (responseType !== "code") {
    return writeError(c, badRequest("response_type must be 'code'"));
  }
  if (!clientId.trim()) {
    return writeError(c, badRequest("client_id is required"));
  }
  if (!redirectUri.trim()) {
    return writeError(c, badRequest("redirect_uri is required"));
  }

  try {
    const result = await service().authorize(
      user.id,
      clientId,
      redirectUri,
      scope,
      codeChallenge,
      codeChallengeMethod,
    );

    const resp: Record<string, string> = { code: result.code };
    if (state) {
      resp.state = state;
    }

    return writeJSON(c, 200, resp);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/oauth2/token
// Supports both application/json and application/x-www-form-urlencoded (per RFC 6749).
app.post("/api/oauth2/token", async (c) => {
  let req: TokenRequest;

  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const formData = await c.req.parseBody();
    req = {
      grant_type: String(formData.grant_type ?? ""),
      code: String(formData.code ?? ""),
      redirect_uri: String(formData.redirect_uri ?? ""),
      client_id: String(formData.client_id ?? ""),
      client_secret: String(formData.client_secret ?? ""),
      refresh_token: String(formData.refresh_token ?? ""),
      code_verifier: String(formData.code_verifier ?? ""),
    };
  } else {
    try {
      req = await c.req.json<TokenRequest>();
    } catch {
      return writeError(c, badRequest("invalid request body"));
    }
  }

  // Extract client credentials from Basic auth if not in body
  if (!req.client_id || !req.client_secret) {
    const basicAuth = parseBasicAuth(c.req.header("Authorization"));
    if (basicAuth) {
      if (!req.client_id) req.client_id = basicAuth[0];
      if (!req.client_secret) req.client_secret = basicAuth[1];
    }
  }

  try {
    switch (req.grant_type) {
      case "authorization_code": {
        if (!(req.code ?? "").trim()) {
          return writeError(c, badRequest("code is required"));
        }
        if (!(req.client_id ?? "").trim()) {
          return writeError(c, badRequest("client_id is required"));
        }

        const result = await service().exchangeCode(
          req.client_id!,
          req.client_secret ?? "",
          req.code!,
          req.redirect_uri ?? "",
          req.code_verifier ?? "",
        );
        return writeJSON(c, 200, result);
      }

      case "refresh_token": {
        if (!(req.refresh_token ?? "").trim()) {
          return writeError(c, badRequest("refresh_token is required"));
        }
        if (!(req.client_id ?? "").trim()) {
          return writeError(c, badRequest("client_id is required"));
        }

        const result = await service().refreshToken(
          req.client_id!,
          req.client_secret ?? "",
          req.refresh_token!,
        );
        return writeJSON(c, 200, result);
      }

      default:
        return writeError(
          c,
          badRequest(
            "unsupported grant_type, must be 'authorization_code' or 'refresh_token'",
          ),
        );
    }
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/oauth2/revoke (RFC 7009)
// Supports both application/json and application/x-www-form-urlencoded.
app.post("/api/oauth2/revoke", async (c) => {
  let req: RevokeRequest;

  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    const formData = await c.req.parseBody();
    req = { token: String(formData.token ?? "") };
  } else {
    try {
      req = await c.req.json<RevokeRequest>();
    } catch {
      return writeError(c, badRequest("invalid request body"));
    }
  }

  if (!(req.token ?? "").trim()) {
    return writeError(c, badRequest("token is required"));
  }

  try {
    await service().revokeToken(req.token);
    return c.body(null, 200);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
