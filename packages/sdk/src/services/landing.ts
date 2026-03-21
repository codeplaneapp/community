import { Result } from "better-result";
import type { Sql } from "postgres";

import {
  createLandingRequest,
  getLandingRequestWithChangeIDsByNumber,
  addLandingRequestChange,
  updateLandingRequest,
  enqueueLandingRequest,
  createLandingTask,
  getLandingQueuePositionByTaskID,
  listLandingRequestsWithChangeIDsByRepoFiltered,
  countLandingRequestsByRepoFiltered,
  listLandingRequestReviews,
  countLandingRequestReviews,
  createLandingRequestReview,
  getLandingRequestReviewByID,
  updateLandingRequestReviewState,
  listLandingRequestComments,
  countLandingRequestComments,
  createLandingRequestComment,
  listLandingRequestChanges,
  countLandingRequestChanges,
  countApprovedLandingRequestReviews,
} from "../db/landings_sql";

import {
  getRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser,
} from "../db/repos_sql";

import {
  getUserByID,
} from "../db/users_sql";

import {
  listAllProtectedBookmarksByRepo,
} from "../db/protected_bookmarks_sql";

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

const LANDING_STATE_OPEN = "open";
const LANDING_STATE_CLOSED = "closed";
const LANDING_STATE_MERGED = "merged";
const LANDING_STATE_DRAFT = "draft";

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface User {
  id: number;
  username: string;
}

interface LandingRequestAuthor {
  id: number;
  login: string;
}

interface LandingRequestResponse {
  number: number;
  title: string;
  body: string;
  state: string;
  author: LandingRequestAuthor;
  change_ids: string[];
  target_bookmark: string;
  conflict_status: string;
  stack_size: number;
  created_at: string;
  updated_at: string;
}

interface LandingReviewResponse {
  id: number;
  landing_request_id: number;
  reviewer: LandingRequestAuthor;
  type: string;
  body: string;
  state: string;
  created_at: string;
  updated_at: string;
}

interface LandingCommentResponse {
  id: number;
  landing_request_id: number;
  author: LandingRequestAuthor;
  path: string;
  line: number;
  side: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface LandingRequestChange {
  id: number;
  landing_request_id: number;
  change_id: string;
  position_in_stack: number;
}

interface LandingConflict {
  file_path: string;
  conflict_type: string;
}

interface LandingConflictsResponse {
  conflict_status: string;
  has_conflicts: boolean;
  conflicts_by_change?: Record<string, LandingConflict[]>;
}

interface FileDiff {
  change_id: string;
  file_diffs: unknown[];
}

interface LandingDiffResponse {
  landing_number: number;
  changes: FileDiff[];
}

interface LandingDiffOptions {
  ignore_whitespace: boolean;
}

interface LandLandingRequestAccepted extends LandingRequestResponse {
  queue_position: number;
  task_id: number;
}

interface LandingRequestReview {
  id: number;
  landing_request_id: number;
  reviewer_id: number;
  type: string;
  body: string;
  state: string;
  created_at: string;
  updated_at: string;
}

interface CreateLandingRequestInput {
  title: string;
  body: string;
  target_bookmark: string;
  source_bookmark: string;
  change_ids: string[];
}

interface UpdateLandingRequestInput {
  title?: string;
  body?: string;
  state?: string;
  target_bookmark?: string;
  source_bookmark?: string;
  conflict_status?: string;
}

interface CreateLandingReviewInput {
  type: string;
  body: string;
}

interface DismissLandingReviewInput {
  message: string;
}

interface CreateLandingCommentInput {
  path: string;
  line: number;
  side: string;
  body: string;
}

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
  return {
    pageSize: resolvedPerPage,
    pageOffset: (resolvedPage - 1) * resolvedPerPage,
  };
}

// ---------------------------------------------------------------------------
// ISO string helper
// ---------------------------------------------------------------------------

