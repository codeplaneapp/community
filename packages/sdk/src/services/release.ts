/**
 * Release service for Codeplane Community Edition.
 *
 * Implements release CRUD, asset management with local filesystem blob storage.
 * 1:1 port of Go's internal/services/release.go.
 *
 * Omits webhook dispatching and workflow dispatching (CE does not include
 * the webhook/workflow subsystems). SSE notifications via pg_notify are kept.
 */

import type { Sql } from "postgres";

import {
  APIError,
  badRequest,
  internal,
  notFound,
  forbidden,
  unauthorized,
  conflict,
  validationFailed,
} from "../lib/errors";

import {
  type BlobStore,
  BlobNotFoundError,
  DEFAULT_SIGNED_URL_EXPIRY_MS,
} from "../lib/blob";

import {
  createRelease,
  getReleaseByID,
  getReleaseByTag,
  getLatestRelease,
  listReleases,
  countReleasesByRepo,
  updateRelease,
  deleteRelease,
  deleteReleaseByTag,
  notifyReleaseEvent,
  type CreateReleaseRow,
  type GetReleaseByIDRow,
  type GetReleaseByTagRow,
  type GetLatestReleaseRow,
  type ListReleasesRow,
  type UpdateReleaseRow,
  type DeleteReleaseRow,
  type DeleteReleaseByTagRow,
} from "../db/releases_sql";

import {
  createReleaseAsset,
  getReleaseAssetByID,
  listReleaseAssets,
  countReleaseAssets,
  updateReleaseAsset,
  confirmReleaseAssetUpload,
  incrementReleaseAssetDownloadCount,
  deleteReleaseAsset,
  type CreateReleaseAssetRow,
  type GetReleaseAssetByIDRow,
  type ListReleaseAssetsRow,
  type UpdateReleaseAssetRow,
  type ConfirmReleaseAssetUploadRow,
  type DeleteReleaseAssetRow,
} from "../db/release_assets_sql";

import {
  getRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser,
  type GetRepoByOwnerAndLowerNameRow,
} from "../db/repos_sql";

import { getUserByID } from "../db/users_sql";

import type { AuthUser } from "../lib/context";

// ---------------------------------------------------------------------------
// Constants — match Go's release constants
// ---------------------------------------------------------------------------

const DEFAULT_RELEASE_ASSET_CONTENT_TYPE = "application/octet-stream";
const MAX_RELEASE_TAG_LENGTH = 255;
const MAX_RELEASE_TITLE_LENGTH = 255;
const MAX_RELEASE_ASSET_NAME_LENGTH = 255;
const MAX_RELEASES_PER_REPO = 1000;
const MAX_ASSETS_PER_RELEASE = 50;
export const MAX_RELEASE_ASSET_UPLOAD_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GiB

const DEFAULT_PER_PAGE = 30;
const MAX_PER_PAGE = 100;

// ---------------------------------------------------------------------------
// Input/Output types — match Go's release structs
// ---------------------------------------------------------------------------

