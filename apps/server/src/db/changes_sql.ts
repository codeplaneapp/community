import { Sql } from "postgres";

export const upsertChangeQuery = `-- name: UpsertChange :one
INSERT INTO changes (
    repository_id,
    change_id,
    commit_id,
    description,
    author_name,
    author_email,
    has_conflict,
    is_empty,
    parent_change_ids
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (repository_id, change_id)
DO UPDATE SET
    commit_id = EXCLUDED.commit_id,
    description = EXCLUDED.description,
    author_name = EXCLUDED.author_name,
    author_email = EXCLUDED.author_email,
    has_conflict = EXCLUDED.has_conflict,
    is_empty = EXCLUDED.is_empty,
    parent_change_ids = EXCLUDED.parent_change_ids,
    updated_at = NOW()
RETURNING id, repository_id, change_id, commit_id, description, author_name, author_email, has_conflict, is_empty, parent_change_ids, created_at, updated_at`;

export interface UpsertChangeArgs {
    repositoryId: string;
    changeId: string;
    commitId: string;
    description: string;
    authorName: string;
    authorEmail: string;
    hasConflict: boolean;
    isEmpty: boolean;
    parentChangeIds: any;
}

export interface UpsertChangeRow {
    id: string;
    repositoryId: string;
    changeId: string;
    commitId: string;
    description: string;
    authorName: string;
    authorEmail: string;
    hasConflict: boolean;
    isEmpty: boolean;
    parentChangeIds: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertChange(sql: Sql, args: UpsertChangeArgs): Promise<UpsertChangeRow | null> {
    const rows = await sql.unsafe(upsertChangeQuery, [args.repositoryId, args.changeId, args.commitId, args.description, args.authorName, args.authorEmail, args.hasConflict, args.isEmpty, args.parentChangeIds]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitId: row[3],
        description: row[4],
        authorName: row[5],
        authorEmail: row[6],
        hasConflict: row[7],
        isEmpty: row[8],
        parentChangeIds: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const getChangeByChangeIDQuery = `-- name: GetChangeByChangeID :one
SELECT id, repository_id, change_id, commit_id, description, author_name, author_email, has_conflict, is_empty, parent_change_ids, created_at, updated_at
FROM changes
WHERE repository_id = $1
  AND change_id = $2`;

export interface GetChangeByChangeIDArgs {
    repositoryId: string;
    changeId: string;
}

export interface GetChangeByChangeIDRow {
    id: string;
    repositoryId: string;
    changeId: string;
    commitId: string;
    description: string;
    authorName: string;
    authorEmail: string;
    hasConflict: boolean;
    isEmpty: boolean;
    parentChangeIds: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function getChangeByChangeID(sql: Sql, args: GetChangeByChangeIDArgs): Promise<GetChangeByChangeIDRow | null> {
    const rows = await sql.unsafe(getChangeByChangeIDQuery, [args.repositoryId, args.changeId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitId: row[3],
        description: row[4],
        authorName: row[5],
        authorEmail: row[6],
        hasConflict: row[7],
        isEmpty: row[8],
        parentChangeIds: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const countChangesByRepoQuery = `-- name: CountChangesByRepo :one
SELECT COUNT(*)
FROM changes
WHERE repository_id = $1`;

export interface CountChangesByRepoArgs {
    repositoryId: string;
}

export interface CountChangesByRepoRow {
    count: string;
}

export async function countChangesByRepo(sql: Sql, args: CountChangesByRepoArgs): Promise<CountChangesByRepoRow | null> {
    const rows = await sql.unsafe(countChangesByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listChangesByRepoQuery = `-- name: ListChangesByRepo :many
SELECT id, repository_id, change_id, commit_id, description, author_name, author_email, has_conflict, is_empty, parent_change_ids, created_at, updated_at
FROM changes
WHERE repository_id = $1
ORDER BY id DESC
LIMIT $3
OFFSET $2`;

export interface ListChangesByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListChangesByRepoRow {
    id: string;
    repositoryId: string;
    changeId: string;
    commitId: string;
    description: string;
    authorName: string;
    authorEmail: string;
    hasConflict: boolean;
    isEmpty: boolean;
    parentChangeIds: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function listChangesByRepo(sql: Sql, args: ListChangesByRepoArgs): Promise<ListChangesByRepoRow[]> {
    return (await sql.unsafe(listChangesByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitId: row[3],
        description: row[4],
        authorName: row[5],
        authorEmail: row[6],
        hasConflict: row[7],
        isEmpty: row[8],
        parentChangeIds: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const deleteChangesByRepoQuery = `-- name: DeleteChangesByRepo :execrows
DELETE FROM changes
WHERE repository_id = $1`;

export interface DeleteChangesByRepoArgs {
    repositoryId: string;
}

