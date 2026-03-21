import { Hono } from "hono";
import {
  APIError,
  unauthorized,
  badRequest,
  validationFailed,
  writeError,
  writeJSON,
  writeRouteError,
  getUser,
  type AuthUser,
} from "@jjhub/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Constants — match Go's services/user.go
// ---------------------------------------------------------------------------

const USER_DEFAULT_PER_PAGE = 30;
const USER_MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Types — match Go's JSON shapes exactly.
// Exported for use by service layer when implemented.
// ---------------------------------------------------------------------------

export interface UserProfile {
  id: number;
  username: string;
  display_name: string;
  email: string;
  bio: string;
  avatar_url: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicUserProfile {
  id: number;
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
}

export interface RepoSummary {
  id: number;
  owner: string;
  full_name: string;
  name: string;
  description: string;
  is_public: boolean;
  num_stars: number;
  default_bookmark: string;
  created_at: string;
  updated_at: string;
}

export interface OrgSummary {
  id: number;
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}

export interface RepoListResult {
  items: RepoSummary[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface OrgListResult {
  items: OrgSummary[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface ActivitySummary {
  id: number;
  event_type: string;
  action: string;
  actor_username: string;
  target_type: string;
  target_name: string;
  summary: string;
  created_at: string;
}

export interface ActivityListResult {
  items: ActivitySummary[];
  total_count: number;
  page: number;
  per_page: number;
}

export interface TokenSummary {
  id: number;
  name: string;
  token_last_eight: string;
  scopes: string[];
}

export interface CreateTokenRequest {
  name: string;
  scopes: string[];
}

export interface CreateTokenResult extends TokenSummary {
  token: string;
}

export interface SessionResponse {
  id: string;
  created_at: string;
  expires_at: string;
}

export interface EmailResponse {
  id: number;
  email: string;
  is_activated: boolean;
  is_primary: boolean;
  created_at: string;
}

export interface AddEmailRequest {
  email: string;
  is_primary: boolean;
}

export interface NotificationPreferences {
  email_notifications_enabled: boolean;
}

export interface UpdateNotificationPreferencesRequest {
  email_notifications_enabled?: boolean;
}

export interface ConnectedAccountResponse {
  id: number;
  provider: string;
  provider_user_id: string;
  created_at: string;
  updated_at: string;
}

interface PatchUserRequest {
  display_name?: string;
  bio?: string;
  avatar_url?: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Pagination helpers — match Go's parseUserPagination / setPaginationHeaders
// ---------------------------------------------------------------------------

function hasLegacyPagination(query: URLSearchParams): boolean {
  return (
    (query.get("page") ?? "").trim() !== "" ||
    (query.get("per_page") ?? "").trim() !== ""
  );
}

function parseLegacyPagination(
  query: URLSearchParams,
  defaultLimit: number,
  maxLimit: number,
  capOversized: boolean
): { cursor: string; limit: number } | APIError {
  let page = 1;
  let limit = defaultLimit;

  const rawPage = (query.get("page") ?? "").trim();
  if (rawPage !== "") {
    const parsed = parseInt(rawPage, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return badRequest("invalid page value");
    }
    page = parsed;
  }

  const rawPerPage = (query.get("per_page") ?? "").trim();
  if (rawPerPage !== "") {
    const parsed = parseInt(rawPerPage, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return badRequest("invalid per_page value");
    }
    if (parsed > maxLimit) {
      if (capOversized) {
        limit = maxLimit;
      } else {
        return badRequest("per_page must not exceed 100");
      }
    } else {
      limit = parsed;
    }
  }

  const offset = (page - 1) * limit;
  return { cursor: offsetToCursor(offset), limit };
}

function offsetToCursor(offset: number): string {
  if (offset <= 0) return "";
  return String(offset);
}

function cursorToOffset(cursor: string): number {
  if (!cursor) return 0;
  const n = parseInt(cursor, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

function cursorToPage(cursor: string, limit: number): number {
  const offset = cursorToOffset(cursor);
  if (limit <= 0) limit = 30;
  return Math.floor(offset / limit) + 1;
}

function parseUserPagination(
  query: URLSearchParams
): { cursor: string; limit: number } | APIError {
  if (hasLegacyPagination(query)) {
    return parseLegacyPagination(
      query,
      USER_DEFAULT_PER_PAGE,
      USER_MAX_PER_PAGE,
      true
    );
  }

  const cursor = (query.get("cursor") ?? "").trim();

  let limit = USER_DEFAULT_PER_PAGE;
  const rawLimit = (query.get("limit") ?? "").trim();
  if (rawLimit !== "") {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return badRequest("invalid limit");
    }
    limit = parsed > USER_MAX_PER_PAGE ? USER_MAX_PER_PAGE : parsed;
  }

  return { cursor, limit };
}

/**
 * Set pagination response headers. Matches Go's setPaginationHeaders.
 * Sets X-Total-Count and Link headers for page-based navigation.
 */
export function setPaginationHeaders(
  c: { header: (name: string, value: string) => void; req: { url: string } },
  cursorOrPage: string | number,
  limit: number,
  _resultCount: number,
  total: number
): void {
  c.header("X-Total-Count", String(total));

  let currentPage = 1;
  if (typeof cursorOrPage === "number") {
    currentPage = cursorOrPage;
  } else {
    currentPage = cursorToPage(cursorOrPage, limit);
  }

  const totalPages = Math.ceil(total / limit);
  const url = new URL(c.req.url);
  const path = url.pathname;

  // Build Link headers matching Go's setLegacyPaginationHeaders
  const links: string[] = [];

  // first
  links.push(`<${buildPageUrl(path, url.searchParams, 1, limit)}>; rel="first"`);

  // prev
  if (currentPage > 1) {
    links.push(
      `<${buildPageUrl(path, url.searchParams, currentPage - 1, limit)}>; rel="prev"`
    );
  }

  // next
  if (currentPage < totalPages) {
    links.push(
      `<${buildPageUrl(path, url.searchParams, currentPage + 1, limit)}>; rel="next"`
    );
  }

  // last
  if (totalPages > 0) {
    links.push(
      `<${buildPageUrl(path, url.searchParams, totalPages, limit)}>; rel="last"`
    );
  }

  if (links.length > 0) {
    c.header("Link", links.join(", "));
  }
}

function buildPageUrl(
  path: string,
  existing: URLSearchParams,
  page: number,
  perPage: number
): string {
  const q = new URLSearchParams();
  for (const [k, v] of existing) {
    if (k === "page" || k === "per_page" || k === "cursor" || k === "limit")
      continue;
    q.append(k, v);
  }
  q.set("page", String(page));
  q.set("per_page", String(perPage));
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

// ---------------------------------------------------------------------------
// Validation helpers — match Go's isValidAvatarURL
// ---------------------------------------------------------------------------

function isValidAvatarURL(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.host !== "";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Require authenticated user helper
// ---------------------------------------------------------------------------

function requireUser(c: any): AuthUser | null {
  const user = getUser(c);
  if (!user) return null;
  return user;
}

/**
 * Parse JSON body, returning an APIError on failure.
 * Matches Go's decodeJSONBody pattern.
 */
async function decodeJSONBody<T>(c: { req: { json: () => Promise<T> } }): Promise<T | APIError> {
  try {
    return await c.req.json();
  } catch {
    return badRequest("invalid request body");
  }
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------

const app = new Hono();

// --- Public user profiles ---

// GET /api/users/:username — matches Go's GetUserByUsername
app.get("/api/users/:username", async (c) => {
  const username = c.req.param("username");
  const result = await getServices().user.getUserByUsername(username);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// GET /api/users/:username/activity — matches Go's GetUserActivityByUsername
// Activity feed is not yet implemented in the SDK; keep stub.
app.get("/api/users/:username/activity", async (c) => {
  void c.req.param("username");
  const query = new URL(c.req.url).searchParams;

  const pagination = parseUserPagination(query);
  if (pagination instanceof APIError) {
    return writeError(c, pagination);
  }

  return writeRouteError(c, new APIError(501, "not implemented"));
});

// GET /api/users/:username/repos — matches Go's GetUserReposByUsername
app.get("/api/users/:username/repos", async (c) => {
  const username = c.req.param("username");
  const query = new URL(c.req.url).searchParams;

  const pagination = parseUserPagination(query);
  if (pagination instanceof APIError) {
    return writeError(c, pagination);
  }

  const page = cursorToPage(pagination.cursor, pagination.limit);
  const result = await getServices().user.listUserReposByUsername(username, page, pagination.limit);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  setPaginationHeaders(c, pagination.cursor, pagination.limit, result.value.items.length, result.value.total_count);
  return writeJSON(c, 200, result.value.items);
});

// GET /api/users/:username/starred — matches Go's GetUserStarredReposByUsername
app.get("/api/users/:username/starred", async (c) => {
  const username = c.req.param("username");
  const query = new URL(c.req.url).searchParams;

  const pagination = parseUserPagination(query);
  if (pagination instanceof APIError) {
    return writeError(c, pagination);
  }

  const page = cursorToPage(pagination.cursor, pagination.limit);
  const result = await getServices().user.listUserStarredReposByUsername(username, page, pagination.limit);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  setPaginationHeaders(c, pagination.cursor, pagination.limit, result.value.items.length, result.value.total_count);
  return writeJSON(c, 200, result.value.items);
});

// --- Authenticated user ---

// GET /api/user — matches Go's GetAuthenticatedUser
app.get("/api/user", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await getServices().user.getAuthenticatedUser(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// PATCH /api/user — matches Go's PatchAuthenticatedUser
app.patch("/api/user", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const body = await decodeJSONBody<PatchUserRequest>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }

  // Validation: avatar_url if provided and non-empty must be a valid URL
  // This matches Go's UpdateAuthenticatedUser service validation
  if (body.avatar_url !== undefined) {
    const trimmed = body.avatar_url.trim();
    if (trimmed !== "" && !isValidAvatarURL(trimmed)) {
      return writeError(
        c,
        validationFailed({
          resource: "User",
          field: "avatar_url",
          code: "invalid",
        })
      );
    }
  }

  const result = await getServices().user.updateAuthenticatedUser(user.id, {
    display_name: body.display_name,
    bio: body.bio,
    avatar_url: body.avatar_url,
    email: body.email,
  });
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// GET /api/user/repos — matches Go's GetAuthenticatedUserRepos
app.get("/api/user/repos", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const pagination = parseUserPagination(query);
  if (pagination instanceof APIError) {
    return writeError(c, pagination);
  }

  const page = cursorToPage(pagination.cursor, pagination.limit);
  const result = await getServices().user.listAuthenticatedUserRepos(user.id, page, pagination.limit);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  setPaginationHeaders(c, pagination.cursor, pagination.limit, result.value.items.length, result.value.total_count);
  return writeJSON(c, 200, result.value.items);
});

// GET /api/user/orgs — matches Go's GetAuthenticatedUserOrgs
app.get("/api/user/orgs", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const pagination = parseUserPagination(query);
  if (pagination instanceof APIError) {
    return writeError(c, pagination);
  }

  const page = cursorToPage(pagination.cursor, pagination.limit);
  const result = await getServices().user.listAuthenticatedUserOrgs(user.id, page, pagination.limit);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  setPaginationHeaders(c, pagination.cursor, pagination.limit, result.value.items.length, result.value.total_count);
  return writeJSON(c, 200, result.value.items);
});

// GET /api/user/starred — matches Go's GetAuthenticatedUserStarredRepos
app.get("/api/user/starred", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const pagination = parseUserPagination(query);
  if (pagination instanceof APIError) {
    return writeError(c, pagination);
  }

  const page = cursorToPage(pagination.cursor, pagination.limit);
  const result = await getServices().user.listAuthenticatedUserStarredRepos(user.id, page, pagination.limit);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  setPaginationHeaders(c, pagination.cursor, pagination.limit, result.value.items.length, result.value.total_count);
  return writeJSON(c, 200, result.value.items);
});

// --- Tokens ---

// GET /api/user/tokens — matches Go's GetUserTokens
app.get("/api/user/tokens", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await getServices().user.listTokens(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// POST /api/user/tokens — matches Go's PostUserToken
app.post("/api/user/tokens", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const body = await decodeJSONBody<CreateTokenRequest>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }

  const result = await getServices().user.createToken(user.id, body);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 201, result.value);
});

// DELETE /api/user/tokens/:id — matches Go's DeleteUserToken
app.delete("/api/user/tokens/:id", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const rawId = c.req.param("id");
  const tokenID = parseInt(rawId, 10);
  if (isNaN(tokenID) || tokenID <= 0) {
    return writeError(c, badRequest("invalid token id"));
  }

  const result = await getServices().user.deleteToken(user.id, tokenID);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

// --- Sessions ---

// GET /api/user/sessions — matches Go's GetUserSessions
app.get("/api/user/sessions", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await getServices().user.listSessions(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// DELETE /api/user/sessions/:id — matches Go's DeleteUserSession
app.delete("/api/user/sessions/:id", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const sessionID = (c.req.param("id") ?? "").trim();
  if (sessionID === "") {
    return writeError(c, badRequest("invalid session id"));
  }

  const result = await getServices().user.revokeSession(user.id, sessionID);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

// --- Emails ---

// GET /api/user/emails — matches Go's GetUserEmails
app.get("/api/user/emails", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await getServices().user.listEmails(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// POST /api/user/emails — matches Go's PostUserEmail
app.post("/api/user/emails", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const body = await decodeJSONBody<AddEmailRequest>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }

  const result = await getServices().user.addEmail(user.id, body);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 201, result.value);
});

// DELETE /api/user/emails/:id — matches Go's DeleteUserEmail
app.delete("/api/user/emails/:id", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const rawId = c.req.param("id");
  const emailID = parseInt(rawId, 10);
  if (isNaN(emailID) || emailID <= 0) {
    return writeError(c, badRequest("invalid email id"));
  }

  const result = await getServices().user.deleteEmail(user.id, emailID);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

// POST /api/user/emails/:id/verify — matches Go's PostUserEmailVerify
app.post("/api/user/emails/:id/verify", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const rawId = c.req.param("id");
  const emailID = parseInt(rawId, 10);
  if (isNaN(emailID) || emailID <= 0) {
    return writeError(c, badRequest("invalid email id"));
  }

  // Email verification not yet implemented in the SDK; keep stub.
  return writeRouteError(c, new APIError(501, "not implemented"));
});

// POST /api/user/emails/verify-token — matches Go's PostUserEmailVerifyToken
app.post("/api/user/emails/verify-token", async (c) => {
  const body = await decodeJSONBody<{ token: string }>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }

  if (!body.token || body.token === "") {
    return writeError(c, badRequest("token is required"));
  }

  // Email token verification not yet implemented in the SDK; keep stub.
  return writeRouteError(c, new APIError(501, "not implemented"));
});

// --- Avatar ---

// POST /api/user/avatar — matches Go's PostAvatar
app.post("/api/user/avatar", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const body = await decodeJSONBody<{ avatar_url: string }>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }

  if ((body.avatar_url ?? "").trim() === "") {
    return writeError(c, badRequest("avatar_url is required"));
  }

  const result = await getServices().user.updateAuthenticatedUser(user.id, {
    avatar_url: body.avatar_url,
  });
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// --- Notification preferences ---

// GET /api/user/settings/notifications — matches Go's GetNotificationPreferences
app.get("/api/user/settings/notifications", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await getServices().user.getNotificationPreferences(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// PUT /api/user/settings/notifications — matches Go's PutNotificationPreferences
app.put("/api/user/settings/notifications", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const body = await decodeJSONBody<UpdateNotificationPreferencesRequest>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }

  const result = await getServices().user.updateNotificationPreferences(user.id, body);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// --- Connected accounts ---

// GET /api/user/connections — matches Go's GetConnectedAccounts
app.get("/api/user/connections", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const result = await getServices().user.listConnectedAccounts(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

// DELETE /api/user/connections/:id — matches Go's DeleteConnectedAccount
app.delete("/api/user/connections/:id", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const rawId = c.req.param("id");
  const accountID = parseInt(rawId, 10);
  if (isNaN(accountID) || accountID <= 0) {
    return writeError(c, badRequest("invalid account id"));
  }

  const result = await getServices().user.deleteConnectedAccount(user.id, accountID);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

// --- SSH Keys ---

app.get("/api/user/keys", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  const result = await getServices().user.listSSHKeys(user.id);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 200, result.value);
});

app.post("/api/user/keys", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  const body = await decodeJSONBody<{ title: string; key: string }>(c);
  if (body instanceof APIError) {
    return writeError(c, body);
  }
  const result = await getServices().user.createSSHKey(user.id, body);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return writeJSON(c, 201, result.value);
});

app.delete("/api/user/keys/:id", async (c) => {
  const user = requireUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  const rawId = c.req.param("id");
  const keyID = parseInt(rawId, 10);
  if (isNaN(keyID) || keyID <= 0) {
    return writeError(c, badRequest("invalid key id"));
  }
  const result = await getServices().user.deleteSSHKey(user.id, keyID);
  if (Result.isError(result)) {
    return writeRouteError(c, result.error);
  }
  return c.body(null, 204);
});

// --- Subscriptions (stub route, no Go source in user.go) ---

app.get("/api/user/subscriptions", (c) =>
  c.json({ message: "not implemented", method: "GET", path: c.req.path }, 501)
);

export default app;
