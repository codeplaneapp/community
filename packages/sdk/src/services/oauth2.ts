/**
 * OAuth2 service for JJHub Community Edition.
 *
 * Implements OAuth2 application CRUD, authorization code flow, token exchange,
 * refresh, and revoke. 1:1 port of Go's internal/services/oauth2.go.
 *
 * Uses crypto.subtle for hashing (matching Go's crypto/sha256).
 */

import type { Sql } from "postgres";

import {
  type APIError,
  badRequest,
  internal,
  notFound,
  unauthorized,
  validationFailed,
  type FieldError,
} from "../lib/errors";

import {
  createOAuth2Application,
  getOAuth2ApplicationByID,
  getOAuth2ApplicationByClientID,
  listOAuth2ApplicationsByOwner,
  updateOAuth2Application,
  deleteOAuth2ApplicationQuery,
  type DeleteOAuth2ApplicationArgs,
  createOAuth2AuthorizationCode,
  consumeOAuth2AuthorizationCode,
  createOAuth2AccessToken,
  getOAuth2AccessTokenByHash,
  deleteOAuth2AccessTokenByHashQuery,
  type DeleteOAuth2AccessTokenByHashArgs,
  deleteOAuth2AccessTokensByAppAndUser,
  createOAuth2RefreshToken,
  getOAuth2RefreshTokenByHash,
  consumeOAuth2RefreshToken,
  deleteOAuth2RefreshTokenByHashQuery,
  type DeleteOAuth2RefreshTokenByHashArgs,
  deleteOAuth2RefreshTokensByAppAndUser,
  type CreateOAuth2ApplicationRow,
} from "../db/oauth2_sql";

// ---------------------------------------------------------------------------
// Constants — match Go's oauth2 durations
// ---------------------------------------------------------------------------

const OAUTH2_AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OAUTH2_ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const OAUTH2_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// ---------------------------------------------------------------------------
// Response types — match Go's OAuth2 response structs
// ---------------------------------------------------------------------------

