import { Sql } from "postgres";

export const createLFSObjectQuery = `-- name: CreateLFSObject :one
INSERT INTO lfs_objects (repository_id, oid, size, gcs_path)
VALUES ($1, $2, $3, $4)
RETURNING id, repository_id, oid, size, gcs_path, created_at`;

export interface CreateLFSObjectArgs {
    repositoryId: string;
    oid: string;
    size: string;
    gcsPath: string;
}

export interface CreateLFSObjectRow {
    id: string;
    repositoryId: string;
    oid: string;
    size: string;
    gcsPath: string;
    createdAt: Date;
}

export async function createLFSObject(sql: Sql, args: CreateLFSObjectArgs): Promise<CreateLFSObjectRow | null> {
    const rows = await sql.unsafe(createLFSObjectQuery, [args.repositoryId, args.oid, args.size, args.gcsPath]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        oid: row[2],
        size: row[3],
        gcsPath: row[4],
        createdAt: row[5]
    };
}

export const getLFSObjectByOIDQuery = `-- name: GetLFSObjectByOID :one
SELECT id, repository_id, oid, size, gcs_path, created_at
FROM lfs_objects
WHERE repository_id = $1
  AND oid = $2`;

export interface GetLFSObjectByOIDArgs {
    repositoryId: string;
    oid: string;
}

export interface GetLFSObjectByOIDRow {
    id: string;
    repositoryId: string;
    oid: string;
    size: string;
    gcsPath: string;
    createdAt: Date;
}

export async function getLFSObjectByOID(sql: Sql, args: GetLFSObjectByOIDArgs): Promise<GetLFSObjectByOIDRow | null> {
    const rows = await sql.unsafe(getLFSObjectByOIDQuery, [args.repositoryId, args.oid]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        oid: row[2],
        size: row[3],
        gcsPath: row[4],
        createdAt: row[5]
    };
}

export const listLFSObjectsQuery = `-- name: ListLFSObjects :many
SELECT id, repository_id, oid, size, gcs_path, created_at
FROM lfs_objects
WHERE repository_id = $1
ORDER BY id ASC
LIMIT $3
OFFSET $2`;

export interface ListLFSObjectsArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLFSObjectsRow {
    id: string;
    repositoryId: string;
    oid: string;
    size: string;
    gcsPath: string;
    createdAt: Date;
}

export async function listLFSObjects(sql: Sql, args: ListLFSObjectsArgs): Promise<ListLFSObjectsRow[]> {
    return (await sql.unsafe(listLFSObjectsQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        oid: row[2],
        size: row[3],
        gcsPath: row[4],
        createdAt: row[5]
    }));
}

export const countLFSObjectsQuery = `-- name: CountLFSObjects :one
SELECT COUNT(*)
FROM lfs_objects
WHERE repository_id = $1`;

export interface CountLFSObjectsArgs {
    repositoryId: string;
}

export interface CountLFSObjectsRow {
    count: string;
}

export async function countLFSObjects(sql: Sql, args: CountLFSObjectsArgs): Promise<CountLFSObjectsRow | null> {
    const rows = await sql.unsafe(countLFSObjectsQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const deleteLFSObjectQuery = `-- name: DeleteLFSObject :exec
DELETE FROM lfs_objects
WHERE repository_id = $1
  AND oid = $2`;

export interface DeleteLFSObjectArgs {
    repositoryId: string;
    oid: string;
}

export async function deleteLFSObject(sql: Sql, args: DeleteLFSObjectArgs): Promise<void> {
    await sql.unsafe(deleteLFSObjectQuery, [args.repositoryId, args.oid]);
}

export const createLFSLockQuery = `-- name: CreateLFSLock :one
INSERT INTO lfs_locks (repository_id, path, owner_id)
VALUES ($1, $2, $3)
RETURNING id, repository_id, path, owner_id, created_at`;

export interface CreateLFSLockArgs {
    repositoryId: string;
    path: string;
    ownerId: string;
}

export interface CreateLFSLockRow {
    id: string;
    repositoryId: string;
    path: string;
    ownerId: string;
    createdAt: Date;
}

export async function createLFSLock(sql: Sql, args: CreateLFSLockArgs): Promise<CreateLFSLockRow | null> {
    const rows = await sql.unsafe(createLFSLockQuery, [args.repositoryId, args.path, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        path: row[2],
        ownerId: row[3],
        createdAt: row[4]
    };
}

export const getLFSLockByPathQuery = `-- name: GetLFSLockByPath :one
SELECT id, repository_id, path, owner_id, created_at
FROM lfs_locks
WHERE repository_id = $1
  AND path = $2`;

export interface GetLFSLockByPathArgs {
    repositoryId: string;
    path: string;
}

export interface GetLFSLockByPathRow {
    id: string;
    repositoryId: string;
    path: string;
    ownerId: string;
    createdAt: Date;
}

export async function getLFSLockByPath(sql: Sql, args: GetLFSLockByPathArgs): Promise<GetLFSLockByPathRow | null> {
    const rows = await sql.unsafe(getLFSLockByPathQuery, [args.repositoryId, args.path]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        path: row[2],
        ownerId: row[3],
        createdAt: row[4]
    };
}

export const listLFSLocksQuery = `-- name: ListLFSLocks :many
SELECT id, repository_id, path, owner_id, created_at
FROM lfs_locks
WHERE repository_id = $1
ORDER BY id ASC
LIMIT $3
OFFSET $2`;

export interface ListLFSLocksArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLFSLocksRow {
    id: string;
    repositoryId: string;
    path: string;
    ownerId: string;
    createdAt: Date;
}

export async function listLFSLocks(sql: Sql, args: ListLFSLocksArgs): Promise<ListLFSLocksRow[]> {
    return (await sql.unsafe(listLFSLocksQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        path: row[2],
        ownerId: row[3],
        createdAt: row[4]
    }));
}

export const countLFSLocksQuery = `-- name: CountLFSLocks :one
SELECT COUNT(*)
FROM lfs_locks
WHERE repository_id = $1`;

export interface CountLFSLocksArgs {
    repositoryId: string;
}

export interface CountLFSLocksRow {
    count: string;
}

export async function countLFSLocks(sql: Sql, args: CountLFSLocksArgs): Promise<CountLFSLocksRow | null> {
    const rows = await sql.unsafe(countLFSLocksQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const deleteLFSLockByIDQuery = `-- name: DeleteLFSLockByID :exec
DELETE FROM lfs_locks
WHERE repository_id = $1
  AND id = $2`;

export interface DeleteLFSLockByIDArgs {
    repositoryId: string;
    id: string;
}

export async function deleteLFSLockByID(sql: Sql, args: DeleteLFSLockByIDArgs): Promise<void> {
    await sql.unsafe(deleteLFSLockByIDQuery, [args.repositoryId, args.id]);
}

export const deleteLFSLockByPathQuery = `-- name: DeleteLFSLockByPath :exec
DELETE FROM lfs_locks
WHERE repository_id = $1
  AND path = $2`;

export interface DeleteLFSLockByPathArgs {
    repositoryId: string;
    path: string;
}

export async function deleteLFSLockByPath(sql: Sql, args: DeleteLFSLockByPathArgs): Promise<void> {
    await sql.unsafe(deleteLFSLockByPathQuery, [args.repositoryId, args.path]);
}