export interface CreateReleaseInput {
  tagName: string;
  target?: string;
  title?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface UpdateReleaseInput {
  tagName?: string;
  target?: string;
  title?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface ListReleasesOptions {
  page: number;
  perPage: number;
  excludeDrafts: boolean;
  excludePrereleases: boolean;
}

export interface ReleaseAssetUploadInput {
  name: string;
  size: number;
  contentType?: string;
}

export interface UpdateReleaseAssetInput {
  name: string;
}

export interface ReleaseUserSummary {
  id: number;
  login: string;
}

export interface ReleaseAssetResponse {
  id: number;
  name: string;
  size: number;
  content_type: string;
  status: string;
  download_count: number;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ReleaseResponse {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  is_tag: boolean;
  author: ReleaseUserSummary;
  assets: ReleaseAssetResponse[];
  created_at: string;
  updated_at: string;
  published_at?: string;
}

export interface ReleaseAssetUploadResult {
  asset: ReleaseAssetResponse;
  upload_url: string;
}

export interface ReleaseAssetDownloadResult {
  asset: ReleaseAssetResponse;
  download_url: string;
}

// ---------------------------------------------------------------------------
// Internal release row type (union of all query return types)
// ---------------------------------------------------------------------------

type ReleaseRow =
  | CreateReleaseRow
  | GetReleaseByIDRow
  | GetReleaseByTagRow
  | GetLatestReleaseRow
  | ListReleasesRow
  | UpdateReleaseRow
  | DeleteReleaseRow
  | DeleteReleaseByTagRow;

type AssetRow =
  | CreateReleaseAssetRow
  | GetReleaseAssetByIDRow
  | ListReleaseAssetsRow
  | UpdateReleaseAssetRow
  | ConfirmReleaseAssetUploadRow
  | DeleteReleaseAssetRow;

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

/** Validate and normalize a release tag name. */
function validateReleaseTag(raw: string): string {
  const tag = raw.trim();
  if (tag === "") {
    throw validationFailed({
      resource: "Release",
      field: "tag_name",
      code: "missing_field",
    });
  }
  if (tag.length > MAX_RELEASE_TAG_LENGTH) {
    throw validationFailed({
      resource: "Release",
      field: "tag_name",
      code: "too_long",
    });
  }
  // Check for control characters
  for (const ch of tag) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      throw validationFailed({
        resource: "Release",
        field: "tag_name",
        code: "invalid",
      });
    }
  }
  return tag;
}

/** Validate and normalize a release title. */
function validateReleaseTitle(raw: string): string {
  const title = raw.trim();
  if (title.length > MAX_RELEASE_TITLE_LENGTH) {
    throw validationFailed({
      resource: "Release",
      field: "name",
      code: "too_long",
    });
  }
  return title;
}

/** Validate and normalize a release asset name. */
function validateReleaseAssetName(raw: string): string {
  const name = raw.trim();
  if (name === "") {
    throw validationFailed({
      resource: "ReleaseAsset",
      field: "name",
      code: "missing_field",
    });
  }
  if (name.length > MAX_RELEASE_ASSET_NAME_LENGTH) {
    throw validationFailed({
      resource: "ReleaseAsset",
      field: "name",
      code: "too_long",
    });
  }
  if (name === "." || name === "..") {
    throw validationFailed({
      resource: "ReleaseAsset",
      field: "name",
      code: "invalid",
    });
  }
  for (const ch of name) {
    if (ch === "/" || ch === "\\") {
      throw validationFailed({
        resource: "ReleaseAsset",
        field: "name",
        code: "invalid",
      });
    }
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      throw validationFailed({
        resource: "ReleaseAsset",
        field: "name",
        code: "invalid",
      });
    }
  }
  return name;
}

function normalizeReleaseAssetContentType(raw?: string): string {
  const contentType = (raw ?? "").trim();
  if (contentType === "") return DEFAULT_RELEASE_ASSET_CONTENT_TYPE;
  return contentType;
}

function normalizeReleaseTarget(raw: string | undefined, defaultBookmark: string): string {
  const target = (raw ?? "").trim();
  if (target === "") return defaultBookmark.trim();
  return target;
}

function mapReleaseAsset(asset: AssetRow): ReleaseAssetResponse {
  const response: ReleaseAssetResponse = {
    id: Number(asset.id),
    name: asset.name,
    size: Number(asset.size),
    content_type: asset.contentType,
    status: asset.status,
    download_count: Number(asset.downloadCount),
    created_at:
      asset.createdAt instanceof Date
        ? asset.createdAt.toISOString()
        : String(asset.createdAt),
    updated_at:
      asset.updatedAt instanceof Date
        ? asset.updatedAt.toISOString()
        : String(asset.updatedAt),
  };
  if (asset.confirmedAt) {
    response.confirmed_at =
      asset.confirmedAt instanceof Date
        ? asset.confirmedAt.toISOString()
        : String(asset.confirmedAt);
  }
  return response;
}

// ---------------------------------------------------------------------------
// ReleaseService
// ---------------------------------------------------------------------------

export class ReleaseService {
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
  // ListReleases — matches Go's ReleaseService.ListReleases
  // -----------------------------------------------------------------------

  async listReleases(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    opts: ListReleasesOptions
  ): Promise<{ items: ReleaseResponse[]; total: number }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const { pageSize, pageOffset } = normalizePage(opts.page, opts.perPage);

    let excludeDrafts = opts.excludeDrafts;
    if (!excludeDrafts) {
      if (!viewer) {
        excludeDrafts = true;
      } else {
        const canWrite = await this.canWriteRepo(repository, viewer.id);
        if (!canWrite) {
          excludeDrafts = true;
        }
      }
    }

