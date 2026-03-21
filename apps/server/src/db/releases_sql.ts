import { Sql } from "postgres";

export const createReleaseQuery = `-- name: CreateRelease :one
INSERT INTO releases (
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    $11
)
RETURNING
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at`;

export interface CreateReleaseArgs {
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
}

export interface CreateReleaseRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createRelease(sql: Sql, args: CreateReleaseArgs): Promise<CreateReleaseRow | null> {
    const rows = await sql.unsafe(createReleaseQuery, [args.repositoryId, args.publisherId, args.tagName, args.target, args.title, args.body, args.sha, args.isDraft, args.isPrerelease, args.isTag, args.publishedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const getReleaseByIDQuery = `-- name: GetReleaseByID :one
SELECT
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at
FROM releases
WHERE repository_id = $1
  AND id = $2`;

export interface GetReleaseByIDArgs {
    repositoryId: string;
    id: string;
}

export interface GetReleaseByIDRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getReleaseByID(sql: Sql, args: GetReleaseByIDArgs): Promise<GetReleaseByIDRow | null> {
    const rows = await sql.unsafe(getReleaseByIDQuery, [args.repositoryId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const getReleaseByTagQuery = `-- name: GetReleaseByTag :one
SELECT
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at
FROM releases
WHERE repository_id = $1
  AND tag_name = $2`;

export interface GetReleaseByTagArgs {
    repositoryId: string;
    tagName: string;
}

export interface GetReleaseByTagRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getReleaseByTag(sql: Sql, args: GetReleaseByTagArgs): Promise<GetReleaseByTagRow | null> {
    const rows = await sql.unsafe(getReleaseByTagQuery, [args.repositoryId, args.tagName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const getLatestReleaseQuery = `-- name: GetLatestRelease :one
SELECT
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at
FROM releases
WHERE repository_id = $1
  AND is_draft = FALSE
  AND is_prerelease = FALSE
ORDER BY COALESCE(published_at, created_at) DESC, id DESC
LIMIT 1`;

export interface GetLatestReleaseArgs {
    repositoryId: string;
}

export interface GetLatestReleaseRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLatestRelease(sql: Sql, args: GetLatestReleaseArgs): Promise<GetLatestReleaseRow | null> {
    const rows = await sql.unsafe(getLatestReleaseQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const listReleasesQuery = `-- name: ListReleases :many
SELECT
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at
FROM releases
WHERE repository_id = $1
  AND (NOT $2::bool OR is_draft = FALSE)
  AND (NOT $3::bool OR is_prerelease = FALSE)
ORDER BY COALESCE(published_at, created_at) DESC, id DESC
LIMIT $5 OFFSET $4`;

export interface ListReleasesArgs {
    repositoryId: string;
    excludeDrafts: boolean;
    excludePrereleases: boolean;
    pageOffset: string;
    pageSize: string;
}

export interface ListReleasesRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listReleases(sql: Sql, args: ListReleasesArgs): Promise<ListReleasesRow[]> {
    return (await sql.unsafe(listReleasesQuery, [args.repositoryId, args.excludeDrafts, args.excludePrereleases, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    }));
}

export const countReleasesByRepoQuery = `-- name: CountReleasesByRepo :one
SELECT COUNT(*)
FROM releases
WHERE repository_id = $1
  AND (NOT $2::bool OR is_draft = FALSE)
  AND (NOT $3::bool OR is_prerelease = FALSE)`;

export interface CountReleasesByRepoArgs {
    repositoryId: string;
    excludeDrafts: boolean;
    excludePrereleases: boolean;
}

export interface CountReleasesByRepoRow {
    count: string;
}

export async function countReleasesByRepo(sql: Sql, args: CountReleasesByRepoArgs): Promise<CountReleasesByRepoRow | null> {
    const rows = await sql.unsafe(countReleasesByRepoQuery, [args.repositoryId, args.excludeDrafts, args.excludePrereleases]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const updateReleaseQuery = `-- name: UpdateRelease :one
UPDATE releases
SET tag_name = $1,
    target = $2,
    title = $3,
    body = $4,
    sha = $5,
    is_draft = $6,
    is_prerelease = $7,
    is_tag = $8,
    published_at = $9,
    updated_at = NOW()
WHERE repository_id = $10
  AND id = $11
RETURNING
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at`;

export interface UpdateReleaseArgs {
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    repositoryId: string;
    id: string;
}

export interface UpdateReleaseRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateRelease(sql: Sql, args: UpdateReleaseArgs): Promise<UpdateReleaseRow | null> {
    const rows = await sql.unsafe(updateReleaseQuery, [args.tagName, args.target, args.title, args.body, args.sha, args.isDraft, args.isPrerelease, args.isTag, args.publishedAt, args.repositoryId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const deleteReleaseQuery = `-- name: DeleteRelease :one
DELETE FROM releases
WHERE repository_id = $1
  AND id = $2
RETURNING
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at`;

export interface DeleteReleaseArgs {
    repositoryId: string;
    id: string;
}

export interface DeleteReleaseRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function deleteRelease(sql: Sql, args: DeleteReleaseArgs): Promise<DeleteReleaseRow | null> {
    const rows = await sql.unsafe(deleteReleaseQuery, [args.repositoryId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const deleteReleaseByTagQuery = `-- name: DeleteReleaseByTag :one
DELETE FROM releases
WHERE repository_id = $1
  AND tag_name = $2
RETURNING
    id,
    repository_id,
    publisher_id,
    tag_name,
    target,
    title,
    body,
    sha,
    is_draft,
    is_prerelease,
    is_tag,
    published_at,
    created_at,
    updated_at`;

export interface DeleteReleaseByTagArgs {
    repositoryId: string;
    tagName: string;
}

export interface DeleteReleaseByTagRow {
    id: string;
    repositoryId: string;
    publisherId: string;
    tagName: string;
    target: string;
    title: string;
    body: string;
    sha: string;
    isDraft: boolean;
    isPrerelease: boolean;
    isTag: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function deleteReleaseByTag(sql: Sql, args: DeleteReleaseByTagArgs): Promise<DeleteReleaseByTagRow | null> {
    const rows = await sql.unsafe(deleteReleaseByTagQuery, [args.repositoryId, args.tagName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        publisherId: row[2],
        tagName: row[3],
        target: row[4],
        title: row[5],
        body: row[6],
        sha: row[7],
        isDraft: row[8],
        isPrerelease: row[9],
        isTag: row[10],
        publishedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const notifyReleaseEventQuery = `-- name: NotifyReleaseEvent :exec
SELECT pg_notify(
    'release_' || $1::bigint::text,
    $2::text
)`;

export interface NotifyReleaseEventArgs {
    repositoryId: string;
    payload: string;
}

export interface NotifyReleaseEventRow {
    pgNotify: string;
}

export async function notifyReleaseEvent(sql: Sql, args: NotifyReleaseEventArgs): Promise<void> {
    await sql.unsafe(notifyReleaseEventQuery, [args.repositoryId, args.payload]);
}

