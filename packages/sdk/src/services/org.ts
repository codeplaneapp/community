import { Result } from "better-result";
import type { Sql } from "postgres";

import {
  getOrgByLowerName,
  createOrganization,
  addOrgMember,
  updateOrganization,
  getOrgMember,
  listOrgMembers,
  countOrgMembers,
  listOrgTeams,
  countOrgTeams,
  createTeam,
  getTeamByOrgAndLowerName,
  updateTeam,
  deleteTeam,
  listTeamMembers,
  countTeamMembers,
  addTeamMemberIfOrgMember,
  removeTeamMember,
  listTeamRepos,
  countTeamRepos,
  addTeamRepoIfOrgRepo,
  removeTeamRepo,
  countOrgOwners,
  removeOrgMember,
} from "../db/orgs_sql";

import {
  listOrgRepos,
  countOrgRepos,
  listPublicOrgRepos,
  countPublicOrgRepos,
  getRepoByOwnerAndLowerName,
} from "../db/repos_sql";

import {
  getUserByLowerUsername,
} from "../db/users_sql";

import {
  type APIError,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  internal,
  validationFailed,
} from "../lib/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Pagination helper -- matches Go's normalizePage
// ---------------------------------------------------------------------------

function normalizePage(
  page: number,
  perPage: number,
): { pageSize: number; pageOffset: number } {
  let resolvedPage = page;
  if (resolvedPage <= 0) resolvedPage = 1;
  let resolvedPerPage = perPage;
  if (resolvedPerPage <= 0) resolvedPerPage = DEFAULT_PER_PAGE;
  if (resolvedPerPage > MAX_PER_PAGE) resolvedPerPage = MAX_PER_PAGE;
  const pageSize = resolvedPerPage;
  const pageOffset = (resolvedPage - 1) * resolvedPerPage;
  return { pageSize, pageOffset };
}

// ---------------------------------------------------------------------------
// Unique violation detection
// ---------------------------------------------------------------------------

function isUniqueViolation(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && (err as any).code === "23505") return true;
  const msg = String(err).toLowerCase();
  return msg.includes("duplicate key") || msg.includes("unique") || msg.includes("23505");
}

function isForeignKeyViolation(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "object" && (err as any).code === "23503") return true;
  return false;
}

// ---------------------------------------------------------------------------
// User type -- minimal shape needed for service
// ---------------------------------------------------------------------------

interface User {
  id: number;
  username: string;
}

// ---------------------------------------------------------------------------
// Response types -- match route interfaces
// ---------------------------------------------------------------------------

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

interface ListOrgMembersRow {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
  role: string;
}

interface CreateOrgRequest {
  name: string;
  description: string;
  visibility: string;
}

interface UpdateOrgRequest {
  name: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
}

interface CreateTeamRequest {
  name: string;
  description: string;
  permission: string;
}

interface UpdateTeamRequest {
  name: string;
  description: string;
  permission: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  return String(d);
}

function mapOrganization(row: {
  id: string;
  name: string;
  lowerName: string;
  description: string;
  visibility: string;
  website: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
}): Organization {
  return {
    id: Number(row.id),
    name: row.name,
    lower_name: row.lowerName,
    description: row.description,
    visibility: row.visibility,
    website: row.website,
    location: row.location,
    created_at: toISOString(row.createdAt),
    updated_at: toISOString(row.updatedAt),
  };
}

function mapTeam(row: {
  id: string;
  organizationId: string;
  name: string;
  lowerName: string;
  description: string;
  permission: string;
  createdAt: Date;
  updatedAt: Date;
}): Team {
  return {
    id: Number(row.id),
    organization_id: Number(row.organizationId),
    name: row.name,
    lower_name: row.lowerName,
    description: row.description,
    permission: row.permission,
    created_at: toISOString(row.createdAt),
    updated_at: toISOString(row.updatedAt),
  };
}

