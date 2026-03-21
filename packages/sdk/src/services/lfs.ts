/**
 * LFS service for Codeplane Community Edition.
 *
 * Implements LFS batch API, object storage, upload confirmation, and deletion.
 * 1:1 port of Go's internal/services/lfs.go.
 *
 * Uses local filesystem for blob storage instead of GCS.
 */

import type { Sql } from "postgres";

import {
  type APIError,
  badRequest,
  internal,
  notFound,
  forbidden,
  unauthorized,
  validationFailed,
} from "../lib/errors";

import {
  type BlobStore,
  BlobNotFoundError,
  DEFAULT_SIGNED_URL_EXPIRY_MS,
} from "../lib/blob";

import {
  createLFSObject,
  getLFSObjectByOID,
  deleteLFSObject,
  listLFSObjects,
  countLFSObjects,
  type CreateLFSObjectRow,
  type GetLFSObjectByOIDRow,
  type ListLFSObjectsRow,
} from "../db/lfs_sql";

import {
  getRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser,
  type GetRepoByOwnerAndLowerNameRow,
} from "../db/repos_sql";

import type { AuthUser } from "../lib/context";

// ---------------------------------------------------------------------------
// Types — match Go's LFS input/output structs
// ---------------------------------------------------------------------------

export interface LFSObjectInput {
  oid: string;
  size: number;
}

export interface LFSBatchInput {
  operation: string;
  objects: LFSObjectInput[];
}

export interface LFSBatchObjectResponse {
  oid: string;
  size: number;
  exists: boolean;
  upload_url?: string;
  download_url?: string;
}

export interface LFSConfirmUploadInput {
  oid: string;
  size: number;
}

