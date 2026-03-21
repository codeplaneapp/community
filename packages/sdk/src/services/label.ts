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
  createLabel as dbCreateLabel,
  listLabelsByRepo as dbListLabelsByRepo,
  countLabelsByRepo as dbCountLabelsByRepo,
  getLabelByID as dbGetLabelByID,
  getLabelByName as dbGetLabelByName,
  listLabelsByNames as dbListLabelsByNames,
  updateLabel as dbUpdateLabel,
  deleteLabel as dbDeleteLabel,
  addIssueLabel as dbAddIssueLabel,
  addIssueLabels as dbAddIssueLabels,
  listLabelsForIssue as dbListLabelsForIssue,
  countLabelsForIssue as dbCountLabelsForIssue,
  removeIssueLabelByName as dbRemoveIssueLabelByName,
  type CreateLabelRow,
  type ListLabelsByRepoRow,
  type GetLabelByIDRow,
  type UpdateLabelRow,
  type ListLabelsForIssueRow,
} from "../db/labels_sql";

import {
  getIssueByNumber as dbGetIssueByNumber,
} from "../db/issues_sql";

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
// Service input types -- mirrors Go services.CreateLabelInput, etc.
// ---------------------------------------------------------------------------

interface CreateLabelInput {
  name: string;
  color: string;
  description: string;
}

interface UpdateLabelInput {
  name?: string;
  color?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Response type -- mirrors Go db.Label JSON shape
// ---------------------------------------------------------------------------

interface LabelResponse {
  id: number;
  repository_id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// Generic label row type
type LabelRow = CreateLabelRow | ListLabelsByRepoRow | GetLabelByIDRow | UpdateLabelRow | ListLabelsForIssueRow;

// ---------------------------------------------------------------------------
// LabelService
// ---------------------------------------------------------------------------

export class LabelService {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async createLabel(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    req: CreateLabelInput,
  ): Promise<LabelResponse> {
    if (!actor) throw unauthorized("authentication required");

    const name = validateLabelName(req.name);
    const color = normalizeLabelColor(req.color);

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const result = await Result.tryPromise(() =>
      dbCreateLabel(this.sql, {
        repositoryId: repository.id,
        name,
        color,
        description: req.description,
      }),
    );

    if (Result.isError(result)) {
      if (isUniqueViolation(result.error)) throw conflict("label already exists");
      throw internal("failed to create label");
    }

    if (!result.value) throw internal("failed to create label");
    return mapLabel(result.value);
  }

  async listLabels(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    page: number,
    perPage: number,
  ): Promise<{ items: LabelResponse[]; total: number }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const countRow = await dbCountLabelsByRepo(this.sql, { repositoryId: repository.id });
    const total = countRow ? Number(countRow.count) : 0;