function mapRepoWithOwner(owner: string, row: {
  id: string;
  name: string;
  lowerName: string;
  description: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Repository {
  return {
    id: Number(row.id),
    name: row.name,
    lower_name: row.lowerName,
    owner,
    description: row.description,
    is_public: row.isPublic,
    created_at: toISOString(row.createdAt),
    updated_at: toISOString(row.updatedAt),
  };
}

function mapRepo(row: {
  id: string;
  name: string;
  lowerName: string;
  description: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Repository {
  return mapRepoWithOwner("", row);
}

// ---------------------------------------------------------------------------
// OrgService -- matches Go OrgService 1:1
// ---------------------------------------------------------------------------

export class OrgService {
  constructor(private readonly sql: Sql) {}

  // ---- Private helpers ----

  private async resolveOrg(orgName: string) {
    const lowerName = (orgName ?? "").trim().toLowerCase();
    if (lowerName === "") {
      return Result.err(badRequest("organization name is required"));
    }
    const org = await getOrgByLowerName(this.sql, { lowerName });
    if (!org) {
      return Result.err(notFound("organization not found"));
    }
    return Result.ok(org);
  }

  private async resolveTeam(organizationId: string, teamName: string) {
    const lowerName = (teamName ?? "").trim().toLowerCase();
    if (lowerName === "") {
      return Result.err(badRequest("team name is required"));
    }
    const team = await getTeamByOrgAndLowerName(this.sql, {
      organizationId,
      lowerName,
    });
    if (!team) {
      return Result.err(notFound("team not found"));
    }
    return Result.ok(team);
  }

  private async requireOrgRole(
    organizationId: string,
    userId: number,
    ...roles: string[]
  ): Promise<Result<void, APIError>> {
    const member = await getOrgMember(this.sql, {
      organizationId,
      userId: String(userId),
    });
    if (!member) {
      return Result.err(forbidden("insufficient organization permissions"));
    }
    if (roles.length === 0) {
      return Result.ok(undefined);
    }
    for (const role of roles) {
      if (member.role === role) {
        return Result.ok(undefined);
      }
    }
    return Result.err(forbidden("insufficient organization permissions"));
  }

  private async isOrgMember(
    organizationId: string,
    userId: number,
  ): Promise<boolean> {
    const member = await getOrgMember(this.sql, {
      organizationId,
      userId: String(userId),
    });
    return member !== null;
  }

  // ---- Public methods ----

  async getOrg(
    viewer: User | null,
    orgName: string,
  ): Promise<Result<Organization, APIError>> {
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    if (org.visibility === "public") {
      return Result.ok(mapOrganization(org));
    }

    if (!viewer) {
      return Result.err(forbidden("organization membership required"));
    }

    const roleResult = await this.requireOrgRole(org.id, viewer.id, "owner", "member");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    return Result.ok(mapOrganization(org));
  }

  async createOrg(
    actor: User,
    req: CreateOrgRequest,
  ): Promise<Result<Organization, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const name = (req.name ?? "").trim();
    if (name === "") {
      return Result.err(
        validationFailed({ resource: "Organization", field: "name", code: "missing_field" }),
      );
    }
    if (name.length > 255) {
      return Result.err(
        validationFailed({ resource: "Organization", field: "name", code: "invalid" }),
      );
    }

    let visibility = (req.visibility ?? "").trim();
    if (visibility === "") visibility = "public";
    if (visibility !== "public" && visibility !== "limited" && visibility !== "private") {
      return Result.err(
        validationFailed({ resource: "Organization", field: "visibility", code: "invalid" }),
      );
    }

    try {
      const org = await createOrganization(this.sql, {
        name,
        lowerName: name.toLowerCase(),
        description: req.description ?? "",
        visibility,
      });
      if (!org) {
        return Result.err(internal("failed to create organization"));
      }

      await addOrgMember(this.sql, {
        organizationId: org.id,
        userId: String(actor.id),
        role: "owner",
      });

      return Result.ok(mapOrganization(org));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("organization name already exists"));
      }
      return Result.err(internal("failed to create organization"));
    }
  }

  async updateOrg(
    actor: User,
    orgName: string,
    req: UpdateOrgRequest,
  ): Promise<Result<Organization, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    let name = (req.name ?? "").trim();
    if (name === "") name = org.name;
    if (name.length > 255) {
      return Result.err(
        validationFailed({ resource: "Organization", field: "name", code: "invalid" }),
      );
    }

    let visibility = (req.visibility ?? "").trim();
    if (visibility === "") visibility = org.visibility;
    if (visibility !== "public" && visibility !== "limited" && visibility !== "private") {
      return Result.err(
        validationFailed({ resource: "Organization", field: "visibility", code: "invalid" }),
      );
    }

    const description = req.description !== "" ? req.description : org.description;
    const website = req.website !== "" ? req.website : org.website;
    const location = req.location !== "" ? req.location : org.location;

    try {
      const updated = await updateOrganization(this.sql, {
        id: org.id,
        name,
        lowerName: name.toLowerCase(),
        description,
        visibility,
        website,
        location,
      });
      if (!updated) {
        return Result.err(internal("failed to update organization"));
      }
      return Result.ok(mapOrganization(updated));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("organization name already exists"));
      }
      return Result.err(internal("failed to update organization"));
    }
  }

  async listOrgRepos(
    viewer: User | null,
    orgName: string,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: Repository[]; total: number }, APIError>> {
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    let isMember = false;
    if (viewer) {
      isMember = await this.isOrgMember(org.id, viewer.id);
    }

    if (org.visibility !== "public" && !isMember) {
      return Result.err(forbidden("organization membership required"));
    }

    const { pageSize, pageOffset } = normalizePage(page, perPage);

    if (isMember) {
      const repos = await listOrgRepos(this.sql, {
        orgId: org.id,
        pageSize: String(pageSize),
        pageOffset: String(pageOffset),
      });
      const totalRow = await countOrgRepos(this.sql, { orgId: org.id });
      const total = totalRow ? Number(totalRow.count) : 0;
      return Result.ok({
        items: repos.map((r) => mapRepoWithOwner(orgName, r)),
        total,
      });
    }

    const repos = await listPublicOrgRepos(this.sql, {
      orgId: org.id,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });
    const totalRow = await countPublicOrgRepos(this.sql, { orgId: org.id });
    const total = totalRow ? Number(totalRow.count) : 0;
    return Result.ok({
      items: repos.map((r) => mapRepoWithOwner(orgName, r)),
      total,
    });
  }

  async listOrgMembers(
    viewer: User | null,
    orgName: string,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: ListOrgMembersRow[]; total: number }, APIError>> {
    if (!viewer) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, viewer.id, "owner", "member");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const members = await listOrgMembers(this.sql, {
      organizationId: org.id,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });
    const totalRow = await countOrgMembers(this.sql, { organizationId: org.id });
    const total = totalRow ? Number(totalRow.count) : 0;

    const items: ListOrgMembersRow[] = members.map((m) => ({
      id: Number(m.id),
      username: m.username,
      display_name: m.displayName,
      avatar_url: m.avatarUrl,
      role: m.role,
    }));

    return Result.ok({ items, total });
  }

  async addOrgMember(
    actor: User,
    orgName: string,
    targetUserID: number,
    role: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    if (targetUserID <= 0) {
      return Result.err(
        validationFailed({ resource: "OrgMember", field: "user_id", code: "invalid" }),
      );
    }

    const normalizedRole = (role ?? "").trim().toLowerCase();
    if (normalizedRole !== "owner" && normalizedRole !== "member") {
      return Result.err(
        validationFailed({ resource: "OrgMember", field: "role", code: "invalid" }),
      );
    }

    try {
      await addOrgMember(this.sql, {
        organizationId: org.id,
        userId: String(targetUserID),
        role: normalizedRole,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("user is already a member of the organization"));
      }
      if (isForeignKeyViolation(err)) {
        return Result.err(notFound("user not found"));
      }
      return Result.err(internal("failed to add organization member"));
    }

    return Result.ok(undefined);
  }

  async removeOrgMember(
    actor: User,
    orgName: string,
    username: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const lowerUsername = (username ?? "").trim().toLowerCase();
    if (lowerUsername === "") {
      return Result.err(badRequest("username is required"));
    }

    const user = await getUserByLowerUsername(this.sql, { lowerUsername });
    if (!user) {
      return Result.err(notFound("user not found"));
    }

    // Verify target is a member
    const targetMember = await getOrgMember(this.sql, {
      organizationId: org.id,
      userId: user.id,
    });
    if (!targetMember) {
      return Result.err(notFound("organization member not found"));
    }

    // Prevent removing the last owner
    if (targetMember.role === "owner") {
      const ownerCountRow = await countOrgOwners(this.sql, { organizationId: org.id });
      const ownerCount = ownerCountRow ? Number(ownerCountRow.count) : 0;
      if (ownerCount <= 1) {
        return Result.err(conflict("cannot remove the last organization owner"));
      }
    }

    await removeOrgMember(this.sql, {
      organizationId: org.id,
      userId: user.id,
    });

    return Result.ok(undefined);
  }

  async listOrgTeams(
    viewer: User | null,
    orgName: string,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: Team[]; total: number }, APIError>> {
    if (!viewer) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, viewer.id, "owner", "member");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const teams = await listOrgTeams(this.sql, {
      organizationId: org.id,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });
    const totalRow = await countOrgTeams(this.sql, { organizationId: org.id });
    const total = totalRow ? Number(totalRow.count) : 0;

    return Result.ok({
      items: teams.map(mapTeam),
      total,
    });
  }

  async createTeam(
    actor: User,
    orgName: string,
    req: CreateTeamRequest,
  ): Promise<Result<Team, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const name = (req.name ?? "").trim();
    if (name === "") {
      return Result.err(
        validationFailed({ resource: "Team", field: "name", code: "missing_field" }),
      );
    }
    if (name.length > 255) {
      return Result.err(
        validationFailed({ resource: "Team", field: "name", code: "invalid" }),
      );
    }

    let permission = (req.permission ?? "").trim();
    if (permission === "") permission = "read";
    if (permission !== "read" && permission !== "write" && permission !== "admin") {
      return Result.err(
        validationFailed({ resource: "Team", field: "permission", code: "invalid" }),
      );
    }

    try {
      const team = await createTeam(this.sql, {
        organizationId: org.id,
        name,
        lowerName: name.toLowerCase(),
        description: req.description ?? "",
        permission,
      });
      if (!team) {
        return Result.err(internal("failed to create team"));
      }
      return Result.ok(mapTeam(team));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("team already exists"));
      }
      return Result.err(internal("failed to create team"));
    }
  }

  async getTeam(
    viewer: User | null,
    orgName: string,
    teamName: string,
  ): Promise<Result<Team, APIError>> {
    if (!viewer) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, viewer.id, "owner", "member");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;

    return Result.ok(mapTeam(teamResult.value));
  }

  async updateTeam(
    actor: User,
    orgName: string,
    teamName: string,
    req: UpdateTeamRequest,
  ): Promise<Result<Team, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    let name = (req.name ?? "").trim();
    if (name === "") name = team.name;
    if (name.length > 255) {
      return Result.err(
        validationFailed({ resource: "Team", field: "name", code: "invalid" }),
      );
    }

    let permission = (req.permission ?? "").trim();
    if (permission === "") permission = team.permission;
    if (permission !== "read" && permission !== "write" && permission !== "admin") {
      return Result.err(
        validationFailed({ resource: "Team", field: "permission", code: "invalid" }),
      );
    }

    const description = req.description !== "" ? req.description : team.description;

    try {
      const updated = await updateTeam(this.sql, {
        id: team.id,
        name,
        lowerName: name.toLowerCase(),
        description,
        permission,
      });
      if (!updated) {
        return Result.err(internal("failed to update team"));
      }
      return Result.ok(mapTeam(updated));
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("team already exists"));
      }
      return Result.err(internal("failed to update team"));
    }
  }

  async deleteTeam(
    actor: User,
    orgName: string,
    teamName: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;

    await deleteTeam(this.sql, { id: teamResult.value.id });
    return Result.ok(undefined);
  }

  async listTeamMembers(
    viewer: User | null,
    orgName: string,
    teamName: string,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: User[]; total: number }, APIError>> {
    if (!viewer) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, viewer.id, "owner", "member");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const members = await listTeamMembers(this.sql, {
      teamId: team.id,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });
    const totalRow = await countTeamMembers(this.sql, { teamId: team.id });
    const total = totalRow ? Number(totalRow.count) : 0;

    const items: User[] = members.map((m) => ({
      id: Number(m.id),
      username: m.username,
    }));

    return Result.ok({ items, total });
  }

  async addTeamMember(
    actor: User,
    orgName: string,
    teamName: string,
    username: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    const lowerUsername = (username ?? "").trim().toLowerCase();
    if (lowerUsername === "") {
      return Result.err(badRequest("username is required"));
    }

    const user = await getUserByLowerUsername(this.sql, { lowerUsername });
    if (!user) {
      return Result.err(notFound("user not found"));
    }

    try {
      const result = await addTeamMemberIfOrgMember(this.sql, {
        teamId: team.id,
        userId: user.id,
      });
      if (!result) {
        // addTeamMemberIfOrgMember returns null when WHERE NOT EXISTS fails
        return Result.err(
          validationFailed({ resource: "TeamMember", field: "username", code: "invalid" }),
        );
      }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("user is already a team member"));
      }
      return Result.err(internal("failed to add team member"));
    }

    return Result.ok(undefined);
  }

  async removeTeamMember(
    actor: User,
    orgName: string,
    teamName: string,
    username: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    const lowerUsername = (username ?? "").trim().toLowerCase();
    if (lowerUsername === "") {
      return Result.err(badRequest("username is required"));
    }

    const user = await getUserByLowerUsername(this.sql, { lowerUsername });
    if (!user) {
      return Result.err(notFound("user not found"));
    }

    await removeTeamMember(this.sql, { teamId: team.id, userId: user.id });
    return Result.ok(undefined);
  }

  async listTeamRepos(
    viewer: User | null,
    orgName: string,
    teamName: string,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: Repository[]; total: number }, APIError>> {
    if (!viewer) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, viewer.id, "owner", "member");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const repos = await listTeamRepos(this.sql, {
      teamId: team.id,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });
    const totalRow = await countTeamRepos(this.sql, { teamId: team.id });
    const total = totalRow ? Number(totalRow.count) : 0;

    return Result.ok({
      items: repos.map((r) => mapRepoWithOwner(orgName, r)),
      total,
    });
  }

  async addTeamRepo(
    actor: User,
    orgName: string,
    teamName: string,
    owner: string,
    repo: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    const repository = await getRepoByOwnerAndLowerName(this.sql, {
      owner: (owner ?? "").trim().toLowerCase(),
      lowerName: (repo ?? "").trim().toLowerCase(),
    });
    if (!repository) {
      return Result.err(notFound("repository not found"));
    }

    try {
      const result = await addTeamRepoIfOrgRepo(this.sql, {
        teamId: team.id,
        repositoryId: repository.id,
      });
      if (!result) {
        return Result.err(
          validationFailed({ resource: "TeamRepo", field: "repository", code: "invalid" }),
        );
      }
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("repository is already assigned to team"));
      }
      return Result.err(internal("failed to add team repository"));
    }

    return Result.ok(undefined);
  }

  async removeTeamRepo(
    actor: User,
    orgName: string,
    teamName: string,
    owner: string,
    repo: string,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const orgResult = await this.resolveOrg(orgName);
    if (!orgResult.isOk()) return orgResult as Result<never, APIError>;
    const org = orgResult.value;

    const roleResult = await this.requireOrgRole(org.id, actor.id, "owner");
    if (!roleResult.isOk()) return roleResult as Result<never, APIError>;

    const teamResult = await this.resolveTeam(org.id, teamName);
    if (!teamResult.isOk()) return teamResult as Result<never, APIError>;
    const team = teamResult.value;

    const repository = await getRepoByOwnerAndLowerName(this.sql, {
      owner: (owner ?? "").trim().toLowerCase(),
      lowerName: (repo ?? "").trim().toLowerCase(),
    });
    if (!repository) {
      return Result.err(notFound("repository not found"));
    }

    // Verify the repo belongs to this org
    if (!repository.orgId || repository.orgId !== org.id) {
      return Result.err(
        validationFailed({ resource: "TeamRepo", field: "repository", code: "invalid" }),
      );
    }

    await removeTeamRepo(this.sql, { teamId: team.id, repositoryId: repository.id });
    return Result.ok(undefined);
  }
}
