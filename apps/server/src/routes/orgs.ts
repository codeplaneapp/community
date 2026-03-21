import { Hono } from "hono";
import type { Context } from "hono";
import {
  badRequest,
  unauthorized,
  internal,
  getUser,
  writeJSON,
  writeRouteError,
} from "@jjhub/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types — match Go's db/services types exactly
// ---------------------------------------------------------------------------

interface User {
  id: number;
  username: string;
}

interface Organization {
  id: number;
  name: string;
  lower_name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
  created_at: string;
  updated_at: string;
}

interface Repository {
  id: number;
  name: string;
  lower_name: string;
  owner: string;
  description: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface Team {
  id: number;
  organization_id: number;
  name: string;
  lower_name: string;
  description: string;
  permission: string;
  created_at: string;
  updated_at: string;
}

/** Matches Go OrgMemberResponse JSON shape from routes/orgs.go. */
interface OrgMemberResponse {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  role: string;
}

/** Matches Go TeamMemberResponse JSON shape from routes/orgs.go. */
interface TeamMemberResponse {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

/** Matches Go's db.ListOrgMembersRow. */
interface ListOrgMembersRow {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  role: string;
}

/** Matches Go services.CreateOrgRequest. */
interface CreateOrgRequest {
  name: string;
  description: string;
  visibility: string;
}

/** Matches Go services.UpdateOrgRequest. */
interface UpdateOrgRequest {
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}

/** Matches Go services.CreateTeamRequest. */
interface CreateTeamRequest {
  name: string;
  description: string;
  permission: string;
}

/** Matches Go services.UpdateTeamRequest. */
interface UpdateTeamRequest {
  name: string;
  description: string;
  permission: string;
}

// ---------------------------------------------------------------------------
// Service interface — matches Go OrgRouteService
// ---------------------------------------------------------------------------

interface OrgRouteService {
  getOrg(
    viewer: User | null,
    orgName: string,
  ): Promise<Organization>;

  createOrg(
    actor: User,
    req: CreateOrgRequest,
  ): Promise<Organization>;

  updateOrg(
    actor: User,
    orgName: string,
    req: UpdateOrgRequest,
  ): Promise<Organization>;

  addOrgMember(
    actor: User,
    orgName: string,
    targetUserID: number,
    role: string,
  ): Promise<void>;

  removeOrgMember(
    actor: User,
    orgName: string,
    username: string,
  ): Promise<void>;

  listOrgRepos(
    viewer: User | null,
    orgName: string,
    page: number,
    perPage: number,
  ): Promise<{ items: Repository[]; total: number }>;

  listOrgMembers(
    viewer: User | null,
    orgName: string,
    page: number,
    perPage: number,
  ): Promise<{ items: ListOrgMembersRow[]; total: number }>;

  listOrgTeams(
    viewer: User | null,
    orgName: string,
    page: number,
    perPage: number,
  ): Promise<{ items: Team[]; total: number }>;

  createTeam(
    actor: User,
    orgName: string,
    req: CreateTeamRequest,
  ): Promise<Team>;

  getTeam(
    viewer: User | null,
    orgName: string,
    teamName: string,
  ): Promise<Team>;

  updateTeam(
    actor: User,
    orgName: string,
    teamName: string,
    req: UpdateTeamRequest,
  ): Promise<Team>;

  deleteTeam(
    actor: User,
    orgName: string,
    teamName: string,
  ): Promise<void>;

  listTeamMembers(
    viewer: User | null,
    orgName: string,
    teamName: string,
    page: number,
    perPage: number,
  ): Promise<{ items: User[]; total: number }>;

  addTeamMember(
    actor: User,
    orgName: string,
    teamName: string,
    username: string,
  ): Promise<void>;

  removeTeamMember(
    actor: User,
    orgName: string,
    teamName: string,
    username: string,
  ): Promise<void>;

  listTeamRepos(
    viewer: User | null,
    orgName: string,
    teamName: string,
    page: number,
    perPage: number,
  ): Promise<{ items: Repository[]; total: number }>;

  addTeamRepo(
    actor: User,
    orgName: string,
    teamName: string,
    owner: string,
    repo: string,
  ): Promise<void>;

