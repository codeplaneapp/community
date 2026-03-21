import { Result } from "better-result";
import type { Sql } from "postgres";
import type { AuthUser } from "../lib/context";
import {
  APIError,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  internal,
  validationFailed,
} from "../lib/errors";

import {
  createIssue as dbCreateIssue,
  getIssueByNumber as dbGetIssueByNumber,
  getIssueByID as dbGetIssueByID,
  listIssuesByRepoFiltered as dbListIssuesByRepoFiltered,
  countIssuesByRepoFiltered as dbCountIssuesByRepoFiltered,
  updateIssue as dbUpdateIssue,
  addIssueAssignee as dbAddIssueAssignee,
  deleteIssueAssignees as dbDeleteIssueAssignees,
  deleteIssueLabels as dbDeleteIssueLabels,
  listIssueAssignees as dbListIssueAssignees,
  createIssueComment as dbCreateIssueComment,
  listIssueComments as dbListIssueComments,
  countIssueCommentsByIssue as dbCountIssueCommentsByIssue,
  getIssueCommentByID as dbGetIssueCommentByID,
  updateIssueComment as dbUpdateIssueComment,
  deleteIssueComment as dbDeleteIssueComment,
  getIssueByCommentID as dbGetIssueByCommentID,
  incrementIssueCommentCount as dbIncrementIssueCommentCount,
  decrementIssueCommentCount as dbDecrementIssueCommentCount,
  incrementRepoIssueCount as dbIncrementRepoIssueCount,
  incrementRepoClosedIssueCount as dbIncrementRepoClosedIssueCount,
  decrementRepoClosedIssueCount as dbDecrementRepoClosedIssueCount,
  createIssueEvent as dbCreateIssueEvent,
  listIssueEventsByIssue as dbListIssueEventsByIssue,
  type CreateIssueRow,
  type GetIssueByNumberRow,
  type GetIssueByCommentIDRow,
  type ListIssueAssigneesRow,
  type CreateIssueCommentRow,
  type GetIssueCommentByIDRow,
  type UpdateIssueCommentRow,
  type ListIssueCommentsRow,
  type ListIssueEventsByIssueRow,
} from "../db/issues_sql";

import {
  listLabelsByNames as dbListLabelsByNames,
  addIssueLabels as dbAddIssueLabels,
  listLabelsForIssue as dbListLabelsForIssue,
  countLabelsForIssue as dbCountLabelsForIssue,
  type ListLabelsForIssueRow,
} from "../db/labels_sql";

import {
  getMilestoneByID as dbGetMilestoneByID,
} from "../db/milestones_sql";

import {
  getUserByID as dbGetUserByID,
  getUserByLowerUsername as dbGetUserByLowerUsername,
} from "../db/users_sql";

import {
  getRepoByOwnerAndLowerName as dbGetRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser as dbIsOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser as dbGetHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser as dbGetCollaboratorPermissionForRepoUser,
  type GetRepoByOwnerAndLowerNameRow,
} from "../db/repos_sql";

import {
  addIssueDependency as dbAddIssueDependency,
  listIssueDependencies as dbListIssueDependencies,
  listIssueDependents as dbListIssueDependents,
  deleteIssueDependency as dbDeleteIssueDependency,
  deleteAllIssueDependencies as dbDeleteAllIssueDependencies,
  type ListIssueDependenciesRow,
  type ListIssueDependentsRow,
} from "../db/issue_dependencies_sql";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Service input types -- mirrors Go services.CreateIssueInput, etc.
// ---------------------------------------------------------------------------

interface CreateIssueInput {
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

interface IssueMilestonePatch {
  value: number | null;
}

interface UpdateIssueInput {
  title?: string;
  body?: string;
  state?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: IssueMilestonePatch;
}

interface CreateIssueCommentInput {
  body: string;
}

interface UpdateIssueCommentInput {
  body: string;
}

// ---------------------------------------------------------------------------
// Response types -- mirrors Go services.IssueResponse, IssueCommentResponse
// ---------------------------------------------------------------------------

interface IssueUserSummary {
  id: number;
  login: string;
}

interface LabelSummary {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface IssueResponse {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  author: IssueUserSummary;
  assignees: IssueUserSummary[];
  labels: LabelSummary[];
  milestone_id: number | null;
  comment_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface IssueCommentResponse {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;
  created_at: string;
  updated_at: string;
}

// Internal issue row type (union of all the issue row shapes from sqlc)
type IssueRow = CreateIssueRow | GetIssueByNumberRow | GetIssueByCommentIDRow;

// ---------------------------------------------------------------------------
// IssueService
// ---------------------------------------------------------------------------

export class IssueService {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async listIssues(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    state: string,
  ): Promise<{ items: IssueResponse[]; total: number }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const normalizedState = normalizeIssueFilterState(state);
    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const countRow = await dbCountIssuesByRepoFiltered(this.sql, {
      repositoryId: repository.id,
      state: normalizedState,
    });
    const total = countRow ? Number(countRow.count) : 0;

