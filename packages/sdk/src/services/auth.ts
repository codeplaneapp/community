import { createHash, randomBytes, randomUUID } from "crypto";
import type { Sql } from "postgres";

import {
  APIError,
  internal,
  unauthorized,
  forbidden,
  conflict,
  badRequest,
  notFound,
  validationFailed,
  type FieldError,
} from "../lib/errors";

import {
  createAuthNonce,
  consumeAuthNonceQuery,
  createOAuthState,
  consumeOAuthStateQuery,
  createAuthSession,
  deleteAuthSession,
  listUserSessions,
  createAccessToken,
  listAccessTokensByUserID,
  deleteAccessTokenByIDAndUserIDQuery,
  upsertOAuthAccount,
  upsertEmailAddress,
  getOAuthAccountByProviderUserID,
} from "../db/auth_sql";

import {
  getUserByWalletAddress,
  createUserWithWallet,
  getUserByID,
  createUser,
} from "../db/users_sql";

import {
  isWhitelistedIdentity,
} from "../db/alpha_access_sql";

// ---------------------------------------------------------------------------
// Types matching Go's services layer
// ---------------------------------------------------------------------------

export interface VerifyKeyAuthResult {
  user: { id: string; username: string; isAdmin: boolean; prohibitLogin: boolean };
  sessionKey: string;
  expiresAt: Date;
}

export interface OAuthCallbackResult {
  user: { id: string; username: string; isAdmin: boolean; prohibitLogin: boolean };
  sessionKey: string;
  expiresAt: Date;
  redirectUrl: string;
}

export interface CreateTokenRequest {
  name: string;
  scopes: string[];
}

export interface TokenSummary {
  id: string;
  name: string;
  tokenLastEight: string;
  scopes: string[];
}

export interface CreateTokenResult extends TokenSummary {
  token: string;
}