  removeTeamRepo(
    actor: User,
    orgName: string,
    teamName: string,
    owner: string,
    repo: string,
  ): Promise<void>;
}

/**
 * Unwrap a Result value, throwing the error if it is an error.
 * This adapts the Result-returning OrgService to the throw-based route pattern.
 */
function unwrap<T>(result: any): T {
  if (Result.isError(result)) throw result.error;
  return result.value;
}

/** Lazily resolve the org service from the registry on each request. */
function orgService() {
  return getServices().org;
}

// ---------------------------------------------------------------------------
// Helpers — mirrors Go route helpers
// ---------------------------------------------------------------------------

/** Extract the authenticated user from context. Returns null if unauthenticated. */
function userFromContext(c: Context): User | null {
  const user = getUser(c);
  if (!user) return null;
  return { id: user.id, username: user.username };
}

/** Require an authenticated user or throw 401. Matches Go requireRouteUser. */
function requireRouteUser(c: Context): User {
  const user = userFromContext(c);
  if (!user) {
    throw unauthorized("authentication required");
  }
  return user;
}

/**
 * Extract a named route param, trimmed. Throw 400 if empty.
 * Matches Go routeParam.
 */
function routeParam(c: Context, key: string, message: string): string {
  const value = (c.req.param(key) ?? "").trim();
  if (!value) {
    throw badRequest(message);
  }
  return value;
}

/**
 * Parse pagination from query string. Supports both cursor-based (cursor/limit)
 * and legacy page/per_page. Matches Go parsePagination + cursorToPage.
 */
function parsePagination(c: Context): { page: number; perPage: number } {
  const query = c.req.query();
  const rawPage = (query.page ?? "").trim();
  const rawPerPage = (query.per_page ?? "").trim();
  const rawCursor = (query.cursor ?? "").trim();
  const rawLimit = (query.limit ?? "").trim();

  // Legacy pagination
  if (rawPage || rawPerPage) {
    let page = 1;
    let perPage = 30;
    if (rawPage) {
      page = parseInt(rawPage, 10);
      if (isNaN(page) || page <= 0) {
        throw badRequest("invalid page value");
      }
    }
    if (rawPerPage) {
      perPage = parseInt(rawPerPage, 10);
      if (isNaN(perPage) || perPage <= 0) {
        throw badRequest("invalid per_page value");
      }
      if (perPage > 100) {
        throw badRequest("per_page must not exceed 100");
      }
    }
    return { page, perPage };
  }

  // Cursor-based pagination
  let limit = 30;
  if (rawLimit) {
    limit = parseInt(rawLimit, 10);
    if (isNaN(limit) || limit <= 0) {
      throw badRequest("invalid limit value");
    }
    if (limit > 100) {
      limit = 100;
    }
  }

  let offset = 0;
  if (rawCursor) {
    offset = parseInt(rawCursor, 10);
    if (isNaN(offset) || offset < 0) {
      offset = 0;
    }
  }

  const page = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  return { page, perPage: limit };
}

/**
 * Set pagination headers on the response. Matches Go setPaginationHeaders.
 */
function setPaginationHeaders(
  c: Context,
  page: number,
  perPage: number,
  _resultCount: number,
  total: number,
): void {
  c.header("X-Total-Count", String(total));

  const lastPage = total > 0 ? Math.ceil(total / perPage) : 1;
  const links: string[] = [];
  const basePath = new URL(c.req.url).pathname;

  links.push(`<${basePath}?page=1&per_page=${perPage}>; rel="first"`);
  links.push(
    `<${basePath}?page=${lastPage}&per_page=${perPage}>; rel="last"`,
  );
  if (page > 1) {
    links.push(
      `<${basePath}?page=${page - 1}&per_page=${perPage}>; rel="prev"`,
    );
  }
  if (page < lastPage) {
    links.push(
      `<${basePath}?page=${page + 1}&per_page=${perPage}>; rel="next"`,
    );
  }
  c.header("Link", links.join(", "));
}

/**
 * Map ListOrgMembersRow[] to OrgMemberResponse[].
 * Matches Go mapOrgMembersResponse.
 */
function mapOrgMembersResponse(rows: ListOrgMembersRow[]): OrgMemberResponse[] {
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    role: row.role,
  }));
}

/**
 * Map User[] to TeamMemberResponse[].
 * Matches Go mapTeamMembersResponse.
 */
