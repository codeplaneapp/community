import type { Sql } from "postgres";
import { Result, TaggedError } from "better-result";

import {
  type APIError,
  internal,
  notFound,
  badRequest,
  forbidden,
  unauthorized,
  conflict,
  validationFailed,
} from "../lib/errors";
import type { AuthUser } from "../lib/context";

import {
  countWikiPagesByRepo,
  listWikiPagesByRepo,
  countSearchWikiPagesByRepo,
  searchWikiPagesByRepo,
  getWikiPageBySlug,
  createWikiPage,
  updateWikiPage,
  deleteWikiPage,
  type ListWikiPagesByRepoRow,
  type SearchWikiPagesByRepoRow,
  type GetWikiPageBySlugRow,
  type CreateWikiPageRow,
  type UpdateWikiPageRow,
} from "../db/wiki_sql";

import {
  getRepoByOwnerAndLowerName,
  isOrgOwnerForRepoUser,
  getHighestTeamPermissionForRepoUser,
  getCollaboratorPermissionForRepoUser,
  type GetRepoByOwnerAndLowerNameRow,
} from "../db/repos_sql";

// ---------------------------------------------------------------------------
// Types — matching Go's WikiPageResponse, WikiAuthorSummary, inputs
// ---------------------------------------------------------------------------

export interface WikiAuthorSummary {
  id: string;
  login: string;
}

export interface WikiPageResponse {
  id: string;
  slug: string;
  title: string;
  body?: string;
  author: WikiAuthorSummary;
  created_at: Date;
  updated_at: Date;
}

export interface ListWikiPagesInput {
  query: string;
  page: number;
  perPage: number;
}

export interface CreateWikiPageInput {
  title: string;
  slug?: string;
  body: string;
}

export interface UpdateWikiPageInput {
  title?: string;
  slug?: string;
  body?: string;
}

// ---------------------------------------------------------------------------
// Pagination — matches Go's normalizePage
// ---------------------------------------------------------------------------

const defaultPerPage = 30;
const maxPerPage = 50;

function normalizePage(
  page: number,
  perPage: number,
): { pageSize: number; pageOffset: number } {
  let resolvedPage = page;
  if (resolvedPage <= 0) resolvedPage = 1;
  let resolvedPerPage = perPage;
  if (resolvedPerPage <= 0) resolvedPerPage = defaultPerPage;
  if (resolvedPerPage > maxPerPage) resolvedPerPage = maxPerPage;
  const pageSize = resolvedPerPage;
  const pageOffset = (resolvedPage - 1) * resolvedPerPage;
  return { pageSize, pageOffset };
}

// ---------------------------------------------------------------------------
// Slug helpers — matches Go's slugifyWikiTitle / normalizeWikiSlug / normalizeWikiTitle
// ---------------------------------------------------------------------------

function slugifyWikiTitle(value: string): string {
  const lower = value.trim().toLowerCase();
  let result = "";
  let lastWasDash = false;
  for (const ch of lower) {
    if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      result += ch;
      lastWasDash = false;
    } else {
      if (!lastWasDash && result.length > 0) {
        result += "-";
        lastWasDash = true;
      }
    }
  }
  // Trim leading/trailing dashes
  return result.replace(/^-+|-+$/g, "");
}

function normalizeWikiTitle(raw: string): string {
  const title = raw.trim();
  if (title === "") {
    throw validationFailed({
      resource: "WikiPage",
      field: "title",
      code: "missing_field",
    });
  }
  return title;
}

function normalizeWikiSlug(raw: string): string {
  const slug = slugifyWikiTitle(raw.trim());
  if (slug === "") {
    throw validationFailed({
      resource: "WikiPage",
      field: "slug",
      code: "invalid",
    });
  }
  return slug;
}

// ---------------------------------------------------------------------------
// Permission helpers — matches Go's repo permission pattern
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

async function resolveRepoByOwnerAndName(
  sql: Sql,
  owner: string,
  repo: string,
): Promise<GetRepoByOwnerAndLowerNameRow> {
  const lowerOwner = owner.trim().toLowerCase();
  const lowerRepo = repo.trim().toLowerCase();
  if (lowerOwner === "") {
    throw badRequest("owner is required");
  }
  if (lowerRepo === "") {
    throw badRequest("repository name is required");
  }

  const repository = await getRepoByOwnerAndLowerName(sql, {
    owner: lowerOwner,
    lowerName: lowerRepo,
  });
  if (!repository) {
    throw notFound("repository not found");
  }
  return repository;
}