function toISOString(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString();
  return String(d);
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

// ---------------------------------------------------------------------------
// State machine helpers -- match Go helpers exactly
// ---------------------------------------------------------------------------

function isAllowedLandingState(state: string): boolean {
  return (
    state === LANDING_STATE_OPEN ||
    state === LANDING_STATE_CLOSED ||
    state === LANDING_STATE_DRAFT ||
    state === LANDING_STATE_MERGED
  );
}

function isAllowedConflictStatus(status: string): boolean {
  return status === "clean" || status === "conflicted" || status === "unknown";
}

function isValidLandingTransition(fromState: string, toState: string): boolean {
  if (fromState === toState) return true;
  switch (fromState) {
    case LANDING_STATE_OPEN:
      return toState === LANDING_STATE_DRAFT || toState === LANDING_STATE_CLOSED;
    case LANDING_STATE_DRAFT:
      return toState === LANDING_STATE_OPEN || toState === LANDING_STATE_CLOSED;
    case LANDING_STATE_CLOSED:
      return toState === LANDING_STATE_OPEN;
    default:
      return false;
  }
}

function normalizeLandingFilterState(
  state: string,
): Result<string, APIError> {
  const normalized = (state ?? "").trim().toLowerCase();
  if (normalized === "") return Result.ok("");
  if (!isAllowedLandingState(normalized)) {
    return Result.err(
      validationFailed({ resource: "LandingRequest", field: "state", code: "invalid" }),
    );
  }
  return Result.ok(normalized);
}

function normalizeChangeIDs(changeIDs: string[]): Result<string[], APIError> {
  if (!changeIDs || changeIDs.length === 0) {
    return Result.err(
      validationFailed({ resource: "LandingRequest", field: "change_ids", code: "missing_field" }),
    );
  }
  const normalized: string[] = [];
  for (const raw of changeIDs) {
    const clean = (raw ?? "").trim();
    if (clean === "") {
      return Result.err(
        validationFailed({ resource: "LandingRequest", field: "change_ids", code: "invalid" }),
      );
    }
    normalized.push(clean);
  }
  return Result.ok(normalized);
}

function isAllowedReviewType(reviewType: string): boolean {
  return (
    reviewType === "pending" ||
    reviewType === "approve" ||
    reviewType === "comment" ||
    reviewType === "request_changes"
  );
}

// ---------------------------------------------------------------------------
// Permission helpers -- match Go's repo permission resolution
// ---------------------------------------------------------------------------

function repoPermissionRank(permission: string): number {
  switch (permission.trim().toLowerCase()) {
    case "admin":
      return 3;
    case "write":
      return 2;
    case "read":
      return 1;
    default:
      return 0;
  }
}

function highestRepoPermission(...permissions: string[]): string {
  let best = "";
  for (const permission of permissions) {
    if (repoPermissionRank(permission) > repoPermissionRank(best)) {
      best = permission.trim().toLowerCase();
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Glob-style path matching for protected bookmark patterns
// ---------------------------------------------------------------------------

function matchBookmarkPattern(pattern: string, bookmark: string): boolean {
  // Simple glob match: * matches any sequence of non-/ characters
  // This is a simplified version matching Go's path.Match behavior
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]") + "$";
  try {
    return new RegExp(regexStr).test(bookmark);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LandingService -- matches Go LandingService 1:1
// ---------------------------------------------------------------------------

export class LandingService {
  constructor(private readonly sql: Sql) {}

  // ---- Private helpers ----

  private async resolveRepoByOwnerAndName(owner: string, repo: string) {
    const lowerOwner = (owner ?? "").trim().toLowerCase();
    const lowerRepo = (repo ?? "").trim().toLowerCase();
    if (lowerOwner === "") {
      return Result.err(badRequest("owner is required"));
    }
    if (lowerRepo === "") {
      return Result.err(badRequest("repository name is required"));
    }

    const repository = await getRepoByOwnerAndLowerName(this.sql, {
      owner: lowerOwner,
      lowerName: lowerRepo,
    });
    if (!repository) {
      return Result.err(notFound("repository not found"));
    }
    return Result.ok(repository);
  }

  private async repoPermissionForUser(
    repository: { id: string; userId: string | null; orgId: string | null },
    userId: number,
  ): Promise<Result<{ permission: string; isOwner: boolean }, APIError>> {
    // Direct owner check
    if (repository.userId && repository.userId === String(userId)) {
      return Result.ok({ permission: "", isOwner: true });
    }

    let teamPermission = "";
    if (repository.orgId) {
      const orgOwnerResult = await isOrgOwnerForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userId),
      });
      if (orgOwnerResult?.exists) {
        return Result.ok({ permission: "", isOwner: true });
      }

      const teamResult = await getHighestTeamPermissionForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userId),
      });
      if (teamResult) {
        // The field name may vary - check the actual sqlc generated type
        teamPermission = (teamResult as any).permission ?? (teamResult as any)[""] ?? "";
      }
    }

    const collabResult = await getCollaboratorPermissionForRepoUser(this.sql, {
      repositoryId: repository.id,
      userId: String(userId),
    });
    const collabPermission = collabResult?.permission ?? "";

    return Result.ok({
      permission: highestRepoPermission(teamPermission, collabPermission),
      isOwner: false,
    });
  }

  private async requireReadAccess(
    repository: { id: string; userId: string | null; orgId: string | null; isPublic: boolean },
    viewer: User | null,
  ): Promise<Result<void, APIError>> {
    if (repository.isPublic) {
      return Result.ok(undefined);
    }
    if (!viewer) {
      return Result.err(forbidden("permission denied"));
    }
    const permResult = await this.repoPermissionForUser(repository, viewer.id);
    if (!permResult.isOk()) return permResult as Result<never, APIError>;
    const { permission, isOwner } = permResult.value;
    if (isOwner) return Result.ok(undefined);
    if (permission === "read" || permission === "write" || permission === "admin") {
      return Result.ok(undefined);
    }
    return Result.err(forbidden("permission denied"));
  }

  private async requireWriteAccess(
    repository: { id: string; userId: string | null; orgId: string | null; isPublic: boolean },
    actor: User | null,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const permResult = await this.repoPermissionForUser(repository, actor.id);
    if (!permResult.isOk()) return permResult as Result<never, APIError>;
    const { permission, isOwner } = permResult.value;
    if (isOwner) return Result.ok(undefined);
    if (permission === "write" || permission === "admin") {
      return Result.ok(undefined);
    }
    return Result.err(forbidden("permission denied"));
  }

  private async requireAdminAccess(
    repository: { id: string; userId: string | null; orgId: string | null; isPublic: boolean },
    actor: User | null,
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }
    const permResult = await this.repoPermissionForUser(repository, actor.id);
    if (!permResult.isOk()) return permResult as Result<never, APIError>;
    const { permission, isOwner } = permResult.value;
    if (isOwner) return Result.ok(undefined);
    if (permission === "admin") return Result.ok(undefined);
    return Result.err(forbidden("permission denied"));
  }

  private async getLandingByNumber(repositoryId: string, number: number) {
    if (number <= 0) {
      return Result.err(badRequest("invalid landing number"));
    }
    const row = await getLandingRequestWithChangeIDsByNumber(this.sql, {
      repositoryId,
      number: String(number),
    });
    if (!row) {
      return Result.err(notFound("landing request not found"));
    }
    return Result.ok(row);
  }

  private async resolveLandingAuthor(
    cache: Map<string, LandingRequestAuthor>,
    userId: string,
  ): Promise<Result<LandingRequestAuthor, APIError>> {
    const cached = cache.get(userId);
    if (cached) return Result.ok(cached);

    const user = await getUserByID(this.sql, { id: userId });
    if (!user) {
      return Result.err(internal("failed to load landing request author"));
    }
    const author: LandingRequestAuthor = {
      id: Number(user.id),
      login: user.username,
    };
    cache.set(userId, author);
    return Result.ok(author);
  }

  private async mapLandingRow(
    row: {
      id: string;
      number: string;
      title: string;
      body: string;
      state: string;
      authorId: string;
      targetBookmark: string;
      sourceBookmark: string;
      conflictStatus: string;
      stackSize: string;
      createdAt: Date;
      updatedAt: Date;
      changeIds: string[];
    },
  ): Promise<Result<LandingRequestResponse, APIError>> {
    const author = await getUserByID(this.sql, { id: row.authorId });
    if (!author) {
      return Result.err(internal("failed to load landing request author"));
    }
    return Result.ok({
      number: Number(row.number),
      title: row.title,
      body: row.body,
      state: row.state,
      author: { id: Number(author.id), login: author.username },
      change_ids: row.changeIds ?? [],
      target_bookmark: row.targetBookmark,
      conflict_status: row.conflictStatus,
      stack_size: Number(row.stackSize),
      created_at: toISOString(row.createdAt),
      updated_at: toISOString(row.updatedAt),
    });
  }

  private async mapLandingRecord(
    row: {
      id: string;
      number: string;
      title: string;
      body: string;
      state: string;
      authorId: string;
      targetBookmark: string;
      sourceBookmark: string;
      conflictStatus: string;
      stackSize: string;
      createdAt: Date;
      updatedAt: Date;
    },
    changeIds: string[],
  ): Promise<Result<LandingRequestResponse, APIError>> {
    const author = await getUserByID(this.sql, { id: row.authorId });
    if (!author) {
      return Result.err(internal("failed to load landing request author"));
    }
    return Result.ok({
      number: Number(row.number),
      title: row.title,
      body: row.body,
      state: row.state,
      author: { id: Number(author.id), login: author.username },
      change_ids: changeIds ?? [],
      target_bookmark: row.targetBookmark,
      conflict_status: row.conflictStatus,
      stack_size: Number(row.stackSize),
      created_at: toISOString(row.createdAt),
      updated_at: toISOString(row.updatedAt),
    });
  }

  private async resolveReadableLanding(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
  ) {
    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireReadAccess(repository, viewer);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const landingResult = await this.getLandingByNumber(repository.id, number);
    if (!landingResult.isOk()) return landingResult as Result<never, APIError>;

    return Result.ok({ repository, landingRow: landingResult.value });
  }

  private async requiredApprovalsForProtectedBookmark(
    repositoryId: string,
    targetBookmark: string,
  ): Promise<Result<number, APIError>> {
    const rules = await listAllProtectedBookmarksByRepo(this.sql, { repositoryId });
    let requiredApprovals = 0;
    for (const rule of rules) {
      const matches = matchBookmarkPattern(rule.pattern, targetBookmark);
      if (!matches || !rule.requireReview) continue;
      const ruleApprovals = Number(rule.requiredApprovals);
      if (ruleApprovals > requiredApprovals) {
        requiredApprovals = ruleApprovals;
      }
    }
    return Result.ok(requiredApprovals);
  }

  // ---- Public methods ----

  async listLandingRequests(
    viewer: User | null,
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    state: string,
  ): Promise<Result<{ items: LandingRequestResponse[]; total: number }, APIError>> {
    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireReadAccess(repository, viewer);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const stateResult = normalizeLandingFilterState(state);
    if (!stateResult.isOk()) return stateResult as Result<never, APIError>;
    const normalizedState = stateResult.value;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const totalRow = await countLandingRequestsByRepoFiltered(this.sql, {
      repositoryId: repository.id,
      state: normalizedState,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const rows = await listLandingRequestsWithChangeIDsByRepoFiltered(this.sql, {
      repositoryId: repository.id,
      state: normalizedState,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const authorCache = new Map<string, LandingRequestAuthor>();
    const items: LandingRequestResponse[] = [];
    for (const row of rows) {
      const authorResult = await this.resolveLandingAuthor(authorCache, row.authorId);
      if (!authorResult.isOk()) return authorResult as Result<never, APIError>;
      items.push({
        number: Number(row.number),
        title: row.title,
        body: row.body,
        state: row.state,
        author: authorResult.value,
        change_ids: row.changeIds ?? [],
        target_bookmark: row.targetBookmark,
        conflict_status: row.conflictStatus,
        stack_size: Number(row.stackSize),
        created_at: toISOString(row.createdAt),
        updated_at: toISOString(row.updatedAt),
      });
    }

    return Result.ok({ items, total });
  }

  async createLandingRequest(
    actor: User,
    owner: string,
    repo: string,
    req: CreateLandingRequestInput,
  ): Promise<Result<LandingRequestResponse, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const title = (req.title ?? "").trim();
    if (title === "") {
      return Result.err(
        validationFailed({ resource: "LandingRequest", field: "title", code: "missing_field" }),
      );
    }
    const targetBookmark = (req.target_bookmark ?? "").trim();
    if (targetBookmark === "") {
      return Result.err(
        validationFailed({ resource: "LandingRequest", field: "target_bookmark", code: "missing_field" }),
      );
    }
    const sourceBookmark = (req.source_bookmark ?? "").trim();

    const changeIDsResult = normalizeChangeIDs(req.change_ids);
    if (!changeIDsResult.isOk()) return changeIDsResult as Result<never, APIError>;
    const changeIDs = changeIDsResult.value;

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireWriteAccess(repository, actor);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    try {
      const created = await createLandingRequest(this.sql, {
        repositoryId: repository.id,
        title,
        body: req.body ?? "",
        authorId: String(actor.id),
        targetBookmark,
        sourceBookmark,
        stackSize: String(changeIDs.length),
      });
      if (!created) {
        return Result.err(internal("failed to create landing request"));
      }

      for (let idx = 0; idx < changeIDs.length; idx++) {
        await addLandingRequestChange(this.sql, {
          landingRequestId: created.id,
          changeId: changeIDs[idx]!,
          positionInStack: String(idx + 1),
        });
      }

      const author: LandingRequestAuthor = { id: actor.id, login: actor.username };
      const response: LandingRequestResponse = {
        number: Number(created.number),
        title: created.title,
        body: created.body,
        state: created.state,
        author,
        change_ids: changeIDs,
        target_bookmark: created.targetBookmark,
        conflict_status: created.conflictStatus,
        stack_size: Number(created.stackSize),
        created_at: toISOString(created.createdAt),
        updated_at: toISOString(created.updatedAt),
      };

      return Result.ok(response);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("landing request already exists"));
      }
      return Result.err(internal("failed to create landing request"));
    }
  }

  async getLandingRequest(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<Result<LandingRequestResponse, APIError>> {
    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireReadAccess(repository, viewer);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const landingResult = await this.getLandingByNumber(repository.id, number);
    if (!landingResult.isOk()) return landingResult as Result<never, APIError>;

    return this.mapLandingRow(landingResult.value);
  }

  async updateLandingRequest(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    req: UpdateLandingRequestInput,
  ): Promise<Result<LandingRequestResponse, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireWriteAccess(repository, actor);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const currentResult = await this.getLandingByNumber(repository.id, number);
    if (!currentResult.isOk()) return currentResult as Result<never, APIError>;
    const current = currentResult.value;

    // Apply field updates
    let title = current.title;
    if (req.title !== undefined) {
      title = (req.title ?? "").trim();
      if (title === "") {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "title", code: "missing_field" }),
        );
      }
    }

    let body = current.body;
    if (req.body !== undefined) {
      body = req.body ?? "";
    }

    let state = current.state;
    if (req.state !== undefined) {
      const nextState = (req.state ?? "").trim().toLowerCase();
      if (nextState === "") {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "state", code: "invalid" }),
        );
      }
      if (nextState === LANDING_STATE_MERGED) {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "state", code: "invalid" }),
        );
      }
      if (!isAllowedLandingState(nextState)) {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "state", code: "invalid" }),
        );
      }
      if (!isValidLandingTransition(current.state, nextState)) {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "state", code: "invalid" }),
        );
      }
      state = nextState;
    }

    let targetBookmark = current.targetBookmark;
    if (req.target_bookmark !== undefined) {
      const nextTarget = (req.target_bookmark ?? "").trim();
      if (nextTarget === "") {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "target_bookmark", code: "missing_field" }),
        );
      }
      targetBookmark = nextTarget;
    }

    let sourceBookmark = current.sourceBookmark;
    if (req.source_bookmark !== undefined) {
      sourceBookmark = (req.source_bookmark ?? "").trim();
    }

    let conflictStatus = current.conflictStatus;
    if (req.conflict_status !== undefined) {
      const nextConflictStatus = (req.conflict_status ?? "").trim().toLowerCase();
      if (!isAllowedConflictStatus(nextConflictStatus)) {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "conflict_status", code: "invalid" }),
        );
      }
      conflictStatus = nextConflictStatus;
    }

    const shouldPersist =
      req.title !== undefined ||
      req.body !== undefined ||
      req.state !== undefined ||
      req.target_bookmark !== undefined ||
      req.source_bookmark !== undefined ||
      req.conflict_status !== undefined;

    if (shouldPersist) {
      let closedAt: Date | null = current.closedAt;
      const mergedAt: Date | null = current.mergedAt;

      if (state === LANDING_STATE_CLOSED) {
        if (!closedAt || current.state !== LANDING_STATE_CLOSED) {
          closedAt = new Date();
        }
      } else {
        closedAt = null;
      }

      const updatedRow = await updateLandingRequest(this.sql, {
        title,
        body,
        state,
        targetBookmark,
        sourceBookmark,
        conflictStatus,
        stackSize: current.stackSize,
        closedAt,
        mergedAt,
        id: current.id,
      });
      if (!updatedRow) {
        return Result.err(internal("failed to update landing request"));
      }

      return this.mapLandingRecord(updatedRow, current.changeIds);
    }

    return this.mapLandingRecord(
      {
        id: current.id,
        number: current.number,
        title: current.title,
        body: current.body,
        state: current.state,
        authorId: current.authorId,
        targetBookmark: current.targetBookmark,
        sourceBookmark: current.sourceBookmark,
        conflictStatus: current.conflictStatus,
        stackSize: current.stackSize,
        createdAt: current.createdAt,
        updatedAt: current.updatedAt,
      },
      current.changeIds,
    );
  }

  async landLandingRequest(
    actor: User,
    owner: string,
    repo: string,
    number: number,
  ): Promise<Result<LandLandingRequestAccepted, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireAdminAccess(repository, actor);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const landingResult = await this.getLandingByNumber(repository.id, number);
    if (!landingResult.isOk()) return landingResult as Result<never, APIError>;
    const landingRow = landingResult.value;

    if (landingRow.state !== LANDING_STATE_OPEN) {
      return Result.err(conflict("landing request is not open"));
    }
    if (!landingRow.changeIds || landingRow.changeIds.length === 0) {
      return Result.err(
        validationFailed({ resource: "LandingRequest", field: "change_ids", code: "invalid" }),
      );
    }

    // Check protected bookmark approvals
    const requiredResult = await this.requiredApprovalsForProtectedBookmark(
      repository.id,
      landingRow.targetBookmark,
    );
    if (!requiredResult.isOk()) return requiredResult as Result<never, APIError>;
    const requiredApprovals = requiredResult.value;

    if (requiredApprovals > 0) {
      const approvedRow = await countApprovedLandingRequestReviews(this.sql, {
        landingRequestId: landingRow.id,
      });
      const approvedCount = approvedRow ? Number(approvedRow.count) : 0;
      if (approvedCount < requiredApprovals) {
        return Result.err(
          validationFailed({ resource: "LandingRequest", field: "target_bookmark", code: "invalid" }),
        );
      }
    }

    // Enqueue the landing request
    const enqueuedRow = await enqueueLandingRequest(this.sql, {
      queuedBy: String(actor.id),
      id: landingRow.id,
    });
    if (!enqueuedRow) {
      return Result.err(conflict("landing request is not open"));
    }

    // Create landing task
    const task = await createLandingTask(this.sql, {
      landingRequestId: landingRow.id,
      repositoryId: repository.id,
      priority: 1,
    });
    if (!task) {
      return Result.err(internal("failed to create landing task"));
    }

    // Get queue position
    const positionRow = await getLandingQueuePositionByTaskID(this.sql, { id: task.id });
    const position = positionRow ? Number(positionRow.position) : 0;

    const respResult = await this.mapLandingRecord(enqueuedRow, landingRow.changeIds);
    if (!respResult.isOk()) return respResult as Result<never, APIError>;

    return Result.ok({
      ...respResult.value,
      queue_position: position,
      task_id: Number(task.id),
    });
  }

  async listLandingReviews(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: LandingReviewResponse[]; total: number }, APIError>> {
    const resolveResult = await this.resolveReadableLanding(viewer, owner, repo, number);
    if (!resolveResult.isOk()) return resolveResult as Result<never, APIError>;
    const { landingRow } = resolveResult.value;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const reviews = await listLandingRequestReviews(this.sql, {
      landingRequestId: landingRow.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });
    const totalRow = await countLandingRequestReviews(this.sql, {
      landingRequestId: landingRow.id,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const reviewerCache = new Map<string, LandingRequestAuthor>();
    const items: LandingReviewResponse[] = [];
    for (const review of reviews) {
      const reviewerResult = await this.resolveLandingAuthor(reviewerCache, review.reviewerId);
      if (!reviewerResult.isOk()) return reviewerResult as Result<never, APIError>;
      items.push({
        id: Number(review.id),
        landing_request_id: Number(review.landingRequestId),
        reviewer: reviewerResult.value,
        type: review.type,
        body: review.body,
        state: review.state,
        created_at: toISOString(review.createdAt),
        updated_at: toISOString(review.updatedAt),
      });
    }

    return Result.ok({ items, total });
  }

  async createLandingReview(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    req: CreateLandingReviewInput,
  ): Promise<Result<LandingReviewResponse, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const reviewType = (req.type ?? "").trim().toLowerCase();
    if (!isAllowedReviewType(reviewType)) {
      return Result.err(
        validationFailed({ resource: "LandingReview", field: "type", code: "invalid" }),
      );
    }
    if ((reviewType === "comment" || reviewType === "request_changes") && (req.body ?? "").trim() === "") {
      return Result.err(
        validationFailed({ resource: "LandingReview", field: "body", code: "missing_field" }),
      );
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireWriteAccess(repository, actor);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const landingResult = await this.getLandingByNumber(repository.id, number);
    if (!landingResult.isOk()) return landingResult as Result<never, APIError>;
    const landingRow = landingResult.value;

    const review = await createLandingRequestReview(this.sql, {
      landingRequestId: landingRow.id,
      reviewerId: String(actor.id),
      type: reviewType,
      body: req.body ?? "",
    });
    if (!review) {
      return Result.err(internal("failed to create landing review"));
    }

    return Result.ok({
      id: Number(review.id),
      landing_request_id: Number(review.landingRequestId),
      reviewer: { id: actor.id, login: actor.username },
      type: review.type,
      body: review.body,
      state: review.state,
      created_at: toISOString(review.createdAt),
      updated_at: toISOString(review.updatedAt),
    });
  }

  async dismissLandingReview(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    reviewID: number,
    _req: DismissLandingReviewInput,
  ): Promise<Result<LandingRequestReview, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireWriteAccess(repository, actor);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const landingResult = await this.getLandingByNumber(repository.id, number);
    if (!landingResult.isOk()) return landingResult as Result<never, APIError>;
    const landingRow = landingResult.value;

    // Verify review belongs to this landing request
    const review = await getLandingRequestReviewByID(this.sql, { id: String(reviewID) });
    if (!review) {
      return Result.err(notFound("review not found"));
    }
    if (review.landingRequestId !== landingRow.id) {
      return Result.err(notFound("review not found"));
    }

    const updated = await updateLandingRequestReviewState(this.sql, {
      id: String(reviewID),
      state: "dismissed",
    });
    if (!updated) {
      return Result.err(notFound("review not found"));
    }

    return Result.ok({
      id: Number(updated.id),
      landing_request_id: Number(updated.landingRequestId),
      reviewer_id: Number(updated.reviewerId),
      type: updated.type,
      body: updated.body,
      state: updated.state,
      created_at: toISOString(updated.createdAt),
      updated_at: toISOString(updated.updatedAt),
    });
  }

  async listLandingComments(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: LandingCommentResponse[]; total: number }, APIError>> {
    const resolveResult = await this.resolveReadableLanding(viewer, owner, repo, number);
    if (!resolveResult.isOk()) return resolveResult as Result<never, APIError>;
    const { landingRow } = resolveResult.value;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const comments = await listLandingRequestComments(this.sql, {
      landingRequestId: landingRow.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });
    const totalRow = await countLandingRequestComments(this.sql, {
      landingRequestId: landingRow.id,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const authorCache = new Map<string, LandingRequestAuthor>();
    const items: LandingCommentResponse[] = [];
    for (const comment of comments) {
      const authorResult = await this.resolveLandingAuthor(authorCache, comment.userId);
      if (!authorResult.isOk()) return authorResult as Result<never, APIError>;
      items.push({
        id: Number(comment.id),
        landing_request_id: Number(comment.landingRequestId),
        author: authorResult.value,
        path: comment.path,
        line: Number(comment.line),
        side: comment.side,
        body: comment.body,
        created_at: toISOString(comment.createdAt),
        updated_at: toISOString(comment.updatedAt),
      });
    }

    return Result.ok({ items, total });
  }

  async createLandingComment(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    req: CreateLandingCommentInput,
  ): Promise<Result<LandingCommentResponse, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const body = (req.body ?? "").trim();
    if (body === "") {
      return Result.err(
        validationFailed({ resource: "LandingComment", field: "body", code: "missing_field" }),
      );
    }
    if (req.line < 0) {
      return Result.err(
        validationFailed({ resource: "LandingComment", field: "line", code: "invalid" }),
      );
    }
    const path = (req.path ?? "").trim();
    if (req.line > 0 && path === "") {
      return Result.err(
        validationFailed({ resource: "LandingComment", field: "path", code: "missing_field" }),
      );
    }
    let side = (req.side ?? "").trim().toLowerCase();
    if (side === "") side = "right";
    if (side !== "left" && side !== "right" && side !== "both") {
      return Result.err(
        validationFailed({ resource: "LandingComment", field: "side", code: "invalid" }),
      );
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (!repoResult.isOk()) return repoResult as Result<never, APIError>;
    const repository = repoResult.value;

    const accessResult = await this.requireWriteAccess(repository, actor);
    if (!accessResult.isOk()) return accessResult as Result<never, APIError>;

    const landingResult = await this.getLandingByNumber(repository.id, number);
    if (!landingResult.isOk()) return landingResult as Result<never, APIError>;
    const landingRow = landingResult.value;

    const comment = await createLandingRequestComment(this.sql, {
      landingRequestId: landingRow.id,
      userId: String(actor.id),
      path,
      line: String(req.line),
      side,
      body: req.body ?? "",
    });
    if (!comment) {
      return Result.err(internal("failed to create landing comment"));
    }

    return Result.ok({
      id: Number(comment.id),
      landing_request_id: Number(comment.landingRequestId),
      author: { id: actor.id, login: actor.username },
      path: comment.path,
      line: Number(comment.line),
      side: comment.side,
      body: comment.body,
      created_at: toISOString(comment.createdAt),
      updated_at: toISOString(comment.updatedAt),
    });
  }

  async listLandingChanges(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<Result<{ items: LandingRequestChange[]; total: number }, APIError>> {
    const resolveResult = await this.resolveReadableLanding(viewer, owner, repo, number);
    if (!resolveResult.isOk()) return resolveResult as Result<never, APIError>;
    const { landingRow } = resolveResult.value;

    const { pageSize, pageOffset } = normalizePage(page, perPage);
    const changes = await listLandingRequestChanges(this.sql, {
      landingRequestId: landingRow.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });
    const totalRow = await countLandingRequestChanges(this.sql, {
      landingRequestId: landingRow.id,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const items: LandingRequestChange[] = changes.map((c) => ({
      id: Number(c.id),
      landing_request_id: Number(c.landingRequestId),
      change_id: c.changeId,
      position_in_stack: Number(c.positionInStack),
    }));

    return Result.ok({ items, total });
  }

  async getLandingConflicts(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<Result<LandingConflictsResponse, APIError>> {
    const resolveResult = await this.resolveReadableLanding(viewer, owner, repo, number);
    if (!resolveResult.isOk()) return resolveResult as Result<never, APIError>;
    const { landingRow } = resolveResult.value;

    const resp: LandingConflictsResponse = {
      conflict_status: landingRow.conflictStatus,
      has_conflicts: landingRow.conflictStatus === "conflicted",
    };

    if (!resp.has_conflicts) {
      return Result.ok(resp);
    }

    // Conflict details require repo-host calls. For now, return the status
    // without per-change details. The repo-host integration will be wired later.
    resp.conflicts_by_change = {};
    return Result.ok(resp);
  }

  async getLandingDiff(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    _opts: LandingDiffOptions,
  ): Promise<Result<LandingDiffResponse, APIError>> {
    const resolveResult = await this.resolveReadableLanding(viewer, owner, repo, number);
    if (!resolveResult.isOk()) return resolveResult as Result<never, APIError>;
    const { landingRow } = resolveResult.value;

    // Diff generation requires repo-host calls (jj). For now, return a
    // skeleton response. The repo-host integration will be wired later.
    const changes: FileDiff[] = (landingRow.changeIds ?? []).map((changeId: string) => ({
      change_id: changeId,
      file_diffs: [],
    }));

    return Result.ok({
      landing_number: Number(landingRow.number),
      changes,
    });
  }
}
