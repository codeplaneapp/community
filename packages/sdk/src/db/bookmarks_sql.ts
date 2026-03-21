import { Sql } from "postgres";

export const upsertBookmarkQuery = `-- name: UpsertBookmark :one
INSERT INTO bookmarks (repository_id, name, target_change_id, is_default)
VALUES ($1, $2, $3, $4)
ON CONFLICT (repository_id, name)
DO UPDATE SET
    target_change_id = EXCLUDED.target_change_id,
    is_default = EXCLUDED.is_default,
    updated_at = NOW()
RETURNING id, repository_id, name, target_change_id, is_default, created_at, updated_at`;

export interface UpsertBookmarkArgs {
    repositoryId: string;
    name: string;
    targetChangeId: string;
    isDefault: boolean;
}

export interface UpsertBookmarkRow {
    id: string;
    repositoryId: string;
    name: string;
    targetChangeId: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertBookmark(sql: Sql, args: UpsertBookmarkArgs): Promise<UpsertBookmarkRow | null> {
    const rows = await sql.unsafe(upsertBookmarkQuery, [args.repositoryId, args.name, args.targetChangeId, args.isDefault]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        targetChangeId: row[3],
        isDefault: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const setDefaultBookmarkQuery = `-- name: SetDefaultBookmark :one
SELECT set_default_bookmark($1, $2)`;

export interface SetDefaultBookmarkArgs {
    repositoryId: string;
    name: string;
}

export interface SetDefaultBookmarkRow {
    setDefaultBookmark: string;
}

export async function setDefaultBookmark(sql: Sql, args: SetDefaultBookmarkArgs): Promise<SetDefaultBookmarkRow | null> {
    const rows = await sql.unsafe(setDefaultBookmarkQuery, [args.repositoryId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        setDefaultBookmark: row[0]
    };
}

export const countBookmarksByRepoQuery = `-- name: CountBookmarksByRepo :one
SELECT COUNT(*)
FROM bookmarks
WHERE repository_id = $1`;

export interface CountBookmarksByRepoArgs {
    repositoryId: string;
}

export interface CountBookmarksByRepoRow {
    count: string;
}

export async function countBookmarksByRepo(sql: Sql, args: CountBookmarksByRepoArgs): Promise<CountBookmarksByRepoRow | null> {
    const rows = await sql.unsafe(countBookmarksByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listBookmarksByRepoQuery = `-- name: ListBookmarksByRepo :many
SELECT id, repository_id, name, target_change_id, is_default, created_at, updated_at
FROM bookmarks
WHERE repository_id = $1
ORDER BY name ASC
LIMIT $3
OFFSET $2`;

export interface ListBookmarksByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListBookmarksByRepoRow {
    id: string;
    repositoryId: string;
    name: string;
    targetChangeId: string;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listBookmarksByRepo(sql: Sql, args: ListBookmarksByRepoArgs): Promise<ListBookmarksByRepoRow[]> {
    return (await sql.unsafe(listBookmarksByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        targetChangeId: row[3],
        isDefault: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const deleteBookmarkByNameQuery = `-- name: DeleteBookmarkByName :execrows
DELETE FROM bookmarks
WHERE repository_id = $1
  AND name = $2`;

export interface DeleteBookmarkByNameArgs {
    repositoryId: string;
    name: string;
}

