import { Sql } from "postgres";

export const createJjOperationQuery = `-- name: CreateJjOperation :one
INSERT INTO jj_operations (
    repository_id,
    operation_id,
    operation_type,
    description,
    user_id,
    parent_operation_id
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, repository_id, operation_id, operation_type, description, user_id, parent_operation_id, created_at`;

export interface CreateJjOperationArgs {
    repositoryId: string;
    operationId: string;
    operationType: string;
    description: string;
    userId: string;
    parentOperationId: string;
}

export interface CreateJjOperationRow {
    id: string;
    repositoryId: string;
    operationId: string;
    operationType: string;
    description: string;
    userId: string;
    parentOperationId: string;
    createdAt: Date;
}

export async function createJjOperation(sql: Sql, args: CreateJjOperationArgs): Promise<CreateJjOperationRow | null> {
    const rows = await sql.unsafe(createJjOperationQuery, [args.repositoryId, args.operationId, args.operationType, args.description, args.userId, args.parentOperationId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        operationId: row[2],
        operationType: row[3],
        description: row[4],
        userId: row[5],
        parentOperationId: row[6],
        createdAt: row[7]
    };
}

export const getJjOperationByOperationIDQuery = `-- name: GetJjOperationByOperationID :one
SELECT id, repository_id, operation_id, operation_type, description, user_id, parent_operation_id, created_at
FROM jj_operations
WHERE repository_id = $1
  AND operation_id = $2`;

export interface GetJjOperationByOperationIDArgs {
    repositoryId: string;
    operationId: string;
}

export interface GetJjOperationByOperationIDRow {
    id: string;
    repositoryId: string;
    operationId: string;
    operationType: string;
    description: string;
    userId: string;
    parentOperationId: string;
    createdAt: Date;
}

export async function getJjOperationByOperationID(sql: Sql, args: GetJjOperationByOperationIDArgs): Promise<GetJjOperationByOperationIDRow | null> {
    const rows = await sql.unsafe(getJjOperationByOperationIDQuery, [args.repositoryId, args.operationId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        operationId: row[2],
        operationType: row[3],
        description: row[4],
        userId: row[5],
        parentOperationId: row[6],
        createdAt: row[7]
    };
}

export const countJjOperationsByRepoQuery = `-- name: CountJjOperationsByRepo :one
SELECT COUNT(*)
FROM jj_operations
WHERE repository_id = $1`;

export interface CountJjOperationsByRepoArgs {
    repositoryId: string;
}

export interface CountJjOperationsByRepoRow {
    count: string;
}

export async function countJjOperationsByRepo(sql: Sql, args: CountJjOperationsByRepoArgs): Promise<CountJjOperationsByRepoRow | null> {
    const rows = await sql.unsafe(countJjOperationsByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listJjOperationsByRepoQuery = `-- name: ListJjOperationsByRepo :many
SELECT id, repository_id, operation_id, operation_type, description, user_id, parent_operation_id, created_at
FROM jj_operations
WHERE repository_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $3
OFFSET $2`;

export interface ListJjOperationsByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListJjOperationsByRepoRow {
    id: string;
    repositoryId: string;
    operationId: string;
    operationType: string;
    description: string;
    userId: string;
    parentOperationId: string;
    createdAt: Date;
}

export async function listJjOperationsByRepo(sql: Sql, args: ListJjOperationsByRepoArgs): Promise<ListJjOperationsByRepoRow[]> {
    return (await sql.unsafe(listJjOperationsByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        operationId: row[2],
        operationType: row[3],
        description: row[4],
        userId: row[5],
        parentOperationId: row[6],
        createdAt: row[7]
    }));
}

