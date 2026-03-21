import { Sql } from "postgres";

export const countWikiPagesByRepoQuery = `-- name: CountWikiPagesByRepo :one
SELECT COUNT(*)
FROM wiki_pages
WHERE repository_id = $1`;

export interface CountWikiPagesByRepoArgs {
    repositoryId: string;
}

export interface CountWikiPagesByRepoRow {
    count: string;
}

export async function countWikiPagesByRepo(sql: Sql, args: CountWikiPagesByRepoArgs): Promise<CountWikiPagesByRepoRow | null> {
    const rows = await sql.unsafe(countWikiPagesByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listWikiPagesByRepoQuery = `-- name: ListWikiPagesByRepo :many
SELECT
    wp.id,
    wp.repository_id,
    wp.slug,
    wp.title,
    wp.body,
    wp.author_id,
    wp.created_at,
    wp.updated_at,
    u.username AS author_username
FROM wiki_pages wp
JOIN users u ON u.id = wp.author_id
WHERE wp.repository_id = $1
ORDER BY wp.updated_at DESC, wp.id DESC
LIMIT $2 OFFSET $3`;

export interface ListWikiPagesByRepoArgs {
    repositoryId: string;
    limit: string;
    offset: string;
}

export interface ListWikiPagesByRepoRow {
    id: string;
    repositoryId: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    authorUsername: string;
}

export async function listWikiPagesByRepo(sql: Sql, args: ListWikiPagesByRepoArgs): Promise<ListWikiPagesByRepoRow[]> {
    return (await sql.unsafe(listWikiPagesByRepoQuery, [args.repositoryId, args.limit, args.offset]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        slug: row[2],
        title: row[3],
        body: row[4],
        authorId: row[5],
        createdAt: row[6],
        updatedAt: row[7],
        authorUsername: row[8]
    }));
}

export const countSearchWikiPagesByRepoQuery = `-- name: CountSearchWikiPagesByRepo :one
SELECT COUNT(*)
FROM wiki_pages
WHERE repository_id = $1
  AND (
    title ILIKE '%' || $2::text || '%'
    OR slug ILIKE '%' || $2::text || '%'
    OR body ILIKE '%' || $2::text || '%'
  )`;

export interface CountSearchWikiPagesByRepoArgs {
    repositoryId: string;
    query: string;
}

export interface CountSearchWikiPagesByRepoRow {
    count: string;
}

export async function countSearchWikiPagesByRepo(sql: Sql, args: CountSearchWikiPagesByRepoArgs): Promise<CountSearchWikiPagesByRepoRow | null> {
    const rows = await sql.unsafe(countSearchWikiPagesByRepoQuery, [args.repositoryId, args.query]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const searchWikiPagesByRepoQuery = `-- name: SearchWikiPagesByRepo :many
SELECT
    wp.id,
    wp.repository_id,
    wp.slug,
    wp.title,
    wp.body,
    wp.author_id,
    wp.created_at,
    wp.updated_at,
    u.username AS author_username
FROM wiki_pages wp
JOIN users u ON u.id = wp.author_id
WHERE wp.repository_id = $1
  AND (
    wp.title ILIKE '%' || $2::text || '%'
    OR wp.slug ILIKE '%' || $2::text || '%'
    OR wp.body ILIKE '%' || $2::text || '%'
  )
ORDER BY
    CASE
        WHEN lower(wp.slug) = lower($2::text) THEN 0
        WHEN lower(wp.title) = lower($2::text) THEN 1
        WHEN lower(wp.title) LIKE lower($2::text) || '%' THEN 2
        WHEN lower(wp.slug) LIKE lower($2::text) || '%' THEN 3
        ELSE 4
    END,
    wp.updated_at DESC,
    wp.id DESC
LIMIT $4 OFFSET $3`;

export interface SearchWikiPagesByRepoArgs {
    repositoryId: string;
    query: string;
    pageOffset: string;
    pageSize: string;
}

export interface SearchWikiPagesByRepoRow {
    id: string;
    repositoryId: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    authorUsername: string;
}

export async function searchWikiPagesByRepo(sql: Sql, args: SearchWikiPagesByRepoArgs): Promise<SearchWikiPagesByRepoRow[]> {
    return (await sql.unsafe(searchWikiPagesByRepoQuery, [args.repositoryId, args.query, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        slug: row[2],
        title: row[3],
        body: row[4],
        authorId: row[5],
        createdAt: row[6],
        updatedAt: row[7],
        authorUsername: row[8]
    }));
}

export const getWikiPageBySlugQuery = `-- name: GetWikiPageBySlug :one
SELECT
    wp.id,
    wp.repository_id,
    wp.slug,
    wp.title,
    wp.body,
    wp.author_id,
    wp.created_at,
    wp.updated_at,
    u.username AS author_username
FROM wiki_pages wp
JOIN users u ON u.id = wp.author_id
WHERE wp.repository_id = $1 AND wp.slug = $2`;

export interface GetWikiPageBySlugArgs {
    repositoryId: string;
    slug: string;
}

export interface GetWikiPageBySlugRow {
    id: string;
    repositoryId: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
    authorUsername: string;
}

export async function getWikiPageBySlug(sql: Sql, args: GetWikiPageBySlugArgs): Promise<GetWikiPageBySlugRow | null> {
    const rows = await sql.unsafe(getWikiPageBySlugQuery, [args.repositoryId, args.slug]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        slug: row[2],
        title: row[3],
        body: row[4],
        authorId: row[5],
        createdAt: row[6],
        updatedAt: row[7],
        authorUsername: row[8]
    };
}

export const createWikiPageQuery = `-- name: CreateWikiPage :one
INSERT INTO wiki_pages (repository_id, slug, title, body, author_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, repository_id, slug, title, body, author_id, created_at, updated_at`;

export interface CreateWikiPageArgs {
    repositoryId: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
}

export interface CreateWikiPageRow {
    id: string;
    repositoryId: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWikiPage(sql: Sql, args: CreateWikiPageArgs): Promise<CreateWikiPageRow | null> {
    const rows = await sql.unsafe(createWikiPageQuery, [args.repositoryId, args.slug, args.title, args.body, args.authorId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        slug: row[2],
        title: row[3],
        body: row[4],
        authorId: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const updateWikiPageQuery = `-- name: UpdateWikiPage :one
UPDATE wiki_pages
SET slug = $2,
    title = $3,
    body = $4,
    author_id = $5,
    updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, slug, title, body, author_id, created_at, updated_at`;

export interface UpdateWikiPageArgs {
    id: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
}

export interface UpdateWikiPageRow {
    id: string;
    repositoryId: string;
    slug: string;
    title: string;
    body: string;
    authorId: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateWikiPage(sql: Sql, args: UpdateWikiPageArgs): Promise<UpdateWikiPageRow | null> {
    const rows = await sql.unsafe(updateWikiPageQuery, [args.id, args.slug, args.title, args.body, args.authorId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        slug: row[2],
        title: row[3],
        body: row[4],
        authorId: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteWikiPageQuery = `-- name: DeleteWikiPage :exec
DELETE FROM wiki_pages
WHERE id = $1`;

export interface DeleteWikiPageArgs {
    id: string;
}

export async function deleteWikiPage(sql: Sql, args: DeleteWikiPageArgs): Promise<void> {
    await sql.unsafe(deleteWikiPageQuery, [args.id]);
}