async function repoPermissionForUser(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  userId: string,
): Promise<{ permission: string; isOwner: boolean }> {
  // Repo owner is always owner
  if (repository.userId !== null && repository.userId === userId) {
    return { permission: "", isOwner: true };
  }

  let teamPermission = "";
  if (repository.orgId !== null) {
    const orgOwnerResult = await isOrgOwnerForRepoUser(sql, {
      repositoryId: repository.id,
      userId,
    });
    if (orgOwnerResult?.exists) {
      return { permission: "", isOwner: true };
    }

    const teamResult = await getHighestTeamPermissionForRepoUser(sql, {
      repositoryId: repository.id,
      userId,
    });
    // The sqlc generated type uses an empty string property name for COALESCE result
    if (teamResult) {
      teamPermission = (teamResult as any)[""] ?? "";
    }
  }

  const collabResult = await getCollaboratorPermissionForRepoUser(sql, {
    repositoryId: repository.id,
    userId,
  });
  const collabPermission = collabResult?.permission ?? "";

  return {
    permission: highestRepoPermission(teamPermission, collabPermission),
    isOwner: false,
  };
}

async function canReadRepo(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  userId: string,
): Promise<boolean> {
  if (repository.isPublic) return true;
  const { permission, isOwner } = await repoPermissionForUser(
    sql,
    repository,
    userId,
  );
  if (isOwner) return true;
  return (
    permission === "read" || permission === "write" || permission === "admin"
  );
}

async function canWriteRepo(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  userId: string,
): Promise<boolean> {
  const { permission, isOwner } = await repoPermissionForUser(
    sql,
    repository,
    userId,
  );
  if (isOwner) return true;
  return permission === "write" || permission === "admin";
}

async function requireReadAccess(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  viewer: AuthUser | undefined,
): Promise<void> {
  if (repository.isPublic) return;
  if (!viewer) {
    throw forbidden("permission denied");
  }
  const allowed = await canReadRepo(sql, repository, String(viewer.id));
  if (!allowed) {
    throw forbidden("permission denied");
  }
}

async function requireWriteAccess(
  sql: Sql,
  repository: GetRepoByOwnerAndLowerNameRow,
  actor: AuthUser | undefined,
): Promise<void> {
  if (!actor) {
    throw unauthorized("authentication required");
  }
  const allowed = await canWriteRepo(sql, repository, String(actor.id));
  if (!allowed) {
    throw forbidden("permission denied");
  }
}

// ---------------------------------------------------------------------------
// Conflict detection — matches Go's isWikiPageConflict
// ---------------------------------------------------------------------------

function isWikiPageConflict(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  return (err as any).code === "23505";
}

// ---------------------------------------------------------------------------
// Mapping helpers — matches Go's mapListedWikiPages, mapSearchedWikiPages, etc.
// ---------------------------------------------------------------------------

function mapListedWikiPages(
  rows: ListWikiPagesByRepoRow[],
): WikiPageResponse[] {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: {
      id: row.authorId,
      login: row.authorUsername,
    },
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));
}

function mapSearchedWikiPages(
  rows: SearchWikiPagesByRepoRow[],
): WikiPageResponse[] {
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: {
      id: row.authorId,
      login: row.authorUsername,
    },
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));
}

