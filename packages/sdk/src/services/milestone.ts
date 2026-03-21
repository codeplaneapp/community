import { Result } from "better-result";
import type { Sql } from "postgres";
import type { AuthUser } from "../lib/context";
import {
  APIError,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  conflict,
  internal,
  validationFailed,
} from "../lib/errors";

import {
  createMilestone as dbCreateMilestone,
  listMilestonesByRepo as dbListMilestonesByRepo,
  countMilestonesByRepo as dbCountMilestonesByRepo,
  getMilestoneByID as dbGetMilestoneByID,
  updateMilestone as dbUpdateMilestone,
  deleteMilestone as dbDeleteMilestone,
  type CreateMilestoneRow,
  type ListMilestonesByRepoRow,
  type GetMilestoneByIDRow,
  type UpdateMilestoneRow,
} from "../db/milestones_sql";

import {
  getRepoByOwnerAndLowerName as dbGetRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser as dbIsOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser as dbGetHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser as dbGetCollaboratorPermissionForRepoUser,
  type GetRepoByOwnerAndLowerNameRow,
} from "../db/repos_sql";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Service input types -- mirrors Go services.CreateMilestoneInput, etc.
// ---------------------------------------------------------------------------

interface CreateMilestoneInput {
  title: string;
  description: string;
  due_date?: string;
}

interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  state?: string;
  due_date?: string;
}

// ---------------------------------------------------------------------------
// Response type -- mirrors Go db.Milestone JSON shape
// ---------------------------------------------------------------------------

interface MilestoneResponse {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;
  due_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

// Generic milestone row type
type MilestoneRow = CreateMilestoneRow | ListMilestonesByRepoRow | GetMilestoneByIDRow | UpdateMilestoneRow;

// ---------------------------------------------------------------------------
// MilestoneService
// ---------------------------------------------------------------------------

export class MilestoneService {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async createMilestone(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    req: CreateMilestoneInput,
  ): Promise<MilestoneResponse> {
    if (!actor) throw unauthorized("authentication required");

    const title = validateMilestoneTitle(req.title);

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const dueDate = parseDueDate(req.due_date);

    const result = await Result.tryPromise(() =>
      dbCreateMilestone(this.sql, {
        repositoryId: repository.id,
        title,
        description: req.description,
        dueDate,
      }),
    );

    if (Result.isError(result)) {
      if (isUniqueViolation(result.error)) throw conflict("milestone already exists");
      throw internal("failed to create milestone");
    }

    if (!result.value) throw internal("failed to create milestone");
    return mapMilestone(result.value);
  }

  async listMilestones(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    state: string,
  ): Promise<{ items: MilestoneResponse[]; total: number }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const normalizedState = normalizeMilestoneStateFilter(state);
    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const countRow = await dbCountMilestonesByRepo(this.sql, {
      repositoryId: repository.id,
      state: normalizedState,
    });
    const total = countRow ? Number(countRow.count) : 0;

    const rows = await dbListMilestonesByRepo(this.sql, {
      repositoryId: repository.id,
      state: normalizedState,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items = rows.map(mapMilestone);
    return { items, total };
  }

  async getMilestone(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    id: number,
  ): Promise<MilestoneResponse> {
    if (id <= 0) throw badRequest("invalid milestone id");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const milestone = await dbGetMilestoneByID(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
    if (!milestone) throw notFound("milestone not found");
    return mapMilestone(milestone);
  }

  async updateMilestone(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    id: number,
    req: UpdateMilestoneInput,
  ): Promise<MilestoneResponse> {
    if (!actor) throw unauthorized("authentication required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const existing = await dbGetMilestoneByID(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
    if (!existing) throw notFound("milestone not found");

    let title = existing.title;
    if (req.title !== undefined) {
      title = validateMilestoneTitle(req.title);
    }

    let description = existing.description;
    if (req.description !== undefined) {
      description = req.description;
    }

    let state = existing.state;
    if (req.state !== undefined) {
      state = normalizeMilestoneState(req.state);
    }

    let dueDate: Date | null = existing.dueDate;
    if (req.due_date !== undefined) {
      dueDate = parseDueDate(req.due_date);
    }

    let closedAt: Date | null = existing.closedAt;
    if (state === "closed") {
      if (!closedAt || existing.state !== "closed") {
        closedAt = new Date();
      }
    } else {
      closedAt = null;
    }

    const result = await Result.tryPromise(() =>
      dbUpdateMilestone(this.sql, {
        repositoryId: repository.id,
        id: String(id),
        title,
        description,
        state,
        dueDate,
        closedAt,
      }),
    );

    if (Result.isError(result)) {
      if (isUniqueViolation(result.error)) throw conflict("milestone already exists");
      throw internal("failed to update milestone");
    }

    if (!result.value) throw notFound("milestone not found");
    return mapMilestone(result.value);
  }

  async deleteMilestone(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    id: number,
  ): Promise<void> {
    if (!actor) throw unauthorized("authentication required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const existing = await dbGetMilestoneByID(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
    if (!existing) throw notFound("milestone not found");

    await dbDeleteMilestone(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers -- repo resolution + permissions
  // -------------------------------------------------------------------------

  private async resolveRepoByOwnerAndName(owner: string, repo: string): Promise<GetRepoByOwnerAndLowerNameRow> {
    const lowerOwner = owner.trim().toLowerCase();
    const lowerRepo = repo.trim().toLowerCase();
    if (lowerOwner === "") throw badRequest("owner is required");
    if (lowerRepo === "") throw badRequest("repository name is required");

    const repository = await dbGetRepoByOwnerAndLowerName(this.sql, {
      owner: lowerOwner,
      lowerName: lowerRepo,
    });
    if (!repository) throw notFound("repository not found");
    return repository;
  }

  private async requireReadAccess(repository: GetRepoByOwnerAndLowerNameRow, viewer: AuthUser | null): Promise<void> {
    if (repository.isPublic) return;
    if (!viewer) throw forbidden("permission denied");
    const allowed = await this.canReadRepo(repository, viewer.id);
    if (!allowed) throw forbidden("permission denied");
  }

  private async requireWriteAccess(repository: GetRepoByOwnerAndLowerNameRow, actor: AuthUser | null): Promise<void> {
    if (!actor) throw unauthorized("authentication required");
    const allowed = await this.canWriteRepo(repository, actor.id);
    if (!allowed) throw forbidden("permission denied");
  }

  private async repoPermissionForUser(repository: GetRepoByOwnerAndLowerNameRow, userId: number): Promise<{ permission: string; isOwner: boolean }> {
    if (repository.userId && String(userId) === repository.userId) {
      return { permission: "", isOwner: true };
    }

    let teamPermission = "";
    if (repository.orgId) {
      const orgOwnerRow = await dbIsOrgOwnerForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userId),
      });
      if (orgOwnerRow?.exists) {
        return { permission: "", isOwner: true };
      }

      const teamRow = await dbGetHighestTeamPermissionForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userId),
      });
      if (teamRow) {
        const vals = Object.values(teamRow);
        teamPermission = (vals[0] as string) ?? "";
      }
    }

    const collabRow = await dbGetCollaboratorPermissionForRepoUser(this.sql, {
      repositoryId: repository.id,
      userId: String(userId),
    });
    const collabPermission = collabRow?.permission ?? "";

    return { permission: highestRepoPermission(teamPermission, collabPermission), isOwner: false };
  }

