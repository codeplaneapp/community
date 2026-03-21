import { Result } from "better-result";
import type { Sql } from "postgres";

import {
  createRepo,
  createOrgRepo,
  createForkRepo,
  deleteRepo,
  getRepoByOwnerAndLowerName,
  getRepoByID,
  updateRepo,
  updateRepoTopics,
  archiveRepo,
  unarchiveRepo,
  transferRepoToUser,
  transferRepoToOrg,
  deleteCollaboratorsByRepo,
  deleteTeamReposByRepo,
  incrementRepoStars,
  decrementRepoStars,
  incrementRepoForks,
  isOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser,
} from "../db/repos_sql";
import {
  starRepo,
  unstarRepo,
  isRepoStarred,
  listRepoStargazers,
  countRepoStars,
  countRepoWatchers,
} from "../db/social_sql";
import {
  getUserByLowerUsername,
} from "../db/users_sql";
import {
  getOrgByLowerName,
  getOrgMember,
} from "../db/orgs_sql";

import {
  type APIError,
  notFound,
  badRequest,
  internal,
  conflict,
  forbidden,
  unauthorized,
  validationFailed,
} from "../lib/errors";

// ---------------------------------------------------------------------------
// Constants — match Go's repo.go
// ---------------------------------------------------------------------------

const REPO_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const REPO_TOPIC_REGEX = /^[a-z0-9][a-z0-9-]{0,34}$/;

const RESERVED_REPO_NAMES = new Set([
  "agent",
  "bookmarks",
  "changes",
  "commits",
  "contributors",
  "issues",
  "labels",
  "landings",
  "milestones",
  "operations",
  "pulls",
  "settings",
  "stargazers",
  "watchers",
  "workflows",
]);

const DEFAULT_SHARD = "codeplane-repo-host-0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateRepoRequest {
  name?: string;
  description?: string;
  private?: boolean;
  default_bookmark?: string;
  topics?: string[];
}

/** Minimal actor info passed from routes. */
export interface RepoActor {
  id: number;
  username: string;
  isAdmin: boolean;
}

// ---------------------------------------------------------------------------
// Permission rank helper — matches Go's highestRepoPermission
// ---------------------------------------------------------------------------