export interface LFSObjectResponse {
  id: number;
  repository_id: number;
  oid: string;
  size: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePage(
  page: number,
  perPage: number
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

function validateLFSOID(raw: string): string {
  const oid = raw.trim().toLowerCase();
  if (oid.length !== 64) {
    throw validationFailed({
      resource: "LFSObject",
      field: "oid",
      code: "invalid",
    });
  }
  for (const ch of oid) {
    if (
      !(ch >= "0" && ch <= "9") &&
      !(ch >= "a" && ch <= "f")
    ) {
      throw validationFailed({
        resource: "LFSObject",
        field: "oid",
        code: "invalid",
      });
    }
  }
  return oid;
}

function validateLFSObjectInput(input: LFSObjectInput): { oid: string; size: number } {
  const oid = validateLFSOID(input.oid);
  if (input.size <= 0) {
    throw validationFailed({
      resource: "LFSObject",
      field: "size",
      code: "invalid",
    });
  }
  return { oid, size: input.size };
}

function lfsObjectKey(repositoryID: string, oid: string): string {
  return `repos/${repositoryID}/lfs/${oid}`;
}

/** Check if a Postgres error is a unique constraint violation (23505). */
function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  return (err as any).code === "23505";
}

function highestRepoPermission(...permissions: string[]): string {
  const rank = (p: string): number => {
    switch (p.toLowerCase()) {
      case "admin":
        return 4;
      case "write":
        return 3;
      case "read":
        return 2;
      default:
        return 0;
    }
  };

  let best = "";
  for (const permission of permissions) {
    if (rank(permission) > rank(best)) {
      best = permission.toLowerCase();
    }
  }
  return best;
}

function mapLFSObject(row: GetLFSObjectByOIDRow | CreateLFSObjectRow | ListLFSObjectsRow): LFSObjectResponse {
  return {
    id: Number(row.id),
    repository_id: Number(row.repositoryId),
    oid: row.oid,
    size: Number(row.size),
    created_at:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}

// ---------------------------------------------------------------------------
// LFSService
// ---------------------------------------------------------------------------

export class LFSService {
  private readonly sql: Sql;
  private readonly blobs: BlobStore;
  private readonly signedURLExpiryMs: number;

  constructor(sql: Sql, blobs: BlobStore, signedURLExpiryMs?: number) {
    this.sql = sql;
    this.blobs = blobs;
    this.signedURLExpiryMs =
      signedURLExpiryMs && signedURLExpiryMs > 0
        ? signedURLExpiryMs
        : DEFAULT_SIGNED_URL_EXPIRY_MS;
  }

  // -----------------------------------------------------------------------
  // Batch — matches Go's LFSService.Batch
  // -----------------------------------------------------------------------

  async batch(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    input: LFSBatchInput
  ): Promise<LFSBatchObjectResponse[]> {
    const op = (input.operation ?? "").trim().toLowerCase();
    if (op !== "upload" && op !== "download") {
      throw badRequest("operation must be upload or download");
    }
    if (!input.objects || input.objects.length === 0) {
      throw badRequest("objects are required");
    }
    if (op === "upload" && !actor) {
      throw unauthorized("authentication required");
    }

    // Validate all objects upfront
    for (const obj of input.objects) {
      validateLFSObjectInput(obj);
    }

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);

    if (op === "upload") {
      await this.requireWriteAccess(repository, actor);
    } else {
      await this.requireReadAccess(repository, actor);
    }

    const out: LFSBatchObjectResponse[] = [];

    for (const obj of input.objects) {
      const { oid, size } = validateLFSObjectInput(obj);

      const row = await getLFSObjectByOID(this.sql, {
        repositoryId: repository.id,
        oid,
      });

      if (!row) {
        // Object not in DB
        if (op === "download") {
          out.push({ oid, size, exists: false });
          continue;
        }
        // Upload: generate signed URL
        const key = lfsObjectKey(repository.id, oid);
        const uploadUrl = this.blobs.generateUploadURL(
          key,
          "application/octet-stream",
          this.signedURLExpiryMs
        );
        out.push({ oid, size, upload_url: uploadUrl, exists: false });
        continue;
      }

      // Object exists in DB
      const exists = await this.blobs.exists(row.gcsPath);

      if (op === "upload") {
        if (exists) {
          out.push({ oid, size: Number(row.size), exists: true });
          continue;
        }
        const uploadUrl = this.blobs.generateUploadURL(
          row.gcsPath,
          "application/octet-stream",
          this.signedURLExpiryMs
        );
        out.push({ oid, size: Number(row.size), upload_url: uploadUrl, exists: false });
        continue;
      }

      // Download
      if (!exists) {
        out.push({ oid, size: Number(row.size), exists: false });
        continue;
      }
      const downloadUrl = this.blobs.generateDownloadURL(
        row.gcsPath,
        this.signedURLExpiryMs
      );
      out.push({
        oid,
        size: Number(row.size),
        exists: true,
        download_url: downloadUrl,
      });
    }

    return out;
  }

  // -----------------------------------------------------------------------
  // ConfirmUpload — matches Go's LFSService.ConfirmUpload
  // -----------------------------------------------------------------------

  async confirmUpload(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    input: LFSConfirmUploadInput
  ): Promise<LFSObjectResponse> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const { oid, size } = validateLFSObjectInput({ oid: input.oid, size: input.size });

    const key = lfsObjectKey(repository.id, oid);
    const exists = await this.blobs.exists(key);
    if (!exists) {
      throw badRequest("blob does not exist");
    }

    try {
      const obj = await createLFSObject(this.sql, {
        repositoryId: repository.id,
        oid,
        size: String(size),
        gcsPath: key,
      });
      if (!obj) {
        throw internal("failed to persist lfs object");
      }
      return mapLFSObject(obj);
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Already exists, return existing
        const existing = await getLFSObjectByOID(this.sql, {
          repositoryId: repository.id,
          oid,
        });
        if (existing) {
          return mapLFSObject(existing);
        }
      }
      throw internal("failed to persist lfs object");
    }
  }

  // -----------------------------------------------------------------------
  // DeleteObject — matches Go's LFSService.DeleteObject
  // -----------------------------------------------------------------------

  async deleteObject(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    rawOid: string
  ): Promise<void> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const oid = validateLFSOID(rawOid);

    const obj = await getLFSObjectByOID(this.sql, {
      repositoryId: repository.id,
      oid,
    });
    if (!obj) {
      throw notFound("lfs object not found");
    }

    await this.blobs.delete(obj.gcsPath);

    await deleteLFSObject(this.sql, {
      repositoryId: repository.id,
      oid,
    });
  }

  // -----------------------------------------------------------------------
  // ListObjects — matches Go's LFSService.ListObjects
  // -----------------------------------------------------------------------

  async listObjects(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    page: number,
    perPage: number
  ): Promise<{ items: LFSObjectResponse[]; total: number }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const { pageSize, pageOffset } = normalizePage(page, perPage);

    const totalRow = await countLFSObjects(this.sql, {
      repositoryId: repository.id,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const rows = await listLFSObjects(this.sql, {
      repositoryId: repository.id,
      pageOffset: String(pageOffset),
      pageSize: String(pageSize),
    });

    const items = rows.map(mapLFSObject);
    return { items, total };
  }

  // -----------------------------------------------------------------------
  // Repository resolution and permission checks
  // -----------------------------------------------------------------------

  private async resolveRepoByOwnerAndName(
    owner: string,
    repo: string
  ): Promise<GetRepoByOwnerAndLowerNameRow> {
    const lowerOwner = owner.trim().toLowerCase();
    const lowerRepo = repo.trim().toLowerCase();
    if (lowerOwner === "") {
      throw badRequest("owner is required");
    }
    if (lowerRepo === "") {
      throw badRequest("repository name is required");
    }

    const repository = await getRepoByOwnerAndLowerName(this.sql, {
      owner: lowerOwner,
      lowerName: lowerRepo,
    });
    if (!repository) {
      throw notFound("repository not found");
    }
    return repository;
  }

  private async requireReadAccess(
    repository: GetRepoByOwnerAndLowerNameRow,
    viewer: AuthUser | undefined
  ): Promise<void> {
    if (repository.isPublic) return;
    if (!viewer) {
      throw forbidden("permission denied");
    }
    const canRead = await this.canReadRepo(repository, viewer.id);
    if (!canRead) {
      throw forbidden("permission denied");
    }
  }

  private async requireWriteAccess(
    repository: GetRepoByOwnerAndLowerNameRow,
    actor: AuthUser | undefined
  ): Promise<void> {
    if (!actor) {
      throw unauthorized("authentication required");
    }
    const canWrite = await this.canWriteRepo(repository, actor.id);
    if (!canWrite) {
      throw forbidden("permission denied");
    }
  }

  private async repoPermissionForUser(
    repository: GetRepoByOwnerAndLowerNameRow,
    userID: number
  ): Promise<{ permission: string; isOwner: boolean }> {
    if (repository.userId !== null && repository.userId === String(userID)) {
      return { permission: "", isOwner: true };
    }

    let teamPermission = "";
    if (repository.orgId !== null) {
      const orgOwnerRow = await isOrgOwnerForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userID),
      });
      if (orgOwnerRow?.exists) {
        return { permission: "", isOwner: true };
      }

      const teamRow = await getHighestTeamPermissionForRepoUser(this.sql, {
        repositoryId: repository.id,
        userId: String(userID),
      });
      // The generated row type has an empty-string key from the COALESCE expression
      const teamPerm = teamRow ? (Object.values(teamRow)[0] as string) : "";
      if (teamPerm) {
        teamPermission = teamPerm;
      }
    }

    const collabRow = await getCollaboratorPermissionForRepoUser(this.sql, {
      repositoryId: repository.id,
      userId: String(userID),
    });
    const collabPermission = collabRow?.permission ?? "";

    return {
      permission: highestRepoPermission(teamPermission, collabPermission),
      isOwner: false,
    };
  }

  private async canReadRepo(
    repository: GetRepoByOwnerAndLowerNameRow,
    userID: number
  ): Promise<boolean> {
    if (repository.isPublic) return true;
    const { permission, isOwner } = await this.repoPermissionForUser(
      repository,
      userID
    );
    if (isOwner) return true;
    return (
      permission === "read" ||
      permission === "write" ||
      permission === "admin"
    );
  }

  private async canWriteRepo(
    repository: GetRepoByOwnerAndLowerNameRow,
    userID: number
  ): Promise<boolean> {
    const { permission, isOwner } = await this.repoPermissionForUser(
      repository,
      userID
    );
    if (isOwner) return true;
    return permission === "write" || permission === "admin";
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLFSService(
  sql: Sql,
  blobs: BlobStore,
  signedURLExpiryMs?: number
): LFSService {
  return new LFSService(sql, blobs, signedURLExpiryMs);
}