function mapTeamMembersResponse(users: User[]): TeamMemberResponse[] {
  return users.map((u) => ({
    id: u.id,
    username: u.username,
    display_name: (u as any).display_name ?? "",
    avatar_url: (u as any).avatar_url ?? "",
  }));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/orgs/:org — Get organization
app.get("/api/orgs/:org", async (c) => {
  try {
    const orgName = routeParam(c, "org", "organization name is required");

    const org = unwrap(await orgService().getOrg(userFromContext(c), orgName));
    return writeJSON(c, 200, org);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/orgs — Create organization
app.post("/api/orgs", async (c) => {
  try {
    const user = requireRouteUser(c);

    const body = await c.req.json<{
      name?: string;
      description?: string;
      visibility?: string;
    }>();

    const org = unwrap(await orgService().createOrg(user, {
      name: body.name ?? "",
      description: body.description ?? "",
      visibility: body.visibility ?? "",
    }));

    return writeJSON(c, 201, org);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/orgs/:org — Update organization
app.patch("/api/orgs/:org", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");

    const body = await c.req.json<{
      name?: string;
      description?: string;
      visibility?: string;
      website?: string;
      location?: string;
    }>();

    const org = unwrap(await orgService().updateOrg(user, orgName, {
      name: body.name ?? "",
      description: body.description ?? "",
      visibility: body.visibility ?? "",
      website: body.website ?? "",
      location: body.location ?? "",
    }));

    return writeJSON(c, 200, org);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/repos — List organization repos
app.get("/api/orgs/:org/repos", async (c) => {
  try {
    const orgName = routeParam(c, "org", "organization name is required");
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: Repository[]; total: number }>(await orgService().listOrgRepos(
      userFromContext(c),
      orgName,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/members — List organization members
app.get("/api/orgs/:org/members", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: ListOrgMembersRow[]; total: number }>(await orgService().listOrgMembers(
      user,
      orgName,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, mapOrgMembersResponse(items));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/orgs/:org/members — Add organization member
app.post("/api/orgs/:org/members", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");

    const body = await c.req.json<{
      user_id?: number;
      role?: string;
    }>();

    unwrap(await orgService().addOrgMember(
      user,
      orgName,
      body.user_id ?? 0,
      body.role ?? "",
    ));

    return c.body(null, 201);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/orgs/:org/members/:username — Remove organization member
app.delete("/api/orgs/:org/members/:username", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const username = routeParam(c, "username", "username is required");

    unwrap(await orgService().removeOrgMember(user, orgName, username));

    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/teams — List organization teams
app.get("/api/orgs/:org/teams", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: Team[]; total: number }>(await orgService().listOrgTeams(
      user,
      orgName,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/orgs/:org/teams — Create team
app.post("/api/orgs/:org/teams", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");

    const body = await c.req.json<{
      name?: string;
      description?: string;
      permission?: string;
    }>();

    const team = unwrap(await orgService().createTeam(user, orgName, {
      name: body.name ?? "",
      description: body.description ?? "",
      permission: body.permission ?? "",
    }));

    return writeJSON(c, 201, team);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/teams/:team — Get team
app.get("/api/orgs/:org/teams/:team", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");

    const team = unwrap(await orgService().getTeam(user, orgName, teamName));
    return writeJSON(c, 200, team);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/orgs/:org/teams/:team — Update team
app.patch("/api/orgs/:org/teams/:team", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");

    const body = await c.req.json<{
      name?: string;
      description?: string;
      permission?: string;
    }>();

    const team = unwrap(await orgService().updateTeam(user, orgName, teamName, {
      name: body.name ?? "",
      description: body.description ?? "",
      permission: body.permission ?? "",
    }));

    return writeJSON(c, 200, team);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/orgs/:org/teams/:team — Delete team
app.delete("/api/orgs/:org/teams/:team", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");

    unwrap(await orgService().deleteTeam(user, orgName, teamName));
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/teams/:team/members — List team members
app.get("/api/orgs/:org/teams/:team/members", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: User[]; total: number }>(await orgService().listTeamMembers(
      user,
      orgName,
      teamName,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, mapTeamMembersResponse(items));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PUT /api/orgs/:org/teams/:team/members/:username — Add team member
app.put("/api/orgs/:org/teams/:team/members/:username", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");
    const username = routeParam(c, "username", "username is required");

    unwrap(await orgService().addTeamMember(user, orgName, teamName, username));
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/orgs/:org/teams/:team/members/:username — Remove team member
app.delete("/api/orgs/:org/teams/:team/members/:username", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");
    const username = routeParam(c, "username", "username is required");

    unwrap(await orgService().removeTeamMember(user, orgName, teamName, username));
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/teams/:team/repos — List team repos
app.get("/api/orgs/:org/teams/:team/repos", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: Repository[]; total: number }>(await orgService().listTeamRepos(
      user,
      orgName,
      teamName,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PUT /api/orgs/:org/teams/:team/repos/:owner/:repo — Add team repo
app.put("/api/orgs/:org/teams/:team/repos/:owner/:repo", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");
    const owner = routeParam(c, "owner", "owner is required");
    const repoName = routeParam(c, "repo", "repository name is required");

    unwrap(await orgService().addTeamRepo(user, orgName, teamName, owner, repoName));
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/orgs/:org/teams/:team/repos/:owner/:repo — Remove team repo
app.delete("/api/orgs/:org/teams/:team/repos/:owner/:repo", async (c) => {
  try {
    const user = requireRouteUser(c);
    const orgName = routeParam(c, "org", "organization name is required");
    const teamName = routeParam(c, "team", "team name is required");
    const owner = routeParam(c, "owner", "owner is required");
    const repoName = routeParam(c, "repo", "repository name is required");

    unwrap(await orgService().removeTeamRepo(user, orgName, teamName, owner, repoName));
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