function repoPermissionRank(perm: string): number {
  switch (perm.toLowerCase().trim()) {
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

function highestRepoPermission(...perms: string[]): string {
  let best = "";
  for (const p of perms) {
    if (repoPermissionRank(p) > repoPermissionRank(best)) {
      best = p.toLowerCase().trim();
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Unique violation helper
// ---------------------------------------------------------------------------

function isUniqueViolation(err: unknown): boolean {
  if (!err) return false;
  const msg = String(err).toLowerCase();
  return (
    msg.includes("duplicate key") ||
    msg.includes("unique") ||
    msg.includes("23505")
  );
}

// ---------------------------------------------------------------------------
// Validation — matches Go's validateRepoName / normalizeTopics
// ---------------------------------------------------------------------------

function validateRepoName(name: string): APIError | null {
  const invalidNameErr = validationFailed({
    resource: "Repository",
    field: "name",
    code: "invalid",
  });

  if (name === "") {
    return validationFailed({
      resource: "Repository",
      field: "name",
      code: "missing_field",
    });
  }
  if (name.length > 100) {
    return invalidNameErr;
  }
  if (!REPO_NAME_REGEX.test(name)) {
    return invalidNameErr;
  }
  if (name.toLowerCase().endsWith(".git")) {
    return invalidNameErr;
  }
  if (RESERVED_REPO_NAMES.has(name.toLowerCase())) {
    return invalidNameErr;
  }
  return null;
}

function normalizeTopics(
  topics: string[]
): Result<string[], APIError> {
  if (topics.length === 0) {
    return Result.ok([]);
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const topic of topics) {
    const candidate = topic.trim().toLowerCase();
    if (!REPO_TOPIC_REGEX.test(candidate)) {
      return Result.err(
        validationFailed({
          resource: "Repository",
          field: "topics",
          code: "invalid",
        })
      );
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }

  return Result.ok(normalized);
}

function normalizeDefaultBookmark(name: string): string {
  const trimmed = name.trim();
  return trimmed === "" ? "main" : trimmed;
}

// ---------------------------------------------------------------------------
// RepoService — matches Go's RepoService
// ---------------------------------------------------------------------------

export class RepoService {
  private readonly activeShard: string;

  constructor(
    private readonly sql: Sql,
    activeShard?: string
  ) {
    this.activeShard = activeShard || DEFAULT_SHARD;
  }

  // ---- Create ----

  async createRepo(
    actor: RepoActor,
    name: string,
    description: string,
    isPublic: boolean,
    defaultBookmark: string,
    _autoInit: boolean
  ): Promise<Result<RepoRow, APIError>> {
    name = name.trim();
    defaultBookmark = normalizeDefaultBookmark(defaultBookmark);

    const nameErr = validateRepoName(name);
    if (nameErr) return Result.err(nameErr);

    try {
      const repo = await createRepo(this.sql, {
        userId: String(actor.id),
        name,
        lowerName: name.toLowerCase(),
        description,
        shardId: this.activeShard,
        isPublic,
        defaultBookmark,
      });
      if (!repo) {
        return Result.err(internal("failed to create repository"));
      }
      return Result.ok(repo);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(
          conflict(`repository '${name}' already exists`)
        );
      }
      return Result.err(internal("failed to create repository"));
    }
  }

  async createOrgRepo(
    actor: RepoActor,
    orgName: string,
    name: string,
    description: string,
    isPublic: boolean,
    defaultBookmark: string,
    _autoInit: boolean
  ): Promise<Result<RepoRow, APIError>> {
    name = name.trim();
    defaultBookmark = normalizeDefaultBookmark(defaultBookmark);

    const nameErr = validateRepoName(name);
    if (nameErr) return Result.err(nameErr);

    const lowerOrg = orgName.trim().toLowerCase();
    if (lowerOrg === "") {
      return Result.err(badRequest("organization name is required"));
    }

    const org = await getOrgByLowerName(this.sql, { lowerName: lowerOrg });
    if (!org) {
      return Result.err(notFound("organization not found"));
    }

    const member = await getOrgMember(this.sql, {
      organizationId: org.id,
      userId: String(actor.id),
    });
    if (!member) {
      return Result.err(
        forbidden("insufficient organization permissions")
      );
    }
    if (member.role.trim().toLowerCase() !== "owner") {
      return Result.err(
        forbidden("insufficient organization permissions")
      );
    }

    try {
      const repo = await createOrgRepo(this.sql, {
        orgId: org.id,
        name,
        lowerName: name.toLowerCase(),
        description,
        shardId: this.activeShard,
        isPublic,
        defaultBookmark,
      });
      if (!repo) {
        return Result.err(internal("failed to create repository"));
      }
      return Result.ok(repo);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(
          conflict(`repository '${name}' already exists`)
        );
      }
      return Result.err(internal("failed to create repository"));
    }
  }

  // ---- Get ----

  async getRepo(
    viewer: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<RepoRow, APIError>> {
    return this.resolveReadableRepo(viewer, owner, repo);
  }

  // ---- Topics ----

  async getRepoTopics(
    viewer: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<string[], APIError>> {
    const repoResult = await this.resolveReadableRepo(viewer, owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;
    return Result.ok(repository.topics ?? []);
  }

  async replaceRepoTopics(
    actor: RepoActor | null,
    owner: string,
    repo: string,
    topics: string[]
  ): Promise<Result<string[], APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const topicsResult = normalizeTopics(topics);
    if (Result.isError(topicsResult)) return topicsResult;
    const normalizedTopics = topicsResult.value;

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const canAdmin = await this.canAdminRepo(repository, actor.id);
    if (Result.isError(canAdmin)) return canAdmin;
    if (!canAdmin.value) {
      return Result.err(forbidden("permission denied"));
    }

    const updated = await updateRepoTopics(this.sql, {
      id: repository.id,
      topics: normalizedTopics,
    });
    if (!updated) {
      return Result.err(internal("failed to update repository topics"));
    }

    return Result.ok(updated.topics ?? []);
  }

  // ---- Update ----

  async updateRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string,
    req: UpdateRepoRequest
  ): Promise<Result<RepoRow, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    // Validate name if provided
    if (req.name !== undefined) {
      const trimmedName = req.name.trim();
      const nameErr = validateRepoName(trimmedName);
      if (nameErr) return Result.err(nameErr);
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const canAdmin = await this.canAdminRepo(repository, actor.id);
    if (Result.isError(canAdmin)) return canAdmin;
    if (!canAdmin.value) {
      return Result.err(forbidden("permission denied"));
    }

    let name = repository.name;
    let lowerName = repository.lowerName;

    // Go rejects name changes outright (returns validation error)
    if (req.name !== undefined && req.name.trim() !== repository.name) {
      return Result.err(
        validationFailed({
          resource: "Repository",
          field: "name",
          code: "invalid",
        })
      );
    }

    let description = repository.description;
    if (req.description !== undefined) {
      description = req.description;
    }

    let isPublic = repository.isPublic;
    if (req.private !== undefined) {
      isPublic = !req.private;
    }

    let defaultBookmark = repository.defaultBookmark;
    if (req.default_bookmark !== undefined) {
      defaultBookmark = req.default_bookmark.trim();
      if (defaultBookmark === "") {
        return Result.err(
          validationFailed({
            resource: "Repository",
            field: "default_bookmark",
            code: "invalid",
          })
        );
      }
    }

    let topics = repository.topics;
    if (req.topics !== undefined) {
      topics = req.topics;
    }

    try {
      const updated = await updateRepo(this.sql, {
        id: repository.id,
        name,
        lowerName,
        description,
        isPublic,
        defaultBookmark,
        topics,
      });
      if (!updated) {
        return Result.err(internal("failed to update repository"));
      }
      return Result.ok(updated);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(conflict("repository name already exists"));
      }
      return Result.err(internal("failed to update repository"));
    }
  }

  // ---- Delete ----

  async deleteRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const canOwn = await this.canOwnRepo(repository, actor.id);
    if (Result.isError(canOwn)) return canOwn;
    if (!canOwn.value) {
      return Result.err(forbidden("permission denied"));
    }

    await deleteRepo(this.sql, { id: repository.id });
    return Result.ok(undefined);
  }

  // ---- Archive / Unarchive ----

  async archiveRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<RepoRow, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const canAdmin = await this.canAdminRepo(repository, actor.id);
    if (Result.isError(canAdmin)) return canAdmin;
    if (!canAdmin.value) {
      return Result.err(forbidden("permission denied"));
    }

    if (repository.isArchived) {
      return Result.ok(repository);
    }

    const updated = await archiveRepo(this.sql, { id: repository.id });
    if (!updated) {
      return Result.err(internal("failed to archive repository"));
    }
    return Result.ok(updated);
  }

  async unarchiveRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<RepoRow, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const canAdmin = await this.canAdminRepo(repository, actor.id);
    if (Result.isError(canAdmin)) return canAdmin;
    if (!canAdmin.value) {
      return Result.err(forbidden("permission denied"));
    }

    if (!repository.isArchived) {
      return Result.ok(repository);
    }

    const updated = await unarchiveRepo(this.sql, { id: repository.id });
    if (!updated) {
      return Result.err(internal("failed to unarchive repository"));
    }
    return Result.ok(updated);
  }

  // ---- Stars ----

  async starRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveReadableRepo(actor, owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const starred = await isRepoStarred(this.sql, {
      userId: String(actor.id),
      repositoryId: repository.id,
    });
    if (starred?.exists) {
      return Result.ok(undefined);
    }

    try {
      await starRepo(this.sql, {
        userId: String(actor.id),
        repositoryId: repository.id,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.ok(undefined);
      }
      return Result.err(internal("failed to star repository"));
    }

    await incrementRepoStars(this.sql, { id: repository.id });
    return Result.ok(undefined);
  }

  async unstarRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<void, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const repoResult = await this.resolveReadableRepo(actor, owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const starred = await isRepoStarred(this.sql, {
      userId: String(actor.id),
      repositoryId: repository.id,
    });
    if (!starred?.exists) {
      return Result.ok(undefined);
    }

    await unstarRepo(this.sql, {
      userId: String(actor.id),
      repositoryId: repository.id,
    });

    await decrementRepoStars(this.sql, { id: repository.id });
    return Result.ok(undefined);
  }

  async listRepoStargazers(
    viewer: RepoActor | null,
    owner: string,
    repo: string,
    page: number,
    perPage: number
  ): Promise<
    Result<{ users: StargazerRow[]; total: number }, APIError>
  > {
    const repoResult = await this.resolveReadableRepo(viewer, owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const p = normalizePagination(page, perPage);
    const offset = (p.page - 1) * p.perPage;

    const totalRow = await countRepoStars(this.sql, {
      repositoryId: repository.id,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const users = await listRepoStargazers(this.sql, {
      repositoryId: repository.id,
      pageSize: String(p.perPage),
      pageOffset: String(offset),
    });

    return Result.ok({ users, total });
  }

  // ---- Transfer ----

  async transferRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string,
    newOwner: string
  ): Promise<Result<RepoRow, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    newOwner = newOwner.trim();
    if (newOwner === "") {
      return Result.err(
        validationFailed({
          resource: "Repository",
          field: "new_owner",
          code: "missing_field",
        })
      );
    }

    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    const canOwn = await this.canOwnRepo(repository, actor.id);
    if (Result.isError(canOwn)) return canOwn;
    if (!canOwn.value) {
      return Result.err(forbidden("permission denied"));
    }

    const lowerNewOwner = newOwner.toLowerCase();
    const lowerCurrentOwner = owner.trim().toLowerCase();
    if (lowerNewOwner === lowerCurrentOwner) {
      return Result.err(
        validationFailed({
          resource: "Repository",
          field: "new_owner",
          code: "invalid",
        })
      );
    }

    // Try user first
    const targetUser = await getUserByLowerUsername(this.sql, {
      lowerUsername: lowerNewOwner,
    });

    if (targetUser) {
      // Check for name collision
      const dup = await getRepoByOwnerAndLowerName(this.sql, {
        owner: lowerNewOwner,
        lowerName: repository.lowerName,
      });
      if (dup) {
        return Result.err(
          conflict(
            `user '${newOwner}' already has a repository named '${repository.name}'`
          )
        );
      }

      // Clean up collaborators and team repos
      await deleteCollaboratorsByRepo(this.sql, {
        repositoryId: repository.id,
      });
      await deleteTeamReposByRepo(this.sql, {
        repositoryId: repository.id,
      });

      try {
        const updated = await transferRepoToUser(this.sql, {
          newUserId: targetUser.id,
          id: repository.id,
        });
        if (!updated) {
          return Result.err(internal("failed to transfer repository"));
        }
        return Result.ok(updated);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return Result.err(
            conflict(
              `user '${newOwner}' already has a repository named '${repository.name}'`
            )
          );
        }
        return Result.err(internal("failed to transfer repository"));
      }
    }

    // Try organization
    const targetOrg = await getOrgByLowerName(this.sql, {
      lowerName: lowerNewOwner,
    });
    if (!targetOrg) {
      return Result.err(
        notFound(`user or organization '${newOwner}' not found`)
      );
    }

    // Verify actor is owner of target org
    const member = await getOrgMember(this.sql, {
      organizationId: targetOrg.id,
      userId: String(actor.id),
    });
    if (!member) {
      return Result.err(
        forbidden("must be an owner of the target organization")
      );
    }
    if (member.role.trim().toLowerCase() !== "owner") {
      return Result.err(
        forbidden("must be an owner of the target organization")
      );
    }

    // Check name collision
    const dup = await getRepoByOwnerAndLowerName(this.sql, {
      owner: lowerNewOwner,
      lowerName: repository.lowerName,
    });
    if (dup) {
      return Result.err(
        conflict(
          `organization '${newOwner}' already has a repository named '${repository.name}'`
        )
      );
    }

    // Clean up
    await deleteCollaboratorsByRepo(this.sql, {
      repositoryId: repository.id,
    });
    await deleteTeamReposByRepo(this.sql, {
      repositoryId: repository.id,
    });

    try {
      const updated = await transferRepoToOrg(this.sql, {
        newOrgId: targetOrg.id,
        id: repository.id,
      });
      if (!updated) {
        return Result.err(internal("failed to transfer repository"));
      }
      return Result.ok(updated);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(
          conflict(
            `organization '${newOwner}' already has a repository named '${repository.name}'`
          )
        );
      }
      return Result.err(internal("failed to transfer repository"));
    }
  }

  // ---- Fork ----

  async forkRepo(
    actor: RepoActor | null,
    owner: string,
    repo: string,
    nameOverride: string,
    descriptionOverride: string
  ): Promise<Result<ForkRow, APIError>> {
    if (!actor) {
      return Result.err(unauthorized("authentication required"));
    }

    const sourceResult = await this.resolveReadableRepo(actor, owner, repo);
    if (Result.isError(sourceResult)) return sourceResult;
    const sourceRepo = sourceResult.value;

    let forkName = nameOverride.trim();
    if (forkName === "") {
      forkName = sourceRepo.name;
    }
    const nameErr = validateRepoName(forkName);
    if (nameErr) return Result.err(nameErr);

    let forkDescription = sourceRepo.description;
    if (descriptionOverride.trim() !== "") {
      forkDescription = descriptionOverride;
    }

    try {
      const forked = await createForkRepo(this.sql, {
        userId: String(actor.id),
        name: forkName,
        lowerName: forkName.toLowerCase(),
        description: forkDescription,
        shardId: this.activeShard,
        isPublic: sourceRepo.isPublic,
        defaultBookmark: sourceRepo.defaultBookmark,
        forkId: sourceRepo.id,
      });
      if (!forked) {
        return Result.err(internal("failed to create fork"));
      }

      // Increment fork count on source
      await incrementRepoForks(this.sql, { id: sourceRepo.id });

      return Result.ok(forked);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return Result.err(
          conflict(`repository '${forkName}' already exists`)
        );
      }
      return Result.err(internal("failed to create fork"));
    }
  }

  // ---- Private helpers ----

  private async resolveRepoByOwnerAndName(
    owner: string,
    repo: string
  ): Promise<Result<RepoRow, APIError>> {
    const lowerOwner = owner.trim().toLowerCase();
    const lowerRepo = repo.trim().toLowerCase();

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

  private async resolveReadableRepo(
    viewer: RepoActor | null,
    owner: string,
    repo: string
  ): Promise<Result<RepoRow, APIError>> {
    const repoResult = await this.resolveRepoByOwnerAndName(owner, repo);
    if (Result.isError(repoResult)) return repoResult;
    const repository = repoResult.value;

    if (repository.isPublic) {
      return Result.ok(repository);
    }
    if (!viewer) {
      return Result.err(forbidden("permission denied"));
    }

    const canRead = await this.canReadRepo(repository, viewer.id);
    if (Result.isError(canRead)) return canRead;
    if (!canRead.value) {
      return Result.err(forbidden("permission denied"));
    }
    return Result.ok(repository);
  }

  private async repoPermissionForUser(
    repository: RepoRow,
    userID: number
  ): Promise<
    Result<{ permission: string; isOwner: boolean }, APIError>
  > {
    // Direct user owner
    if (repository.userId && repository.userId === String(userID)) {
      return Result.ok({ permission: "", isOwner: true });
    }

    let teamPermission = "";

    // Org-owned repo
    if (repository.orgId) {
      const orgOwner = await isOrgOwnerForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userID),
      });
      if (orgOwner?.exists) {
        return Result.ok({ permission: "", isOwner: true });
      }

      const teamPerm = await getHighestTeamPermissionForRepoUser(
        this.sql,
        {
          repositoryId: repository.id,
          userId: String(userID),
        }
      );
      // The sqlc-generated row has an unnamed field from COALESCE
      if (teamPerm) {
        // Access the first value from the row object
        const values = Object.values(teamPerm);
        teamPermission = (values[0] as string) || "";
      }
    }

    const collabPerm = await getCollaboratorPermissionForRepoUser(
      this.sql,
      {
        repositoryId: repository.id,
        userId: String(userID),
      }
    );
    const collabPermission = collabPerm?.permission ?? "";

    return Result.ok({
      permission: highestRepoPermission(teamPermission, collabPermission),
      isOwner: false,
    });
  }

  private async canReadRepo(
    repository: RepoRow,
    userID: number
  ): Promise<Result<boolean, APIError>> {
    if (repository.isPublic) return Result.ok(true);

    const permResult = await this.repoPermissionForUser(
      repository,
      userID
    );
    if (Result.isError(permResult)) return permResult;
    const { permission, isOwner } = permResult.value;

    if (isOwner) return Result.ok(true);
    return Result.ok(
      permission === "read" ||
        permission === "write" ||
        permission === "admin"
    );
  }

  private async canAdminRepo(
    repository: RepoRow,
    userID: number
  ): Promise<Result<boolean, APIError>> {
    const permResult = await this.repoPermissionForUser(
      repository,
      userID
    );
    if (Result.isError(permResult)) return permResult;
    const { permission, isOwner } = permResult.value;

    if (isOwner) return Result.ok(true);
    return Result.ok(permission === "admin");
  }

  private async canOwnRepo(
    repository: RepoRow,
    userID: number
  ): Promise<Result<boolean, APIError>> {
    const permResult = await this.repoPermissionForUser(
      repository,
      userID
    );
    if (Result.isError(permResult)) return permResult;
    return Result.ok(permResult.value.isOwner);
  }
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

const USER_DEFAULT_PER_PAGE = 30;
const USER_MAX_PER_PAGE = 100;

function normalizePagination(
  page: number,
  perPage: number
): { page: number; perPage: number } {
  if (page < 1) page = 1;
  if (perPage < 1) perPage = USER_DEFAULT_PER_PAGE;
  if (perPage > USER_MAX_PER_PAGE) perPage = USER_MAX_PER_PAGE;
  return { page, perPage };
}

// ---------------------------------------------------------------------------
// Row types — inferred from sqlc generated types
// ---------------------------------------------------------------------------

/**
 * RepoRow is the shape returned by getRepoByOwnerAndLowerName.
 * We use a type alias for brevity since the full row has many fields.
 */
type RepoRow = NonNullable<
  Awaited<ReturnType<typeof getRepoByOwnerAndLowerName>>
>;

type ForkRow = NonNullable<
  Awaited<ReturnType<typeof createForkRepo>>
>;

type StargazerRow = Awaited<
  ReturnType<typeof listRepoStargazers>
>[number];