export interface GitHubTokenResult {
  accessToken: string;
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

// ---------------------------------------------------------------------------
// Interfaces — match Go's KeyAuthVerifier and GitHubClient
// ---------------------------------------------------------------------------

export interface KeyAuthVerifier {
  verify(
    message: string,
    signature: string,
    expectedDomain: string
  ): { walletAddress: string; nonce: string };
}

export interface GitHubClient {
  exchangeCode(code: string): Promise<GitHubTokenResult>;
  fetchUser(accessToken: string): Promise<GitHubUserProfile>;
  fetchEmails(accessToken: string): Promise<GitHubEmail[]>;
}

// ---------------------------------------------------------------------------
// AuthService interface — matches Go's routes.AuthService
// ---------------------------------------------------------------------------

export interface AuthService {
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
    userId: string,
    req: CreateTokenRequest
  ): Promise<CreateTokenResult>;
  logout(sessionKey: string): Promise<void>;
  listUserSessions(
    userId: string
  ): Promise<
    Array<{
      sessionKey: string;
      userId: string;
      username: string;
      isAdmin: boolean;
      expiresAt: Date;
      createdAt: Date;
    }>
  >;
  revokeUserSession(userId: string, sessionKey: string): Promise<void>;
  listTokens(userId: string): Promise<TokenSummary[]>;
  deleteToken(userId: string, tokenId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Config — matches Go's config.AuthConfig
// ---------------------------------------------------------------------------

export interface AuthConfig {
  sessionCookieName: string;
  cookieSecure: boolean;
  sessionDuration: string;
  sessionSecret: string;
  keyAuthDomain: string;
  closedAlphaEnabled: boolean;
  githubClientId: string;
  githubClientSecret: string;
  githubRedirectUrl: string;
  githubOAuthBaseUrl: string;
}

// ---------------------------------------------------------------------------
// Constants — match Go's whitelist identity types
// ---------------------------------------------------------------------------

const WHITELIST_IDENTITY_EMAIL = "email";
const WHITELIST_IDENTITY_WALLET = "wallet";
const WHITELIST_IDENTITY_USERNAME = "username";

const DEFAULT_GITHUB_REDIRECT_URL =
  "http://localhost:4000/api/auth/github/callback";
const DEFAULT_GITHUB_OAUTH_BASE_URL = "https://github.com";

// ---------------------------------------------------------------------------
// Valid token scopes — matches Go's middleware.NormalizeTokenScope
// ---------------------------------------------------------------------------

const SCOPE_ALL = "all";
const SCOPE_ADMIN = "admin";
const SCOPE_READ_ADMIN = "read:admin";
const SCOPE_WRITE_ADMIN = "write:admin";

function normalizeTokenScope(raw: string): string {
  const scope = raw.trim().toLowerCase();
  if (scope === "") return "";

  switch (scope) {
    case "all":
      return SCOPE_ALL;
    case "admin":
      return SCOPE_ADMIN;
    case "read:admin":
    case "admin:read":
      return SCOPE_READ_ADMIN;
    case "write:admin":
    case "admin:write":
      return SCOPE_WRITE_ADMIN;
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
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Helpers — match Go helper functions
// ---------------------------------------------------------------------------

function randomHex(bytesLen: number): string {
  return randomBytes(bytesLen).toString("hex");
}

function generateSessionKey(): string {
  return randomUUID();
}

function hashSHA256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isValidUUID(s: string): boolean {
  if (s.length !== 36) return false;
  for (let i = 0; i < s.length; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      if (s[i] !== "-") return false;
    } else {
      const ch = s.charCodeAt(i);
      if (
        !(ch >= 0x30 && ch <= 0x39) && // 0-9
        !(ch >= 0x61 && ch <= 0x66) && // a-f
        !(ch >= 0x41 && ch <= 0x46) // A-F
      ) {
        return false;
      }
    }
  }
  return true;
}

function splitScopes(raw: string): string[] {
  if (raw.trim() === "") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

function containsPrivilegedScope(scopes: string[]): boolean {
  return scopes.some(
    (s) =>
      s === SCOPE_ADMIN ||
      s === SCOPE_READ_ADMIN ||
      s === SCOPE_WRITE_ADMIN ||
      s === SCOPE_ALL
  );
}

function pickEmail(emails: GitHubEmail[]): string {
  for (const email of emails) {
    if (email.primary && email.verified) return email.email;
  }
  for (const email of emails) {
    if (email.verified) return email.email;
  }
  if (emails.length > 0) return emails[0]!.email;
  return "";
}

function walletUsername(walletAddress: string): string {
  const normalized = walletAddress.trim().toLowerCase();
  if (normalized.length >= 8) {
    return "wallet-" + normalized.slice(-8);
  }
  return "wallet-" + randomHex(4);
}

function firstNonEmpty(...values: string[]): string {
  for (const value of values) {
    if (value.trim() !== "") return value;
  }
  return "";
}

/**
 * Check if a Postgres error is a unique constraint violation (23505).
 * postgres.js throws errors with a code property.
 */
function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  return (err as any).code === "23505";
}

// ---------------------------------------------------------------------------
// Whitelist identity normalization — matches Go's NormalizeWhitelistIdentity
// ---------------------------------------------------------------------------

interface ClosedAlphaIdentity {
  identityType: string;
  identityValue: string;
}

function normalizeWhitelistIdentity(
  identityType: string,
  identityValue: string
): { kind: string; value: string; lower: string } | null {
  const kind = identityType.trim().toLowerCase();
  const value = identityValue.trim();
  if (kind === "" || value === "") return null;

  switch (kind) {
    case WHITELIST_IDENTITY_EMAIL: {
      const lowerEmail = value.toLowerCase();
      if (!lowerEmail.includes("@")) return null;
      return { kind, value: lowerEmail, lower: lowerEmail };
    }
    case WHITELIST_IDENTITY_WALLET: {
      const wallet = value.toLowerCase();
      if (wallet.length !== 42 || !wallet.startsWith("0x")) return null;
      for (let i = 2; i < wallet.length; i++) {
        const ch = wallet.charCodeAt(i);
        if (
          !(ch >= 0x30 && ch <= 0x39) &&
          !(ch >= 0x61 && ch <= 0x66)
        )
          return null;
      }
      return { kind, value: wallet, lower: wallet };
    }
    case WHITELIST_IDENTITY_USERNAME: {
      const lower = value.toLowerCase();
      return { kind, value: lower, lower };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// DatabaseAuthService — real implementation
// ---------------------------------------------------------------------------

export class DatabaseAuthService implements AuthService {
  private sql: Sql;
  private cfg: AuthConfig;
  private keyAuthVerifier: KeyAuthVerifier | null;
  private githubClient: GitHubClient | null;

  constructor(
    sql: Sql,
    cfg: AuthConfig,
    keyAuthVerifier: KeyAuthVerifier | null = null,
    githubClient: GitHubClient | null = null
  ) {
    this.sql = sql;
    this.cfg = cfg;
    this.keyAuthVerifier = keyAuthVerifier;
    this.githubClient = githubClient;
  }

  // -----------------------------------------------------------------------
  // Session duration — matches Go's sessionDuration()
  // -----------------------------------------------------------------------

  private sessionDuration(): number {
    const defaultMs = 720 * 60 * 60 * 1000; // 720h in ms
    const raw = this.cfg.sessionDuration;
    if (!raw) return defaultMs;

    // Parse Go-style duration strings like "720h", "30m", "24h"
    const match = raw.match(/^(\d+)(h|m|s)$/);
    if (!match) return defaultMs;

    const value = parseInt(match[1]!, 10);
    let ms: number;
    switch (match[2]!) {
      case "h":
        ms = value * 60 * 60 * 1000;
        break;
      case "m":
        ms = value * 60 * 1000;
        break;
      case "s":
        ms = value * 1000;
        break;
      default:
        return defaultMs;
    }
    // Match Go: if duration <= 0, fall back to default
    if (ms <= 0) return defaultMs;
    return ms;
  }

  private keyAuthExpectedDomain(): string {
    return this.cfg.keyAuthDomain.trim();
  }

  // -----------------------------------------------------------------------
  // Closed Alpha / Whitelist — matches Go's enforceClosedBetaForUser
  // -----------------------------------------------------------------------

  private async isAnyClosedBetaIdentityWhitelisted(
    identities: ClosedAlphaIdentity[]
  ): Promise<boolean> {
    const seen = new Set<string>();

    for (const candidate of identities) {
      const normalized = normalizeWhitelistIdentity(
        candidate.identityType,
        candidate.identityValue
      );
      if (!normalized) continue;

      const dedupeKey = normalized.kind + ":" + normalized.lower;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const row = await isWhitelistedIdentity(this.sql, {
        identityType: normalized.kind,
        lowerIdentityValue: normalized.lower,
      });
      if (row?.exists) return true;
    }

    return false;
  }

  private async enforceClosedBetaForUser(
    user: {
      id: string;
      username: string;
      isAdmin: boolean;
      email?: string | null;
      walletAddress?: string | null;
    },
    extra: ClosedAlphaIdentity[]
  ): Promise<void> {
    if (!this.cfg.closedAlphaEnabled) return;
    if (user.isAdmin) return;

    const identities: ClosedAlphaIdentity[] = [...extra];
    identities.push({
      identityType: WHITELIST_IDENTITY_USERNAME,
      identityValue: user.username,
    });
    if (user.email && user.email.trim() !== "") {
      identities.push({
        identityType: WHITELIST_IDENTITY_EMAIL,
        identityValue: user.email,
      });
    }
    if (user.walletAddress && user.walletAddress.trim() !== "") {
      identities.push({
        identityType: WHITELIST_IDENTITY_WALLET,
        identityValue: user.walletAddress,
      });
    }

    const allowed = await this.isAnyClosedBetaIdentityWhitelisted(identities);
    if (!allowed) {
      throw forbidden("closed alpha access requires a whitelist invite");
    }
  }

  // -----------------------------------------------------------------------
  // CreateKeyAuthNonce — matches Go's AuthService.CreateKeyAuthNonce
  // -----------------------------------------------------------------------

  async createKeyAuthNonce(): Promise<string> {
    const nonce = randomHex(16);
    const row = await createAuthNonce(this.sql, {
      nonce,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    if (!row) {
      throw internal("failed to create auth nonce");
    }
    return nonce;
  }

  // -----------------------------------------------------------------------
  // VerifyKeyAuth — matches Go's AuthService.VerifyKeyAuth
  // -----------------------------------------------------------------------

  async verifyKeyAuth(
    message: string,
    signature: string
  ): Promise<VerifyKeyAuthResult> {
    if (!this.keyAuthVerifier) {
      throw internal("key auth verifier is not configured");
    }

    const expectedDomain = this.keyAuthExpectedDomain();
    if (expectedDomain === "") {
      throw internal("key auth domain is not configured");
    }

    let walletAddress: string;
    let nonce: string;
    try {
      const result = this.keyAuthVerifier.verify(
        message,
        signature,
        expectedDomain
      );
      walletAddress = result.walletAddress;
      nonce = result.nonce;
    } catch {
      throw unauthorized("invalid signature");
    }

    // Consume the nonce (execrows query - run manually)
    const consumeResult = await this.sql.unsafe(consumeAuthNonceQuery, [
      walletAddress || null,
      nonce,
    ]);
    const rowsAffected = consumeResult.count;
    if (rowsAffected === 0) {
      throw unauthorized("invalid or expired nonce");
    }

    // Look up or create user by wallet address
    let user = await getUserByWalletAddress(this.sql, {
      walletAddress: walletAddress || null,
    });

    if (!user) {
      // User doesn't exist yet — check closed alpha if enabled
      if (this.cfg.closedAlphaEnabled) {
        const allowed = await this.isAnyClosedBetaIdentityWhitelisted([
          {
            identityType: WHITELIST_IDENTITY_WALLET,
            identityValue: walletAddress,
          },
        ]);
        if (!allowed) {
          throw forbidden(
            "closed alpha access requires a whitelist invite"
          );
        }
      }

      const username = walletUsername(walletAddress);
      try {
        user = await createUserWithWallet(this.sql, {
          username,
          lowerUsername: username.toLowerCase(),
          displayName: username,
          walletAddress: walletAddress || null,
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict("wallet address is already in use");
        }
        throw internal("failed to create wallet user");
      }

      if (!user) {
        throw internal("failed to create wallet user");
      }
    }

    if (user.prohibitLogin) {
      throw forbidden("account is suspended");
    }

    await this.enforceClosedBetaForUser(
      {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        walletAddress: user.walletAddress,
      },
      [
        {
          identityType: WHITELIST_IDENTITY_WALLET,
          identityValue: walletAddress,
        },
      ]
    );

    const sessionKey = generateSessionKey();
    const expiresAt = new Date(Date.now() + this.sessionDuration());
    const session = await createAuthSession(this.sql, {
      sessionKey,
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      expiresAt,
    });
    if (!session) {
      throw internal("failed to create session");
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        prohibitLogin: user.prohibitLogin,
      },
      sessionKey: session.sessionKey,
      expiresAt: session.expiresAt,
    };
  }

  // -----------------------------------------------------------------------
  // StartGitHubOAuth — matches Go's AuthService.StartGitHubOAuth
  // -----------------------------------------------------------------------

  async startGitHubOAuth(stateVerifier: string): Promise<string> {
    if (
      !this.githubClient ||
      !this.cfg.githubClientId.trim() ||
      !this.cfg.githubClientSecret.trim()
    ) {
      throw internal("github oauth is not configured");
    }

    let redirectUrl = this.cfg.githubRedirectUrl.trim();
    if (redirectUrl === "") {
      redirectUrl = DEFAULT_GITHUB_REDIRECT_URL;
    }
    if (stateVerifier.trim() === "") {
      throw badRequest("invalid oauth state");
    }

    const state = randomHex(16);
    const row = await createOAuthState(this.sql, {
      state,
      contextHash: hashSHA256(stateVerifier.trim()),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
    if (!row) {
      throw internal("failed to create oauth state");
    }

    const params = new URLSearchParams();
    params.set("client_id", this.cfg.githubClientId.trim());
    params.set("redirect_uri", redirectUrl);
    params.set("scope", "read:user user:email");
    params.set("state", state);

    let oauthBaseUrl = this.cfg.githubOAuthBaseUrl.trim();
    if (oauthBaseUrl === "") {
      oauthBaseUrl = DEFAULT_GITHUB_OAUTH_BASE_URL;
    }

    return (
      oauthBaseUrl.replace(/\/+$/, "") +
      "/login/oauth/authorize?" +
      params.toString()
    );
  }

  // -----------------------------------------------------------------------
  // CompleteGitHubOAuth — matches Go's AuthService.CompleteGitHubOAuth
  // -----------------------------------------------------------------------

  async completeGitHubOAuth(
    code: string,
    state: string,
    stateVerifier: string
  ): Promise<OAuthCallbackResult> {
    if (code.trim() === "") {
      throw badRequest("invalid oauth code");
    }
    if (state.trim() === "") {
      throw badRequest("invalid oauth state");
    }
    if (stateVerifier.trim() === "") {
      throw unauthorized("invalid oauth state");
    }

    // Consume OAuth state (execrows query - run manually)
    const consumeResult = await this.sql.unsafe(consumeOAuthStateQuery, [
      state,
      hashSHA256(stateVerifier.trim()),
    ]);
    if (consumeResult.count === 0) {
      throw unauthorized("invalid oauth state");
    }

    if (!this.githubClient) {
      throw internal("github oauth is not configured");
    }

    const tokenResult = await this.githubClient
      .exchangeCode(code)
      .catch(() => {
        throw badRequest("failed to exchange github oauth code");
      });

    const profile = await this.githubClient
      .fetchUser(tokenResult.accessToken)
      .catch(() => {
        throw internal("failed to fetch github profile");
      });

    const emails = await this.githubClient
      .fetchEmails(tokenResult.accessToken)
      .catch(() => {
        throw internal("failed to fetch github emails");
      });

    // Build candidate identities for closed alpha check
    const candidateIdentities: ClosedAlphaIdentity[] = [
      {
        identityType: WHITELIST_IDENTITY_USERNAME,
        identityValue: profile.login,
      },
    ];
    for (const email of emails) {
      if (email.email.trim() === "") continue;
      candidateIdentities.push({
        identityType: WHITELIST_IDENTITY_EMAIL,
        identityValue: email.email,
      });
    }

    const providerUserId = String(profile.id);
    const account = await getOAuthAccountByProviderUserID(this.sql, {
      provider: "github",
      providerUserId,
    });

    let user: {
      id: string;
      username: string;
      isAdmin: boolean;
      prohibitLogin: boolean;
      email?: string | null;
      walletAddress?: string | null;
    };

    if (account) {
      // Existing OAuth account — load the user
      const existingUser = await getUserByID(this.sql, {
        id: account.userId,
      });
      if (!existingUser) {
        throw internal("failed to load oauth user");
      }
      user = existingUser;
    } else {
      // New OAuth account — check closed alpha and create user
      if (this.cfg.closedAlphaEnabled) {
        const allowed =
          await this.isAnyClosedBetaIdentityWhitelisted(
            candidateIdentities
          );
        if (!allowed) {
          throw forbidden(
            "closed alpha access requires a whitelist invite"
          );
        }
      }

      const email = pickEmail(emails);
      try {
        const newUser = await createUser(this.sql, {
          username: profile.login,
          lowerUsername: profile.login.toLowerCase(),
          email: email || null,
          lowerEmail: email ? email.toLowerCase() : null,
          displayName: firstNonEmpty(profile.name, profile.login),
        });
        if (!newUser) {
          throw internal("failed to create oauth user");
        }
        user = newUser;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw conflict("email address is already in use");
        }
        if (err instanceof APIError) throw err;
        throw internal("failed to create oauth user");
      }
    }

    if (user.prohibitLogin) {
      throw forbidden("account is suspended");
    }

    await this.enforceClosedBetaForUser(user, candidateIdentities);

    // Upsert OAuth account (stub encrypted token as null for CE)
    await upsertOAuthAccount(this.sql, {
      userId: user.id,
      provider: "github",
      providerUserId,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      profileData: profile,
    });

    // Upsert email address
    const email = pickEmail(emails);
    if (email) {
      await upsertEmailAddress(this.sql, {
        userId: user.id,
        email,
        lowerEmail: email.toLowerCase(),
        isActivated: true,
        isPrimary: true,
      });
    }

    // Create session
    const sessionKey = generateSessionKey();
    const expiresAt = new Date(Date.now() + this.sessionDuration());
    const session = await createAuthSession(this.sql, {
      sessionKey,
      userId: user.id,
      username: user.username,
      isAdmin: user.isAdmin,
      expiresAt,
    });
    if (!session) {
      throw internal("failed to create session");
    }

    return {
      user: {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin,
        prohibitLogin: user.prohibitLogin,
      },
      sessionKey: session.sessionKey,
      expiresAt: session.expiresAt,
      redirectUrl: "/",
    };
  }

  // -----------------------------------------------------------------------
  // Logout — matches Go's AuthService.Logout
  // -----------------------------------------------------------------------

  async logout(sessionKey: string): Promise<void> {
    if (sessionKey.trim() === "") return;
    if (!isValidUUID(sessionKey)) return;
    await deleteAuthSession(this.sql, { sessionKey });
  }

  // -----------------------------------------------------------------------
  // ListUserSessions — matches Go's AuthService.ListUserSessions
  // -----------------------------------------------------------------------

  async listUserSessions(userId: string) {
    return listUserSessions(this.sql, { userId });
  }

  // -----------------------------------------------------------------------
  // RevokeUserSession — matches Go's AuthService.RevokeUserSession
  // -----------------------------------------------------------------------

  async revokeUserSession(
    userId: string,
    sessionKey: string
  ): Promise<void> {
    if (sessionKey.trim() === "" || !isValidUUID(sessionKey)) {
      throw notFound("session not found");
    }

    const sessions = await listUserSessions(this.sql, { userId });
    const ownsSession = sessions.some(
      (session) => session.sessionKey === sessionKey
    );
    if (!ownsSession) {
      throw notFound("session not found");
    }

    await deleteAuthSession(this.sql, { sessionKey });
  }

  // -----------------------------------------------------------------------
  // ListTokens — matches Go's AuthService.ListTokens
  // -----------------------------------------------------------------------

  async listTokens(userId: string): Promise<TokenSummary[]> {
    const tokens = await listAccessTokensByUserID(this.sql, { userId });
    return tokens.map((token) => ({
      id: token.id,
      name: token.name,
      tokenLastEight: token.tokenLastEight,
      scopes: splitScopes(token.scopes),
    }));
  }

  // -----------------------------------------------------------------------
  // CreateToken — matches Go's AuthService.CreateToken
  // -----------------------------------------------------------------------

  async createToken(
    userId: string,
    req: CreateTokenRequest
  ): Promise<CreateTokenResult> {
    // Validate name
    const name = (req.name ?? "").trim();
    if (name === "") {
      throw validationFailed({
        resource: "AccessToken",
        field: "name",
        code: "missing_field",
      });
    }

    // Validate and normalize scopes
    if (!req.scopes || req.scopes.length === 0) {
      throw validationFailed({
        resource: "AccessToken",
        field: "scopes",
        code: "missing_field",
      });
    }

    const seen = new Set<string>();
    const normalizedScopes: string[] = [];
    const validationErrors: FieldError[] = [];

    for (let i = 0; i < req.scopes.length; i++) {
      const scope = normalizeTokenScope(req.scopes[i]!);
      if (scope === "") {
        validationErrors.push({
          resource: "AccessToken",
          field: `scopes[${i}]`,
          code: "invalid",
        });
        continue;
      }

      if (!seen.has(scope)) {
        seen.add(scope);
        normalizedScopes.push(scope);
      }
    }

    if (validationErrors.length > 0) {
      throw validationFailed(...validationErrors);
    }

    normalizedScopes.sort();

    // Check for privileged scopes
    if (containsPrivilegedScope(normalizedScopes)) {
      const user = await getUserByID(this.sql, { id: userId });
      if (!user) {
        throw internal("failed to resolve user");
      }
      if (!user.isAdmin) {
        throw forbidden(
          "insufficient privileges for requested token scopes"
        );
      }
    }

    // Generate token
    const rawToken = "codeplane_" + randomHex(20);
    const tokenHash = hashSHA256(rawToken);
    const tokenLastEight = tokenHash.slice(-8);

    const created = await createAccessToken(this.sql, {
      userId,
      name,
      tokenHash,
      tokenLastEight,
      scopes: normalizedScopes.join(","),
    });
    if (!created) {
      throw internal("failed to create access token");
    }

    return {
      id: created.id,
      name: created.name,
      tokenLastEight: created.tokenLastEight,
      scopes: splitScopes(created.scopes),
      token: rawToken,
    };
  }

  // -----------------------------------------------------------------------
  // DeleteToken — matches Go's AuthService.DeleteToken
  // -----------------------------------------------------------------------

  async deleteToken(userId: string, tokenId: string): Promise<void> {
    // deleteAccessTokenByIDAndUserID is an execrows query - run manually
    const result = await this.sql.unsafe(
      deleteAccessTokenByIDAndUserIDQuery,
      [tokenId, userId]
    );
    if (result.count === 0) {
      throw notFound("token not found");
    }
  }
}

// ---------------------------------------------------------------------------
// Factory — reads config from environment
// ---------------------------------------------------------------------------

export function getAuthConfig(): AuthConfig {
  return {
    sessionCookieName:
      process.env.CODEPLANE_AUTH_SESSION_COOKIE_NAME || "codeplane_session",
    cookieSecure: process.env.CODEPLANE_AUTH_COOKIE_SECURE === "true",
    sessionDuration: process.env.CODEPLANE_AUTH_SESSION_DURATION || "720h",
    sessionSecret: process.env.CODEPLANE_AUTH_SESSION_SECRET || "",
    keyAuthDomain:
      process.env.CODEPLANE_AUTH_KEY_AUTH_DOMAIN || "",
    closedAlphaEnabled:
      process.env.CODEPLANE_AUTH_CLOSED_ALPHA_ENABLED === "true",
    githubClientId: process.env.CODEPLANE_AUTH_GITHUB_CLIENT_ID || "",
    githubClientSecret:
      process.env.CODEPLANE_AUTH_GITHUB_CLIENT_SECRET || "",
    githubRedirectUrl:
      process.env.CODEPLANE_AUTH_GITHUB_REDIRECT_URL || "",
    githubOAuthBaseUrl:
      process.env.CODEPLANE_AUTH_GITHUB_OAUTH_BASE_URL || "",
  };
}

export function createAuthService(
  sql: Sql,
  cfg?: AuthConfig,
  keyAuthVerifier?: KeyAuthVerifier | null,
  githubClient?: GitHubClient | null
): DatabaseAuthService {
  return new DatabaseAuthService(
    sql,
    cfg ?? getAuthConfig(),
    keyAuthVerifier ?? null,
    githubClient ?? null
  );
}