function mapWikiPage(row: GetWikiPageBySlugRow): WikiPageResponse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    author: {
      id: row.authorId,
      login: row.authorUsername,
    },
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function mapWikiPageRecord(
  page: CreateWikiPageRow | UpdateWikiPageRow,
  authorUsername: string,
): WikiPageResponse {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    body: page.body,
    author: {
      id: page.authorId,
      login: authorUsername,
    },
    created_at: page.createdAt,
    updated_at: page.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// WikiService — matches Go's WikiService 1:1
// ---------------------------------------------------------------------------

export class WikiService {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  async listWikiPages(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    input: ListWikiPagesInput,
  ): Promise<{ items: WikiPageResponse[]; total: number }> {
    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireReadAccess(this.sql, repository, viewer);

    const { pageSize, pageOffset } = normalizePage(input.page, input.perPage);
    const query = input.query.trim();

    if (query === "") {
      const countResult = await countWikiPagesByRepo(this.sql, {
        repositoryId: repository.id,
      });
      if (!countResult) {
        throw internal("failed to count wiki pages");
      }
      const total = parseInt(countResult.count, 10);

      const rows = await listWikiPagesByRepo(this.sql, {
        repositoryId: repository.id,
        limit: String(pageSize),
        offset: String(pageOffset),
      });
      return { items: mapListedWikiPages(rows), total };
    }

    const countResult = await countSearchWikiPagesByRepo(this.sql, {
      repositoryId: repository.id,
      query,
    });
    if (!countResult) {
      throw internal("failed to count wiki pages");
    }
    const total = parseInt(countResult.count, 10);

    const rows = await searchWikiPagesByRepo(this.sql, {
      repositoryId: repository.id,
      query,
      pageSize: String(pageSize),
      pageOffset: String(pageOffset),
    });
    return { items: mapSearchedWikiPages(rows), total };
  }

  async getWikiPage(
    viewer: AuthUser | undefined,
    owner: string,
    repo: string,
    slug: string,
  ): Promise<WikiPageResponse> {
    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireReadAccess(this.sql, repository, viewer);

    const normalizedSlug = normalizeWikiSlug(slug);

    const page = await getWikiPageBySlug(this.sql, {
      repositoryId: repository.id,
      slug: normalizedSlug,
    });
    if (!page) {
      throw notFound("wiki page not found");
    }
    return mapWikiPage(page);
  }

  async createWikiPage(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    input: CreateWikiPageInput,
  ): Promise<WikiPageResponse> {
    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireWriteAccess(this.sql, repository, actor);

    const title = normalizeWikiTitle(input.title);
    let slug = (input.slug ?? "").trim();
    if (slug === "") {
      slug = slugifyWikiTitle(title);
    }
    slug = normalizeWikiSlug(slug);

    let created: CreateWikiPageRow | null;
    try {
      created = await createWikiPage(this.sql, {
        repositoryId: repository.id,
        slug,
        title,
        body: input.body,
        authorId: String(actor!.id),
      });
    } catch (err) {
      if (isWikiPageConflict(err)) {
        throw conflict("wiki page already exists");
      }
      throw internal("failed to create wiki page");
    }

    if (!created) {
      throw internal("failed to create wiki page");
    }

    return mapWikiPageRecord(created, actor!.username);
  }

  async updateWikiPage(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    slug: string,
    input: UpdateWikiPageInput,
  ): Promise<WikiPageResponse> {
    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireWriteAccess(this.sql, repository, actor);

    const currentSlug = normalizeWikiSlug(slug);

    const existing = await getWikiPageBySlug(this.sql, {
      repositoryId: repository.id,
      slug: currentSlug,
    });
    if (!existing) {
      throw notFound("wiki page not found");
    }

    if (
      input.title === undefined &&
      input.slug === undefined &&
      input.body === undefined
    ) {
      throw badRequest("at least one field must be provided");
    }

    let nextTitle = existing.title;
    if (input.title !== undefined) {
      nextTitle = normalizeWikiTitle(input.title);
    }

    let nextSlug = existing.slug;
    if (input.slug !== undefined) {
      nextSlug = normalizeWikiSlug(input.slug);
    }

    let nextBody = existing.body;
    if (input.body !== undefined) {
      nextBody = input.body;
    }

    let updated: UpdateWikiPageRow | null;
    try {
      updated = await updateWikiPage(this.sql, {
        id: existing.id,
        slug: nextSlug,
        title: nextTitle,
        body: nextBody,
        authorId: String(actor!.id),
      });
    } catch (err) {
      if (isWikiPageConflict(err)) {
        throw conflict("wiki page already exists");
      }
      throw internal("failed to update wiki page");
    }

    if (!updated) {
      throw internal("failed to update wiki page");
    }

    return mapWikiPageRecord(updated, actor!.username);
  }

  async deleteWikiPage(
    actor: AuthUser | undefined,
    owner: string,
    repo: string,
    slug: string,
  ): Promise<void> {
    const repository = await resolveRepoByOwnerAndName(this.sql, owner, repo);
    await requireWriteAccess(this.sql, repository, actor);

    const normalizedSlug = normalizeWikiSlug(slug);

    const existing = await getWikiPageBySlug(this.sql, {
      repositoryId: repository.id,
      slug: normalizedSlug,
    });
    if (!existing) {
      throw notFound("wiki page not found");
    }

    await deleteWikiPage(this.sql, { id: existing.id });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWikiService(sql: Sql): WikiService {
  return new WikiService(sql);
}