    const rows = await dbListIssuesByRepoFiltered(this.sql, {
      repositoryId: repository.id,
      state: normalizedState,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items: IssueResponse[] = [];
    for (const row of rows) {
      items.push(await this.mapIssue(row));
    }

    return { items, total };
  }

  async createIssue(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    req: CreateIssueInput,
  ): Promise<IssueResponse> {
    if (!actor) throw unauthorized("authentication required");

    const title = (req.title ?? "").trim();
    if (title === "") {
      throw validationFailed({ resource: "Issue", field: "title", code: "missing_field" });
    }

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const milestoneId = await this.resolveIssueMilestone(repository.id, req.milestone ?? null);

    const created = await dbCreateIssue(this.sql, {
      repositoryId: repository.id,
      title,
      body: req.body,
      authorId: String(actor.id),
      milestoneId: milestoneId,
    });
    if (!created) throw internal("failed to create issue");

    await dbIncrementRepoIssueCount(this.sql, { id: repository.id });

    if (req.assignees && req.assignees.length > 0) {
      await this.replaceAssignees(created.id, req.assignees);
    }
    if (req.labels && req.labels.length > 0) {
      await this.replaceLabels(created.id, repository.id, req.labels);
    }

    return this.mapIssue(created);
  }

  async getIssue(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<IssueResponse> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);
    const issue = await this.getIssueByNumber(repository.id, number);
    return this.mapIssue(issue);
  }