    const rows = await dbListLabelsByRepo(this.sql, {
      repositoryId: repository.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items = rows.map(mapLabel);
    return { items, total };
  }

  async getLabel(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    id: number,
  ): Promise<LabelResponse> {
    if (id <= 0) throw badRequest("invalid label id");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const label = await dbGetLabelByID(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
    if (!label) throw notFound("label not found");
    return mapLabel(label);
  }

  async updateLabel(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    id: number,
    req: UpdateLabelInput,
  ): Promise<LabelResponse> {
    if (!actor) throw unauthorized("authentication required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const existing = await dbGetLabelByID(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
    if (!existing) throw notFound("label not found");

    let name = existing.name;
    if (req.name !== undefined) {
      name = validateLabelName(req.name);
    }

    let color = existing.color;
    if (req.color !== undefined) {
      color = normalizeLabelColor(req.color);
    }

    let description = existing.description;
    if (req.description !== undefined) {
      description = req.description;
    }

    const result = await Result.tryPromise(() =>
      dbUpdateLabel(this.sql, {
        repositoryId: repository.id,
        id: String(id),
        name,
        color,
        description,
      }),
    );

    if (Result.isError(result)) {
      if (isUniqueViolation(result.error)) throw conflict("label already exists");
      throw internal("failed to update label");
    }

    if (!result.value) throw notFound("label not found");
    return mapLabel(result.value);
  }

  async deleteLabel(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    id: number,
  ): Promise<void> {
    if (!actor) throw unauthorized("authentication required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const existing = await dbGetLabelByID(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
    if (!existing) throw notFound("label not found");

    await dbDeleteLabel(this.sql, {
      repositoryId: repository.id,
      id: String(id),
    });
  }

  async addLabelsToIssue(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    names: string[],
  ): Promise<LabelResponse[]> {
    if (!actor) throw unauthorized("authentication required");
    if (number <= 0) throw badRequest("invalid issue number");

    const labelNames = normalizeLabelNames(names);

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const issue = await dbGetIssueByNumber(this.sql, {
      repositoryId: repository.id,
      number: String(number),
    });
    if (!issue) throw notFound("issue not found");

    const labelsByName = await dbListLabelsByNames(this.sql, {
      repositoryId: repository.id,
      names: labelNames,
    });
    if (labelsByName.length !== labelNames.length) {
      throw notFound("label not found");
    }

    const labelIds = labelsByName.map((l) => l.id);
    const result = await Result.tryPromise(() =>
      dbAddIssueLabels(this.sql, {
        issueId: issue.id,
        labelIds,
      }),
    );
    if (Result.isError(result)) {
      if (isUniqueViolation(result.error)) throw conflict("label already attached to issue");
      throw internal("failed to attach label");
    }

    const allLabels = await this.listAllLabelsForIssue(issue.id);
    return allLabels;
  }

  async listIssueLabels(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<{ items: LabelResponse[]; total: number }> {
    if (number <= 0) throw badRequest("invalid issue number");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const issue = await dbGetIssueByNumber(this.sql, {
      repositoryId: repository.id,
      number: String(number),
    });
    if (!issue) throw notFound("issue not found");

    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const countRow = await dbCountLabelsForIssue(this.sql, { issueId: issue.id });
    const total = countRow ? Number(countRow.count) : 0;

    const rows = await dbListLabelsForIssue(this.sql, {
      issueId: issue.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items = rows.map(mapLabel);
    return { items, total };
  }

  async removeIssueLabelByName(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    labelName: string,
  ): Promise<void> {
    if (!actor) throw unauthorized("authentication required");
    if (number <= 0) throw badRequest("invalid issue number");
    const trimmedLabelName = labelName.trim();
    if (trimmedLabelName === "") throw badRequest("label name is required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const issue = await dbGetIssueByNumber(this.sql, {
      repositoryId: repository.id,
      number: String(number),
    });
    if (!issue) throw notFound("issue not found");

    const removed = await dbRemoveIssueLabelByName(this.sql, {
      repositoryId: repository.id,
      issueNumber: String(number),
      labelName: trimmedLabelName,
    });
    if (!removed || Number(removed.count) === 0) {
      throw notFound("label not found on issue");
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers -- list all labels for an issue (paginated fetch-all)
  // -------------------------------------------------------------------------

  private async listAllLabelsForIssue(issueId: string): Promise<LabelResponse[]> {
    const countRow = await dbCountLabelsForIssue(this.sql, { issueId });
    const total = countRow ? Number(countRow.count) : 0;
    if (total === 0) return [];

    const labels: LabelResponse[] = [];
    let offset = 0;
    while (labels.length < total) {
      const remaining = total - labels.length;
      const pageSize = Math.min(remaining, MAX_PER_PAGE);

      const rows = await dbListLabelsForIssue(this.sql, {
        issueId,
        pageOffset: String(offset),
        pageSize: String(pageSize),
      });
      if (rows.length === 0) break;

      for (const row of rows) {
        labels.push(mapLabel(row));
      }
      offset += rows.length;
    }
    return labels;
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

function mapLabel(row: LabelRow): LabelResponse {
  return {
    id: Number(row.id),
    repository_id: Number(row.repositoryId),
    name: row.name,
    color: row.color,
    description: row.description,
    created_at: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers -- mirrors Go validation functions
// ---------------------------------------------------------------------------

function validateLabelName(raw: string): string {
  const name = raw.trim();
  if (name === "") {
    throw validationFailed({ resource: "Label", field: "name", code: "missing_field" });
  }
  if (name.length > 255) {
    throw validationFailed({ resource: "Label", field: "name", code: "invalid" });
  }
  return name;
}

function normalizeLabelColor(raw: string): string {
  let color = raw.trim().toLowerCase();
  if (color === "") {
    throw validationFailed({ resource: "Label", field: "color", code: "missing_field" });
  }
  color = color.replace(/^#/, "");
  if (color.length !== 6) {
    throw validationFailed({ resource: "Label", field: "color", code: "invalid" });
  }
  for (const ch of color) {
    if (!((ch >= "0" && ch <= "9") || (ch >= "a" && ch <= "f"))) {
      throw validationFailed({ resource: "Label", field: "color", code: "invalid" });
    }
  }
  return "#" + color;
}

function normalizeLabelNames(names: string[]): string[] {
  if (names.length === 0) {
    throw validationFailed({ resource: "Issue", field: "labels", code: "missing_field" });
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (name === "") {
      throw validationFailed({ resource: "Issue", field: "labels", code: "invalid" });
    }
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  if (result.length === 0) {
    throw validationFailed({ resource: "Issue", field: "labels", code: "missing_field" });
  }
  return result;
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