    const totalRow = await countReleasesByRepo(this.sql, {
      repositoryId: repository.id,
      excludeDrafts,
      excludePrereleases: opts.excludePrereleases,
    });
    const total = totalRow ? Number(totalRow.count) : 0;

    const rows = await listReleases(this.sql, {
      repositoryId: repository.id,
      excludeDrafts,
      excludePrereleases: opts.excludePrereleases,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });

    const includePendingAssets = await this.viewerCanSeeDraftAsync(repository, viewer);
    const items: ReleaseResponse[] = [];
    for (const release of rows) {
      const mapped = await this.mapRelease(release, false, includePendingAssets);
      items.push(mapped);
    }

    return { items, total };
  }

  // -----------------------------------------------------------------------
  // CreateRelease — matches Go's ReleaseService.CreateRelease
  // -----------------------------------------------------------------------

  async createRelease(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    input: CreateReleaseInput
  ): Promise<ReleaseResponse> {
    if (!actor) {
      throw unauthorized("authentication required");
    }

    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const tagName = validateReleaseTag(input.tagName);

    const totalRow = await countReleasesByRepo(this.sql, {
      repositoryId: repository.id,
      excludeDrafts: false,
      excludePrereleases: false,
    });
    const count = totalRow ? Number(totalRow.count) : 0;
    if (count >= MAX_RELEASES_PER_REPO) {
      throw badRequest("repository has reached the maximum number of releases");
    }

    const target = normalizeReleaseTarget(input.target, repository.defaultBookmark);
    const title = validateReleaseTitle(input.title ?? "");
    const isDraft = input.draft ?? false;
    const isPrerelease = input.prerelease ?? false;

    try {
      const created = await createRelease(this.sql, {
        repositoryId: repository.id,
        publisherId: String(actor.id),
        tagName,
        target,
        title,
        body: (input.body ?? "").trim(),
        sha: target, // CE: no repo-host, sha = target
        isDraft,
        isPrerelease,
        isTag: false,
        publishedAt: isDraft ? null : new Date(),
      });
      if (!created) {
        throw internal("failed to create release");
      }

      const mapped = await this.mapRelease(created, true, true);

      // SSE notification (fire and forget)
      this.notifyReleaseSSE(repository.id, mapped, isDraft ? null : "published");

      return mapped;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict("release tag already exists");
      }
      if (err instanceof APIError) throw err;
      throw internal("failed to create release");
    }
  }

  // -----------------------------------------------------------------------
  // GetRelease — matches Go's ReleaseService.GetRelease
  // -----------------------------------------------------------------------

  async getRelease(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number
  ): Promise<ReleaseResponse> {
    const { release, repository } = await this.resolveReadableRelease(
      viewer,
      owner,
      repo,
      releaseID
    );
    return this.mapRelease(
      release,
      true,
      await this.viewerCanSeeDraftAsync(repository, viewer)
    );
  }

  // -----------------------------------------------------------------------
  // GetReleaseByTag — matches Go's ReleaseService.GetReleaseByTag
  // -----------------------------------------------------------------------

  async getReleaseByTag(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    tag: string
  ): Promise<ReleaseResponse> {
    const { release, repository } = await this.resolveReadableReleaseByTag(
      viewer,
      owner,
      repo,
      tag
    );
    return this.mapRelease(
      release,
      true,
      await this.viewerCanSeeDraftAsync(repository, viewer)
    );
  }

  // -----------------------------------------------------------------------
  // GetLatestRelease — matches Go's ReleaseService.GetLatestRelease
  // -----------------------------------------------------------------------

  async getLatestRelease(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string
  ): Promise<ReleaseResponse> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const release = await getLatestRelease(this.sql, {
      repositoryId: repository.id,
    });
    if (!release) {
      throw notFound("release not found");
    }

    return this.mapRelease(
      release,
      true,
      await this.viewerCanSeeDraftAsync(repository, viewer)
    );
  }

  // -----------------------------------------------------------------------
  // UpdateRelease — matches Go's ReleaseService.UpdateRelease
  // -----------------------------------------------------------------------

  async updateRelease(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    input: UpdateReleaseInput
  ): Promise<ReleaseResponse> {
    const { release: current, repository } = await this.resolveWritableRelease(
      actor,
      owner,
      repo,
      releaseID
    );

    let nextTag = current.tagName;
    if (input.tagName !== undefined) {
      nextTag = validateReleaseTag(input.tagName);
    }

    let nextTarget = current.target;
    if (input.target !== undefined) {
      nextTarget = normalizeReleaseTarget(input.target, repository.defaultBookmark);
    }

    let nextTitle = current.title;
    if (input.title !== undefined) {
      nextTitle = validateReleaseTitle(input.title);
    }

    let nextBody = current.body;
    if (input.body !== undefined) {
      nextBody = input.body.trim();
    }

    let nextDraft = current.isDraft;
    if (input.draft !== undefined) {
      nextDraft = input.draft;
    }

    let nextPrerelease = current.isPrerelease;
    if (input.prerelease !== undefined) {
      nextPrerelease = input.prerelease;
    }

    // Compute publishedAt
    let publishedAt: Date | null = null;
    if (!nextDraft) {
      if (current.publishedAt) {
        publishedAt = current.publishedAt instanceof Date
          ? current.publishedAt
          : new Date(current.publishedAt);
      } else {
        publishedAt = new Date();
      }
    }

    try {
      const updated = await updateRelease(this.sql, {
        repositoryId: repository.id,
        id: current.id,
        tagName: nextTag,
        target: nextTarget,
        title: nextTitle,
        body: nextBody,
        sha: nextTarget, // CE: no repo-host, sha = target
        isDraft: nextDraft,
        isPrerelease: nextPrerelease,
        isTag: current.isTag,
        publishedAt,
      });
      if (!updated) {
        throw notFound("release not found");
      }

      const mapped = await this.mapRelease(updated, true, true);

      // SSE notification
      if (!nextDraft) {
        this.notifyReleaseSSE(repository.id, mapped, "updated");
      }

      return mapped;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict("release tag already exists");
      }
      if (err instanceof APIError) throw err;
      throw internal("failed to update release");
    }
  }

  // -----------------------------------------------------------------------
  // DeleteRelease — matches Go's ReleaseService.DeleteRelease
  // -----------------------------------------------------------------------

  async deleteRelease(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number
  ): Promise<void> {
    const { release: current, repository } = await this.resolveWritableRelease(
      actor,
      owner,
      repo,
      releaseID
    );

    // List assets for blob cleanup
    const assets = await listReleaseAssets(this.sql, {
      releaseId: current.id,
    });

    const deleted = await deleteRelease(this.sql, {
      repositoryId: repository.id,
      id: current.id,
    });
    if (!deleted) {
      throw notFound("release not found");
    }

    // Clean up blob storage
    for (const asset of assets) {
      try {
        await this.blobs.delete(asset.gcsKey);
      } catch {
        // Best effort cleanup
      }
    }

    // SSE notification
    if (!deleted.isDraft) {
      const mapped = await this.mapReleaseWithAssets(deleted, []);
      this.notifyReleaseSSE(repository.id, mapped, "deleted");
    }
  }

  // -----------------------------------------------------------------------
  // DeleteReleaseByTag — matches Go's ReleaseService.DeleteReleaseByTag
  // -----------------------------------------------------------------------

  async deleteReleaseByTag(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    tag: string
  ): Promise<void> {
    const tagName = validateReleaseTag(tag);

    const { release, repository } = await this.resolveWritableReleaseByTag(
      actor,
      owner,
      repo,
      tagName
    );

    // List assets for blob cleanup
    const assets = await listReleaseAssets(this.sql, {
      releaseId: release.id,
    });

    const deleted = await deleteReleaseByTag(this.sql, {
      repositoryId: repository.id,
      tagName,
    });
    if (!deleted) {
      throw notFound("release not found");
    }

    // Clean up blob storage
    for (const asset of assets) {
      try {
        await this.blobs.delete(asset.gcsKey);
      } catch {
        // Best effort cleanup
      }
    }

    // SSE notification
    if (!deleted.isDraft) {
      const mapped = await this.mapReleaseWithAssets(deleted, []);
      this.notifyReleaseSSE(repository.id, mapped, "deleted");
    }
  }

  // -----------------------------------------------------------------------
  // ListReleaseAssets — matches Go's ReleaseService.ListReleaseAssets
  // -----------------------------------------------------------------------

  async listReleaseAssets(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number
  ): Promise<ReleaseAssetResponse[]> {
    const { release, repository } = await this.resolveReadableRelease(
      viewer,
      owner,
      repo,
      releaseID
    );
    return this.listReleaseAssetsInternal(
      release.id,
      await this.viewerCanSeeDraftAsync(repository, viewer)
    );
  }

  // -----------------------------------------------------------------------
  // GetReleaseAsset — matches Go's ReleaseService.GetReleaseAsset
  // -----------------------------------------------------------------------

  async getReleaseAsset(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    assetID: number
  ): Promise<ReleaseAssetResponse> {
    const { release, repository } = await this.resolveReadableRelease(
      viewer,
      owner,
      repo,
      releaseID
    );

    const asset = await getReleaseAssetByID(this.sql, {
      releaseId: release.id,
      id: String(assetID),
    });
    if (!asset) {
      throw notFound("release asset not found");
    }
    if (
      asset.status !== "ready" &&
      !await this.viewerCanSeeDraftAsync(repository, viewer)
    ) {
      throw notFound("release asset not found");
    }
    return mapReleaseAsset(asset);
  }

  // -----------------------------------------------------------------------
  // AttachAsset — matches Go's ReleaseService.AttachAsset
  // -----------------------------------------------------------------------

  async attachAsset(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    input: ReleaseAssetUploadInput
  ): Promise<ReleaseAssetUploadResult> {
    const { release, repository } = await this.resolveWritableRelease(
      actor,
      owner,
      repo,
      releaseID
    );

    const name = validateReleaseAssetName(input.name);
    if (input.size < 0 || input.size > MAX_RELEASE_ASSET_UPLOAD_SIZE_BYTES) {
      throw validationFailed({
        resource: "ReleaseAsset",
        field: "size",
        code: "invalid",
      });
    }

    const countRow = await countReleaseAssets(this.sql, {
      releaseId: release.id,
    });
    const assetCount = countRow ? Number(countRow.count) : 0;
    if (assetCount >= MAX_ASSETS_PER_RELEASE) {
      throw badRequest("release has reached the maximum number of assets");
    }

    try {
      const asset = await createReleaseAsset(this.sql, {
        releaseId: release.id,
        uploaderId: String(actor!.id),
        name,
        size: String(input.size),
        repositoryId: repository.id,
        contentType: normalizeReleaseAssetContentType(input.contentType),
      });
      if (!asset) {
        throw internal("failed to create release asset");
      }

      const uploadURL = this.blobs.generateUploadURL(
        asset.gcsKey,
        asset.contentType,
        this.signedURLExpiryMs
      );

      return {
        asset: mapReleaseAsset(asset),
        upload_url: uploadURL,
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict("release asset already exists");
      }
      if (err instanceof APIError) throw err;
      throw internal("failed to create release asset");
    }
  }

  // -----------------------------------------------------------------------
  // ConfirmAssetUpload — matches Go's ReleaseService.ConfirmAssetUpload
  // -----------------------------------------------------------------------

  async confirmAssetUpload(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    assetID: number
  ): Promise<ReleaseAssetResponse> {
    const { release, repository } = await this.resolveWritableRelease(
      actor,
      owner,
      repo,
      releaseID
    );

    const asset = await getReleaseAssetByID(this.sql, {
      releaseId: release.id,
      id: String(assetID),
    });
    if (!asset) {
      throw notFound("release asset not found");
    }
    if (asset.status === "ready") {
      return mapReleaseAsset(asset);
    }

    // Verify the blob exists
    const exists = await this.blobs.exists(asset.gcsKey);
    if (!exists) {
      throw badRequest("release asset blob does not exist");
    }

    // Check blob size matches declared size
    try {
      const attrs = await this.blobs.stat(asset.gcsKey);
      if (attrs.size >= 0 && attrs.size !== Number(asset.size)) {
        throw badRequest("release asset blob size did not match declared size");
      }
      if (attrs.size > MAX_RELEASE_ASSET_UPLOAD_SIZE_BYTES) {
        throw badRequest("release asset blob exceeds configured size limit");
      }
    } catch (err) {
      if (err instanceof BlobNotFoundError) {
        throw badRequest("release asset blob does not exist");
      }
      if (err instanceof APIError) throw err;
      throw internal("failed to verify release asset upload");
    }

    const confirmed = await confirmReleaseAssetUpload(this.sql, {
      releaseId: release.id,
      id: String(assetID),
    });
    if (!confirmed) {
      throw notFound("release asset not found");
    }

    // SSE notification for non-draft releases
    if (!release.isDraft) {
      const mapped = await this.mapRelease(release, true, true);
      this.notifyReleaseSSE(repository.id, mapped, "updated");
    }

    return mapReleaseAsset(confirmed);
  }

  // -----------------------------------------------------------------------
  // UpdateReleaseAsset — matches Go's ReleaseService.UpdateReleaseAsset
  // -----------------------------------------------------------------------

  async updateReleaseAsset(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    assetID: number,
    input: UpdateReleaseAssetInput
  ): Promise<ReleaseAssetResponse> {
    const { release, repository } = await this.resolveWritableRelease(
      actor,
      owner,
      repo,
      releaseID
    );

    const name = validateReleaseAssetName(input.name);

    try {
      const updated = await updateReleaseAsset(this.sql, {
        releaseId: release.id,
        id: String(assetID),
        name,
      });
      if (!updated) {
        throw notFound("release asset not found");
      }

      // SSE notification for non-draft releases
      if (!release.isDraft) {
        const mapped = await this.mapRelease(release, true, true);
        this.notifyReleaseSSE(repository.id, mapped, "updated");
      }

      return mapReleaseAsset(updated);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict("release asset already exists");
      }
      if (err instanceof APIError) throw err;
      throw internal("failed to update release asset");
    }
  }

  // -----------------------------------------------------------------------
  // RemoveAsset — matches Go's ReleaseService.RemoveAsset
  // -----------------------------------------------------------------------

  async removeAsset(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    assetID: number
  ): Promise<void> {
    const { release, repository } = await this.resolveWritableRelease(
      actor,
      owner,
      repo,
      releaseID
    );

    const asset = await getReleaseAssetByID(this.sql, {
      releaseId: release.id,
      id: String(assetID),
    });
    if (!asset) {
      throw notFound("release asset not found");
    }

    // Delete blob
    try {
      await this.blobs.delete(asset.gcsKey);
    } catch {
      // Best effort
    }

    const deleted = await deleteReleaseAsset(this.sql, {
      releaseId: release.id,
      id: String(assetID),
    });
    if (!deleted) {
      throw notFound("release asset not found");
    }

    // SSE notification for non-draft releases
    if (!release.isDraft) {
      const mapped = await this.mapRelease(release, true, true);
      this.notifyReleaseSSE(repository.id, mapped, "updated");
    }
  }

  // -----------------------------------------------------------------------
  // GetReleaseAssetDownloadURL — matches Go's ReleaseService.GetReleaseAssetDownloadURL
  // -----------------------------------------------------------------------

  async getReleaseAssetDownloadURL(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number,
    assetID: number
  ): Promise<ReleaseAssetDownloadResult> {
    const { release } = await this.resolveReadableRelease(
      viewer,
      owner,
      repo,
      releaseID
    );

    const asset = await getReleaseAssetByID(this.sql, {
      releaseId: release.id,
      id: String(assetID),
    });
    if (!asset) {
      throw notFound("release asset not found");
    }
    if (asset.status !== "ready") {
      throw notFound("release asset not found");
    }

    const exists = await this.blobs.exists(asset.gcsKey);
    if (!exists) {
      throw notFound("release asset blob not found");
    }

    const downloadURL = this.blobs.generateDownloadURL(
      asset.gcsKey,
      this.signedURLExpiryMs
    );

    await incrementReleaseAssetDownloadCount(this.sql, {
      releaseId: asset.releaseId,
      id: asset.id,
    });

    return {
      asset: {
        ...mapReleaseAsset(asset),
        download_count: Number(asset.downloadCount) + 1,
      },
      download_url: downloadURL,
    };
  }

  // -----------------------------------------------------------------------
  // Private helpers — repository resolution and permissions
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

  private async resolveReadableRelease(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number
  ): Promise<{ release: ReleaseRow; repository: GetRepoByOwnerAndLowerNameRow }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const release = await getReleaseByID(this.sql, {
      repositoryId: repository.id,
      id: String(releaseID),
    });
    if (!release) {
      throw notFound("release not found");
    }
    if (release.isDraft && !await this.viewerCanSeeDraftAsync(repository, viewer)) {
      throw notFound("release not found");
    }
    return { release, repository };
  }

  private async resolveReadableReleaseByTag(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    tag: string
  ): Promise<{ release: ReleaseRow; repository: GetRepoByOwnerAndLowerNameRow }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireReadAccess(repository, viewer);

    const release = await getReleaseByTag(this.sql, {
      repositoryId: repository.id,
      tagName: tag,
    });
    if (!release) {
      throw notFound("release not found");
    }
    if (release.isDraft && !await this.viewerCanSeeDraftAsync(repository, viewer)) {
      throw notFound("release not found");
    }
    return { release, repository };
  }

  private async resolveWritableRelease(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    releaseID: number
  ): Promise<{ release: ReleaseRow; repository: GetRepoByOwnerAndLowerNameRow }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const release = await getReleaseByID(this.sql, {
      repositoryId: repository.id,
      id: String(releaseID),
    });
    if (!release) {
      throw notFound("release not found");
    }
    return { release, repository };
  }

  private async resolveWritableReleaseByTag(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    tag: string
  ): Promise<{ release: ReleaseRow; repository: GetRepoByOwnerAndLowerNameRow }> {
    const repository = await this.resolveRepoByOwnerAndName(owner, repo);
    await this.requireWriteAccess(repository, actor);

    const release = await getReleaseByTag(this.sql, {
      repositoryId: repository.id,
      tagName: tag,
    });
    if (!release) {
      throw notFound("release not found");
    }
    return { release, repository };
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

  private async viewerCanSeeDraftAsync(
    repository: GetRepoByOwnerAndLowerNameRow,
    viewer: AuthUser | undefined
  ): Promise<boolean> {
    if (!viewer) return false;
    const canWrite = await this.canWriteRepo(repository, viewer.id);
    return canWrite;
  }

  // -----------------------------------------------------------------------
  // Release mapping
  // -----------------------------------------------------------------------

  private async mapRelease(
    release: ReleaseRow,
    includeAssets: boolean,
    includePendingAssets: boolean
  ): Promise<ReleaseResponse> {
    let assets: ReleaseAssetResponse[] = [];
    if (includeAssets) {
      assets = await this.listReleaseAssetsInternal(
        release.id,
        includePendingAssets
      );
    }
    return this.mapReleaseWithAssets(release, assets);
  }

  private async mapReleaseWithAssets(
    release: ReleaseRow,
    assets: ReleaseAssetResponse[]
  ): Promise<ReleaseResponse> {
    const publisher = await getUserByID(this.sql, { id: release.publisherId });
    if (!publisher) {
      throw internal("failed to load release publisher");
    }

    const response: ReleaseResponse = {
      id: Number(release.id),
      tag_name: release.tagName,
      target_commitish: release.target,
      name: release.title,
      body: release.body,
      draft: release.isDraft,
      prerelease: release.isPrerelease,
      is_tag: release.isTag,
      author: {
        id: Number(publisher.id),
        login: publisher.username,
      },
      assets,
      created_at:
        release.createdAt instanceof Date
          ? release.createdAt.toISOString()
          : String(release.createdAt),
      updated_at:
        release.updatedAt instanceof Date
          ? release.updatedAt.toISOString()
          : String(release.updatedAt),
    };

    if (release.publishedAt) {
      response.published_at =
        release.publishedAt instanceof Date
          ? release.publishedAt.toISOString()
          : String(release.publishedAt);
    } else if (!release.isDraft) {
      response.published_at =
        release.createdAt instanceof Date
          ? release.createdAt.toISOString()
          : String(release.createdAt);
    }

    return response;
  }

  private async listReleaseAssetsInternal(
    releaseId: string,
    includePending: boolean
  ): Promise<ReleaseAssetResponse[]> {
    const rows = await listReleaseAssets(this.sql, { releaseId });
    const assets: ReleaseAssetResponse[] = [];
    for (const asset of rows) {
      if (asset.status !== "ready" && !includePending) {
        continue;
      }
      assets.push(mapReleaseAsset(asset));
    }
    return assets;
  }

  // -----------------------------------------------------------------------
  // SSE notification via pg_notify (fire and forget)
  // -----------------------------------------------------------------------

  private notifyReleaseSSE(
    repositoryId: string,
    release: ReleaseResponse,
    action: string | null
  ): void {
    if (!action) return;
    const payload = JSON.stringify({
      action,
      release_id: release.id,
      tag_name: release.tag_name,
    });
    notifyReleaseEvent(this.sql, {
      repositoryId,
      payload,
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createReleaseService(
  sql: Sql,
  blobs: BlobStore,
  signedURLExpiryMs?: number
): ReleaseService {
  return new ReleaseService(sql, blobs, signedURLExpiryMs);
}