export interface OAuth2ApplicationResponse {
  id: number;
  client_id: string;
  name: string;
  redirect_uris: string[];
  scopes: string[];
  confidential: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateOAuth2ApplicationResult extends OAuth2ApplicationResponse {
  client_secret: string;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface OAuth2AuthorizeResult {
  code: string;
  redirect_uri: string;
}

export interface CreateOAuth2ApplicationRequest {
  name: string;
  redirect_uris: string[];
  scopes?: string[];
  confidential?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers — match Go's helper functions
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a unique OAuth2 client ID (40 hex chars). */
function generateOAuth2ClientID(): string {
  return randomHex(20);
}

/** Generate an OAuth2 client secret with jjhub_oas_ prefix. */
function generateOAuth2ClientSecret(): string {
  return "jjhub_oas_" + randomHex(32);
}

/** Generate an authorization code (64 hex chars). */
function generateOAuth2Code(): string {
  return randomHex(32);
}

/** Generate a token value (64 hex chars). */
function generateOAuth2Token(): string {
  return randomHex(32);
}

/** Check if a redirect URI is in the list of registered URIs. */
function isValidRedirectURI(registered: string[], uri: string): boolean {
  return registered.includes(uri);
}

/** Parse a space-separated scope string into a string array. */
function parseScopeString(scope: string): string[] {
  const trimmed = scope.trim();
  if (trimmed === "") return [];
  return trimmed
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/**
 * Normalize a token scope string to a canonical form.
 * Matches Go's middleware.NormalizeTokenScope.
 */
function normalizeTokenScope(raw: string): string {
  const scope = raw.trim().toLowerCase();
  if (scope === "") return "";

  switch (scope) {
    case "all":
      return "all";
    case "admin":
      return "admin";
    case "read:admin":
    case "admin:read":
      return "read:admin";
    case "write:admin":
    case "admin:write":
      return "write:admin";
    case "repo":
    case "repository":
    case "write:repository":
      return "write:repository";
    case "read:repository":
      return "read:repository";
    case "org":
    case "organization":
    case "write:organization":
      return "write:organization";
    case "read:organization":
      return "read:organization";
    case "user":
    case "write:user":
      return "write:user";
    case "read:user":
      return "read:user";
    case "read:issue":
      return "read:issue";
    case "write:issue":
      return "write:issue";
    case "read:package":
      return "read:package";
    case "write:package":
      return "write:package";
    case "read:notification":
      return "read:notification";
    case "write:notification":
      return "write:notification";
    case "read:misc":
      return "read:misc";
    case "write:misc":
      return "write:misc";
    case "read:activitypub":
      return "read:activitypub";
    case "write:activitypub":
      return "write:activitypub";
    default:
      return "";
  }
}

/**
 * Verify a PKCE code_verifier against the stored code_challenge using S256.
 */
async function verifyPKCE(
  challenge: string,
  method: string,
  verifier: string
): Promise<boolean> {
  if (method !== "S256") return false;

  const data = new TextEncoder().encode(verifier);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  // base64url encode without padding (RFC 7636)
  let base64 = btoa(String.fromCharCode(...hashArray));
  base64 = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return constantTimeEqual(base64, challenge);
}

/** Constant-time string comparison. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Convert a DB application row to API response (omitting secret hash). */
function toOAuth2ApplicationResponse(
  app: CreateOAuth2ApplicationRow
): OAuth2ApplicationResponse {
  const redirectURIs = app.redirectUris ?? [];
  const scopes = app.scopes ?? [];
  return {
    id: Number(app.id),
    client_id: app.clientId,
    name: app.name,
    redirect_uris: redirectURIs,
    scopes: scopes,
    confidential: app.confidential,
    created_at:
      app.createdAt instanceof Date
        ? app.createdAt.toISOString()
        : String(app.createdAt),
    updated_at:
      app.updatedAt instanceof Date
        ? app.updatedAt.toISOString()
        : String(app.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// OAuth2Service
// ---------------------------------------------------------------------------

export class OAuth2Service {
  private readonly sql: Sql;
  private readonly now: () => Date;

  constructor(sql: Sql, nowFn?: () => Date) {
    this.sql = sql;
    this.now = nowFn ?? (() => new Date());
  }

  // -----------------------------------------------------------------------
  // CreateApplication — matches Go's OAuth2Service.CreateApplication
  // -----------------------------------------------------------------------

  async createApplication(
    ownerID: number,
    req: CreateOAuth2ApplicationRequest
  ): Promise<CreateOAuth2ApplicationResult> {
    const name = (req.name ?? "").trim();
    if (name === "") {
      throw validationFailed({
        resource: "OAuth2Application",
        field: "name",
        code: "missing_field",
      });
    }
    if (name.length > 255) {
      throw validationFailed({
        resource: "OAuth2Application",
        field: "name",
        code: "invalid",
      });
    }

    if (!req.redirect_uris || req.redirect_uris.length === 0) {
      throw validationFailed({
        resource: "OAuth2Application",
        field: "redirect_uris",
        code: "missing_field",
      });
    }
    for (let i = 0; i < req.redirect_uris.length; i++) {
      try {
        const parsed = new URL(req.redirect_uris[i]!);
        if (!parsed.protocol || !parsed.host) {
          throw new Error("missing scheme or host");
        }
      } catch {
        throw validationFailed({
          resource: "OAuth2Application",
          field: `redirect_uris[${i}]`,
          code: "invalid",
        });
      }
    }

    if (req.confidential === undefined || req.confidential === null) {
      throw validationFailed({
        resource: "OAuth2Application",
        field: "confidential",
        code: "missing_field",
      });
    }
    const confidential = req.confidential;

    const clientId = generateOAuth2ClientID();
    const clientSecret = generateOAuth2ClientSecret();
    const secretHash = await sha256Hex(clientSecret);

    const scopes = req.scopes ?? [];

    const app = await createOAuth2Application(this.sql, {
      clientId,
      clientSecretHash: secretHash,
      name,
      redirectUris: req.redirect_uris,
      scopes,
      ownerId: String(ownerID),
      confidential,
    });
    if (!app) {
      throw internal("failed to create oauth2 application");
    }

    return {
      ...toOAuth2ApplicationResponse(app),
      client_secret: clientSecret,
    };
  }

  // -----------------------------------------------------------------------
  // ListApplications — matches Go's OAuth2Service.ListApplications
  // -----------------------------------------------------------------------

  async listApplications(ownerID: number): Promise<OAuth2ApplicationResponse[]> {
    const apps = await listOAuth2ApplicationsByOwner(this.sql, {
      ownerId: String(ownerID),
    });
    return apps.map(toOAuth2ApplicationResponse);
  }

  // -----------------------------------------------------------------------
  // GetApplication — matches Go's OAuth2Service.GetApplication
  // -----------------------------------------------------------------------

  async getApplication(
    appID: number,
    ownerID: number
  ): Promise<OAuth2ApplicationResponse> {
    const app = await getOAuth2ApplicationByID(this.sql, {
      id: String(appID),
    });
    if (!app) {
      throw notFound("oauth2 application not found");
    }
    if (app.ownerId !== String(ownerID)) {
      throw notFound("oauth2 application not found");
    }
    return toOAuth2ApplicationResponse(app);
  }

  // -----------------------------------------------------------------------
  // DeleteApplication — matches Go's OAuth2Service.DeleteApplication
  // -----------------------------------------------------------------------

  async deleteApplication(appID: number, ownerID: number): Promise<void> {
    // deleteOAuth2Application is an :execrows query, run manually
    const result = await this.sql.unsafe(deleteOAuth2ApplicationQuery, [
      String(appID),
      String(ownerID),
    ]);
    if (result.count === 0) {
      throw notFound("oauth2 application not found");
    }
  }

  // -----------------------------------------------------------------------
  // Authorize — matches Go's OAuth2Service.Authorize
  // -----------------------------------------------------------------------

  async authorize(
    userID: number,
    clientID: string,
    redirectURI: string,
    scope: string,
    codeChallenge: string,
    codeChallengeMethod: string
  ): Promise<OAuth2AuthorizeResult> {
    const app = await getOAuth2ApplicationByClientID(this.sql, {
      clientId: clientID,
    });
    if (!app) {
      throw notFound("oauth2 application not found");
    }

    // Validate redirect_uri is registered
    if (!isValidRedirectURI(app.redirectUris, redirectURI)) {
      throw badRequest("invalid redirect_uri");
    }

    // Parse requested scopes
    let requestedScopes = parseScopeString(scope);
    if (requestedScopes.length === 0) {
      requestedScopes = app.scopes ?? [];
    }

    const normalizedAppScopes = new Set<string>();
    for (const registeredScope of app.scopes ?? []) {
      const normalized = normalizeTokenScope(registeredScope);
      if (normalized !== "") {
        normalizedAppScopes.add(normalized);
      }
    }

    const seenRequestedScopes = new Set<string>();
    const normalizedRequestedScopes: string[] = [];
    for (const requested of requestedScopes) {
      const normalized = normalizeTokenScope(requested);
      if (normalized === "") {
        throw badRequest("requested scope exceeds application registered scopes");
      }
      if (!normalizedAppScopes.has(normalized)) {
        throw badRequest("requested scope exceeds application registered scopes");
      }
      if (seenRequestedScopes.has(normalized)) continue;
      seenRequestedScopes.add(normalized);
      normalizedRequestedScopes.push(normalized);
    }

    // Validate PKCE parameters
    const trimmedChallenge = codeChallenge.trim();
    const trimmedMethod = codeChallengeMethod.trim();
    if (trimmedMethod !== "" && trimmedChallenge === "") {
      throw badRequest("code_challenge is required when code_challenge_method is set");
    }
    if (trimmedChallenge !== "" && trimmedMethod !== "S256") {
      throw badRequest("code_challenge_method must be S256");
    }
    if (!app.confidential && trimmedChallenge === "") {
      throw badRequest("code_challenge is required for public clients");
    }

    // Generate authorization code
    const code = generateOAuth2Code();
    const codeHash = await sha256Hex(code);

    await createOAuth2AuthorizationCode(this.sql, {
      codeHash,
      appId: app.id,
      userId: String(userID),
      scopes: normalizedRequestedScopes,
      redirectUri: redirectURI,
      codeChallenge: trimmedChallenge,
      codeChallengeMethod: trimmedMethod,
      expiresAt: new Date(this.now().getTime() + OAUTH2_AUTH_CODE_TTL_MS),
    });

    return {
      code,
      redirect_uri: redirectURI,
    };
  }

  // -----------------------------------------------------------------------
  // ExchangeCode — matches Go's OAuth2Service.ExchangeCode
  // -----------------------------------------------------------------------

  async exchangeCode(
    clientID: string,
    clientSecret: string,
    code: string,
    redirectURI: string,
    codeVerifier: string
  ): Promise<OAuth2TokenResponse> {
    // Validate client credentials
    const app = await getOAuth2ApplicationByClientID(this.sql, {
      clientId: clientID,
    });
    if (!app) {
      throw unauthorized("invalid client_id");
    }

    // Verify client secret for confidential clients
    if (app.confidential) {
      const expectedHash = await sha256Hex(clientSecret);
      if (!constantTimeEqual(expectedHash, app.clientSecretHash)) {
        throw unauthorized("invalid client_secret");
      }
    }

    // Consume the authorization code
    const codeHash = await sha256Hex(code);
    const authCode = await consumeOAuth2AuthorizationCode(this.sql, {
      codeHash,
    });
    if (!authCode) {
      throw badRequest("invalid or expired authorization code");
    }

    // Validate the code belongs to this application
    if (authCode.appId !== app.id) {
      throw badRequest("authorization code does not belong to this application");
    }

    // Validate redirect_uri matches
    if (authCode.redirectUri !== redirectURI) {
      throw badRequest("redirect_uri mismatch");
    }

    if (!app.confidential) {
      if (authCode.codeChallenge === "" || authCode.codeChallengeMethod !== "S256") {
        throw badRequest("public clients require PKCE");
      }
    }

    // Validate PKCE code verifier if challenge was set
    if (authCode.codeChallenge !== "") {
      if (authCode.codeChallengeMethod !== "S256") {
        throw badRequest("code_challenge_method must be S256");
      }
      if (codeVerifier === "") {
        throw badRequest("code_verifier is required");
      }
      const valid = await verifyPKCE(
        authCode.codeChallenge,
        authCode.codeChallengeMethod,
        codeVerifier
      );
      if (!valid) {
        throw badRequest("invalid code_verifier");
      }
    }

    return this.issueTokenPair(app.id, authCode.userId, authCode.scopes);
  }

  // -----------------------------------------------------------------------
  // RefreshToken — matches Go's OAuth2Service.RefreshToken
  // -----------------------------------------------------------------------

  async refreshToken(
    clientID: string,
    clientSecret: string,
    refreshTokenValue: string
  ): Promise<OAuth2TokenResponse> {
    // Validate client credentials
    const app = await getOAuth2ApplicationByClientID(this.sql, {
      clientId: clientID,
    });
    if (!app) {
      throw unauthorized("invalid client_id");
    }

    // Verify client secret for confidential clients
    if (app.confidential) {
      const expectedHash = await sha256Hex(clientSecret);
      if (!constantTimeEqual(expectedHash, app.clientSecretHash)) {
        throw unauthorized("invalid client_secret");
      }
    }

    const tokenHash = await sha256Hex(refreshTokenValue);

    // Validate ownership before consuming
    const token = await getOAuth2RefreshTokenByHash(this.sql, { tokenHash });
    if (!token) {
      throw badRequest("invalid or expired refresh token");
    }
    if (token.appId !== app.id) {
      throw badRequest("refresh token does not belong to this application");
    }

    // Consume the refresh token atomically
    const oldToken = await consumeOAuth2RefreshToken(this.sql, { tokenHash });
    if (!oldToken) {
      throw badRequest("invalid or expired refresh token");
    }
    if (oldToken.scopes === null) {
      throw badRequest("refresh token must be reauthorized");
    }

    return this.issueTokenPair(app.id, oldToken.userId, oldToken.scopes);
  }

  // -----------------------------------------------------------------------
  // RevokeToken — matches Go's OAuth2Service.RevokeToken (RFC 7009)
  // -----------------------------------------------------------------------

  async revokeToken(token: string): Promise<void> {
    const tokenHash = await sha256Hex(token);

    // Try revoking as access token first
    const accessResult = await this.sql.unsafe(
      deleteOAuth2AccessTokenByHashQuery,
      [tokenHash]
    );
    if (accessResult.count > 0) {
      return;
    }

    // Try revoking as refresh token
    // Per RFC 7009, revocation of an invalid token is not an error
    await this.sql.unsafe(deleteOAuth2RefreshTokenByHashQuery, [tokenHash]);
  }

  // -----------------------------------------------------------------------
  // issueTokenPair — matches Go's OAuth2Service.issueTokenPair
  // -----------------------------------------------------------------------

  private async issueTokenPair(
    appID: string,
    userID: string,
    scopes: string[] | null
  ): Promise<OAuth2TokenResponse> {
    const now = this.now();
    const resolvedScopes = scopes ?? [];

    // Generate access token
    const accessTokenValue = generateOAuth2Token();
    const accessToken = "jjhub_oat_" + accessTokenValue;
    const accessTokenHash = await sha256Hex(accessToken);

    const createdAccessToken = await createOAuth2AccessToken(this.sql, {
      tokenHash: accessTokenHash,
      appId: appID,
      userId: userID,
      scopes: resolvedScopes,
      expiresAt: new Date(now.getTime() + OAUTH2_ACCESS_TOKEN_TTL_MS),
    });
    if (!createdAccessToken) {
      throw internal("failed to create access token");
    }

    // Generate refresh token
    const refreshTokenValue = generateOAuth2Token();
    const newRefreshToken = "jjhub_ort_" + refreshTokenValue;
    const refreshTokenHash = await sha256Hex(newRefreshToken);

    const createdRefreshToken = await createOAuth2RefreshToken(this.sql, {
      tokenHash: refreshTokenHash,
      appId: appID,
      userId: userID,
      scopes: resolvedScopes,
      expiresAt: new Date(now.getTime() + OAUTH2_REFRESH_TOKEN_TTL_MS),
    });
    if (!createdRefreshToken) {
      throw internal("failed to create refresh token");
    }

    const response: OAuth2TokenResponse = {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: Math.floor(OAUTH2_ACCESS_TOKEN_TTL_MS / 1000),
      refresh_token: newRefreshToken,
    };

    if (resolvedScopes.length > 0) {
      response.scope = resolvedScopes.join(" ");
    }

    return response;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createOAuth2Service(sql: Sql, nowFn?: () => Date): OAuth2Service {
  return new OAuth2Service(sql, nowFn);
}