  private async canReadRepo(repository: GetRepoByOwnerAndLowerNameRow, userId: number): Promise<boolean> {
    if (repository.isPublic) return true;
    const { permission, isOwner } = await this.repoPermissionForUser(repository, userId);
    if (isOwner) return true;
    return permission === "read" || permission === "write" || permission === "admin";
  }

  private async canWriteRepo(repository: GetRepoByOwnerAndLowerNameRow, userId: number): Promise<boolean> {
    const { permission, isOwner } = await this.repoPermissionForUser(repository, userId);
    if (isOwner) return true;
    return permission === "write" || permission === "admin";
  }
}

// ---------------------------------------------------------------------------
// Standalone mapper
// ---------------------------------------------------------------------------

function mapMilestone(row: MilestoneRow): MilestoneResponse {
  return {
    id: Number(row.id),
    repository_id: Number(row.repositoryId),
    title: row.title,
    description: row.description,
    state: row.state,
    due_date: row.dueDate instanceof Date ? row.dueDate.toISOString() : row.dueDate ?? null,
    closed_at: row.closedAt instanceof Date ? row.closedAt.toISOString() : row.closedAt ?? null,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers -- mirrors Go validation functions
// ---------------------------------------------------------------------------

function validateMilestoneTitle(raw: string): string {
  const title = raw.trim();
  if (title === "") {
    throw validationFailed({ resource: "Milestone", field: "title", code: "missing_field" });
  }
  if (title.length > 255) {
    throw validationFailed({ resource: "Milestone", field: "title", code: "invalid" });
  }
  return title;
}

function normalizeMilestoneStateFilter(raw: string): string {
  const state = raw.trim().toLowerCase();
  if (state === "") return "";
  if (state !== "open" && state !== "closed") {
    throw validationFailed({ resource: "Milestone", field: "state", code: "invalid" });
  }
  return state;
}

function normalizeMilestoneState(raw: string): string {
  const state = raw.trim().toLowerCase();
  if (state !== "open" && state !== "closed") {
    throw validationFailed({ resource: "Milestone", field: "state", code: "invalid" });
  }
  return state;
}

function parseDueDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    throw validationFailed({ resource: "Milestone", field: "due_date", code: "invalid" });
  }
  return d;
}

function normalizePage(page: number, perPage: number): { pageSize: number; pageOffset: number } {
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
// Permission helpers
// ---------------------------------------------------------------------------

function repoPermissionRank(permission: string): number {
  switch (permission.toLowerCase()) {
    case "admin":
      return 4;
    case "write":
      return 3;
    case "read":
      return 2;
    default:
      return 0;
  }
}

function highestRepoPermission(...permissions: string[]): string {
  let best = "";
  for (const p of permissions) {
    if (repoPermissionRank(p) > repoPermissionRank(best)) {
      best = p.toLowerCase();
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Error classification helpers
// ---------------------------------------------------------------------------

function isUniqueViolation(err: unknown): boolean {
  if (!err) return false;
  const msg = String(err).toLowerCase();
  return msg.includes("23505") || msg.includes("duplicate key") || msg.includes("unique");
}