  async updateIssue(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    req: UpdateIssueInput,
  ): Promise<IssueResponse> {
    if (!actor) throw unauthorized("authentication required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const current = await this.getIssueByNumber(repository.id, number);

    let title = current.title;
    if (req.title !== undefined) {
      title = req.title.trim();
      if (title === "") {
        throw validationFailed({ resource: "Issue", field: "title", code: "missing_field" });
      }
    }

    let body = current.body;
    if (req.body !== undefined) {
      body = req.body;
    }

    let state = current.state;
    if (req.state !== undefined) {
      state = normalizeIssueState(req.state);
    }

    let closedAt: Date | null = current.closedAt;
    if (state === "closed") {
      if (!closedAt || current.state !== "closed") {
        closedAt = new Date();
      }
    } else {
      closedAt = null;
    }

    let milestoneId: string | null = current.milestoneId;
    if (req.milestone !== undefined) {
      if (req.milestone.value === null) {
        milestoneId = null;
      } else {
        milestoneId = await this.resolveIssueMilestone(repository.id, req.milestone.value);
      }
    }

    const updated = await dbUpdateIssue(this.sql, {
      id: current.id,
      title,
      body,
      state,
      milestoneId,
      closedAt,
    });
    if (!updated) throw internal("failed to update issue");

    // Update repo closed-issue counter on state transitions
    if (current.state !== state) {
      if (current.state === "open" && state === "closed") {
        await dbIncrementRepoClosedIssueCount(this.sql, { id: repository.id });
      }
      if (current.state === "closed" && state === "open") {
        await dbDecrementRepoClosedIssueCount(this.sql, { id: repository.id });
      }
    }

    if (req.assignees !== undefined) {
      await this.replaceAssignees(updated.id, req.assignees);
    }
    if (req.labels !== undefined) {
      await this.replaceLabels(updated.id, repository.id, req.labels);
    }

    return this.mapIssue(updated);
  }

  async getIssueComment(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    commentId: number,
  ): Promise<IssueCommentResponse> {
    if (commentId <= 0) throw badRequest("invalid comment id");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const comment = await dbGetIssueCommentByID(this.sql, { id: String(commentId) });
    if (!comment) throw notFound("comment not found");

    return mapIssueComment(comment);
  }

  async createIssueComment(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    req: CreateIssueCommentInput,
  ): Promise<IssueCommentResponse> {
    if (!actor) throw unauthorized("authentication required");

    const body = (req.body ?? "").trim();
    if (body === "") {
      throw validationFailed({ resource: "IssueComment", field: "body", code: "missing_field" });
    }

    const { repository, issue } = await this.resolveWritableIssue(actor, owner, repo, number);

    const comment = await dbCreateIssueComment(this.sql, {
      issueId: issue.id,
      userId: String(actor.id),
      body,
      commenter: actor.username,
    });
    if (!comment) throw internal("failed to create issue comment");

    await dbIncrementIssueCommentCount(this.sql, { id: issue.id });

    return mapIssueComment(comment);
  }

  async listIssueComments(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<{ items: IssueCommentResponse[]; total: number }> {
    const { issue } = await this.resolveReadableIssue(viewer, owner, repo, number);

    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const countRow = await dbCountIssueCommentsByIssue(this.sql, { issueId: issue.id });
    const total = countRow ? Number(countRow.count) : 0;

    const rows = await dbListIssueComments(this.sql, {
      issueId: issue.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items = rows.map(mapIssueComment);
    return { items, total };
  }

  async updateIssueComment(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    commentId: number,
    req: UpdateIssueCommentInput,
  ): Promise<IssueCommentResponse> {
    if (!actor) throw unauthorized("authentication required");

    const body = (req.body ?? "").trim();
    if (body === "") {
      throw validationFailed({ resource: "IssueComment", field: "body", code: "missing_field" });
    }

    if (commentId <= 0) throw badRequest("invalid comment id");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const issue = await dbGetIssueByCommentID(this.sql, { id: String(commentId) });
    if (!issue) throw notFound("issue comment not found");
    if (issue.repositoryId !== repository.id) throw notFound("issue comment not found");

    const updated = await dbUpdateIssueComment(this.sql, { id: String(commentId), body });
    if (!updated) throw notFound("issue comment not found");

    return mapIssueComment(updated);
  }

  async deleteIssueComment(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    commentId: number,
  ): Promise<void> {
    if (!actor) throw unauthorized("authentication required");
    if (commentId <= 0) throw badRequest("invalid comment id");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const issue = await dbGetIssueByCommentID(this.sql, { id: String(commentId) });
    if (!issue) throw notFound("issue comment not found");
    if (issue.repositoryId !== repository.id) throw notFound("issue comment not found");

    await dbDeleteIssueComment(this.sql, { id: String(commentId) });
    await dbDecrementIssueCommentCount(this.sql, { id: issue.id });
  }

  // -------------------------------------------------------------------------
  // Issue events
  // -------------------------------------------------------------------------

  async createIssueEvent(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    eventType: string,
    payload: unknown,
  ): Promise<{ id: number; issueId: number; actorId: number | null; eventType: string; payload: unknown; createdAt: string }> {
    if (!actor) throw unauthorized("authentication required");

    const { repository, issue } = await this.resolveWritableIssue(actor, owner, repo, number);

    const row = await dbCreateIssueEvent(this.sql, {
      issueId: issue.id,
      actorId: String(actor.id),
      eventType,
      payload: JSON.stringify(payload),
    });
    if (!row) throw internal("failed to create issue event");

    return {
      id: Number(row.id),
      issueId: Number(row.issueId),
      actorId: row.actorId ? Number(row.actorId) : null,
      eventType: row.eventType,
      payload: row.payload,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    };
  }

  async listIssueEvents(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<{ items: Array<{ id: number; issueId: number; actorId: number | null; eventType: string; payload: unknown; createdAt: string }>; total: number }> {
    const { issue } = await this.resolveReadableIssue(viewer, owner, repo, number);

    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const rows = await dbListIssueEventsByIssue(this.sql, {
      issueId: issue.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items = rows.map((row) => ({
      id: Number(row.id),
      issueId: Number(row.issueId),
      actorId: row.actorId ? Number(row.actorId) : null,
      eventType: row.eventType,
      payload: row.payload,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));

    // The sqlc query does not have a COUNT counterpart for events. Return rows length
    // as total since there is no count query in the generated code.
    return { items, total: items.length };
  }

  // -------------------------------------------------------------------------
  // Dependency graph
  // -------------------------------------------------------------------------

  async addDependency(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    issueNumber: number,
    dependsOnNumber: number,
  ): Promise<void> {
    if (!actor) throw unauthorized("authentication required");
    if (issueNumber === dependsOnNumber) throw badRequest("an issue cannot depend on itself");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const issue = await this.getIssueByNumber(repository.id, issueNumber);
    const dependsOn = await this.getIssueByNumber(repository.id, dependsOnNumber);

    const result = await dbAddIssueDependency(this.sql, {
      issueId: issue.id,
      dependsOnIssueId: dependsOn.id,
    });
    if (!result) throw internal("failed to add issue dependency");
  }

  async removeDependency(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    issueNumber: number,
    dependsOnNumber: number,
  ): Promise<void> {
    if (!actor) throw unauthorized("authentication required");

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const issue = await this.getIssueByNumber(repository.id, issueNumber);
    const dependsOn = await this.getIssueByNumber(repository.id, dependsOnNumber);

    await dbDeleteIssueDependency(this.sql, {
      issueId: issue.id,
      dependsOnIssueId: dependsOn.id,
    });
  }

  async listDependencies(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<{ dependencies: Array<{ issueId: number; dependsOnIssueId: number; createdAt: string }>; dependents: Array<{ issueId: number; dependsOnIssueId: number; createdAt: string }> }> {
    const { issue } = await this.resolveReadableIssue(viewer, owner, repo, issueNumber);

    const [dependencies, dependents] = await Promise.all([
      dbListIssueDependencies(this.sql, { issueId: issue.id }),
      dbListIssueDependents(this.sql, { dependsOnIssueId: issue.id }),
    ]);

    return {
      dependencies: dependencies.map(mapDependencyRow),
      dependents: dependents.map(mapDependencyRow),
    };
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
      // The sqlc codegen has a nameless field for this query's COALESCE result
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

  // -------------------------------------------------------------------------
  // Internal helpers -- issue resolution
  // -------------------------------------------------------------------------

  private async getIssueByNumber(repositoryId: string, number: number): Promise<GetIssueByNumberRow> {
    if (number <= 0) throw badRequest("invalid issue number");
    const issue = await dbGetIssueByNumber(this.sql, {
      repositoryId,
      number: String(number),
    });
    if (!issue) throw notFound("issue not found");
    return issue;
  }

  private async resolveReadableIssue(
    viewer: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<{ repository: GetRepoByOwnerAndLowerNameRow; issue: GetIssueByNumberRow }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);
    const issue = await this.getIssueByNumber(repository.id, number);
    return { repository, issue };
  }

  private async resolveWritableIssue(
    actor: AuthUser | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<{ repository: GetRepoByOwnerAndLowerNameRow; issue: GetIssueByNumberRow }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);
    const issue = await this.getIssueByNumber(repository.id, number);
    return { repository, issue };
  }

  // -------------------------------------------------------------------------
  // Internal helpers -- milestone resolution
  // -------------------------------------------------------------------------

  private async resolveIssueMilestone(repositoryId: string, milestone: number | null): Promise<string | null> {
    if (milestone === null || milestone === undefined) return null;
    if (milestone <= 0) {
      throw validationFailed({ resource: "Issue", field: "milestone", code: "invalid" });
    }

    const row = await dbGetMilestoneByID(this.sql, {
      repositoryId,
      id: String(milestone),
    });
    if (!row) {
      throw validationFailed({ resource: "Issue", field: "milestone", code: "invalid" });
    }
    return String(milestone);
  }

  // -------------------------------------------------------------------------
  // Internal helpers -- assignees
  // -------------------------------------------------------------------------

  private async replaceAssignees(issueId: string, usernames: string[]): Promise<void> {
    const normalized = normalizeAssigneeUsernames(usernames);

    await dbDeleteIssueAssignees(this.sql, { issueId });

    for (const username of normalized) {
      const user = await dbGetUserByLowerUsername(this.sql, { lowerUsername: username });
      if (!user) {
        throw validationFailed({ resource: "Issue", field: "assignees", code: "invalid" });
      }

      const result = await Result.tryPromise(() =>
        dbAddIssueAssignee(this.sql, { issueId, userId: user.id }),
      );
      if (Result.isError(result)) {
        if (isUniqueViolation(result.error)) continue;
        throw internal("failed to update issue assignees");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers -- labels
  // -------------------------------------------------------------------------

  private async replaceLabels(issueId: string, repositoryId: string, names: string[]): Promise<void> {
    await dbDeleteIssueLabels(this.sql, { issueId });
    if (names.length === 0) return;

    const normalized = normalizeLabelNames(names);

    const labels = await dbListLabelsByNames(this.sql, {
      repositoryId,
      names: normalized,
    });
    if (labels.length !== normalized.length) {
      throw validationFailed({ resource: "Issue", field: "labels", code: "invalid" });
    }

    const labelIds = labels.map((l) => l.id);
    await dbAddIssueLabels(this.sql, { issueId, labelIds });
  }

  // -------------------------------------------------------------------------
  // Internal helpers -- mapping
  // -------------------------------------------------------------------------

  private async listAllLabelsForIssue(issueId: string): Promise<LabelSummary[]> {
    const countRow = await dbCountLabelsForIssue(this.sql, { issueId });
    const total = countRow ? Number(countRow.count) : 0;
    if (total === 0) return [];

    const labels: LabelSummary[] = [];
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
        labels.push({
          id: Number(row.id),
          name: row.name,
          color: row.color,
          description: row.description,
        });
      }
      offset += rows.length;
    }
    return labels;
  }

  private async mapIssue(issue: IssueRow): Promise<IssueResponse> {
    const author = await dbGetUserByID(this.sql, { id: issue.authorId });
    if (!author) throw internal("failed to load issue author");

    const assigneeRows = await dbListIssueAssignees(this.sql, { issueId: issue.id });
    const assignees: IssueUserSummary[] = assigneeRows.map((a) => ({
      id: Number(a.id),
      login: a.username,
    }));

    const labels = await this.listAllLabelsForIssue(issue.id);

    const milestoneId = issue.milestoneId ? Number(issue.milestoneId) : null;

    return {
      id: Number(issue.id),
      number: Number(issue.number),
      title: issue.title,
      body: issue.body,
      state: issue.state,
      author: { id: Number(author.id), login: author.username },
      assignees,
      labels,
      milestone_id: milestoneId,
      comment_count: Number(issue.commentCount),
      closed_at: issue.closedAt instanceof Date ? issue.closedAt.toISOString() : issue.closedAt ?? null,
      created_at: issue.createdAt instanceof Date ? issue.createdAt.toISOString() : String(issue.createdAt),
      updated_at: issue.updatedAt instanceof Date ? issue.updatedAt.toISOString() : String(issue.updatedAt),
    };
  }
}

// ---------------------------------------------------------------------------
// Standalone mappers
// ---------------------------------------------------------------------------

function mapIssueComment(comment: CreateIssueCommentRow | GetIssueCommentByIDRow | UpdateIssueCommentRow | ListIssueCommentsRow): IssueCommentResponse {
  return {
    id: Number(comment.id),
    issue_id: Number(comment.issueId),
    user_id: Number(comment.userId),
    commenter: comment.commenter,
    body: comment.body,
    type: comment.type,
    created_at: comment.createdAt instanceof Date ? comment.createdAt.toISOString() : String(comment.createdAt),
    updated_at: comment.updatedAt instanceof Date ? comment.updatedAt.toISOString() : String(comment.updatedAt),
  };
}

function mapDependencyRow(row: ListIssueDependenciesRow | ListIssueDependentsRow): { issueId: number; dependsOnIssueId: number; createdAt: string } {
  return {
    issueId: Number(row.issueId),
    dependsOnIssueId: Number(row.dependsOnIssueId),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}

// ---------------------------------------------------------------------------
// Validation helpers -- mirrors Go validation functions
// ---------------------------------------------------------------------------

function normalizeIssueFilterState(raw: string): string {
  const state = raw.trim().toLowerCase();
  if (state === "") return "";
  if (state !== "open" && state !== "closed") {
    throw validationFailed({ resource: "Issue", field: "state", code: "invalid" });
  }
  return state;
}

function normalizeIssueState(raw: string): string {
  const state = raw.trim().toLowerCase();
  if (state !== "open" && state !== "closed") {
    throw validationFailed({ resource: "Issue", field: "state", code: "invalid" });
  }
  return state;
}

function normalizeAssigneeUsernames(usernames: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of usernames) {
    const username = raw.trim().toLowerCase();
    if (username === "") {
      throw validationFailed({ resource: "Issue", field: "assignees", code: "invalid" });
    }
    if (seen.has(username)) continue;
    seen.add(username);
    result.push(username);
  }
  return result;
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
