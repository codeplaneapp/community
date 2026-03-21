import { Sql } from "postgres";

export const createOrUpdateVariableQuery = `-- name: CreateOrUpdateVariable :one
INSERT INTO repository_variables (repository_id, name, value)
VALUES ($1, $2, $3)
ON CONFLICT (repository_id, name)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
RETURNING id, repository_id, name, value, created_at, updated_at`;

export interface CreateOrUpdateVariableArgs {
    repositoryId: string;
    name: string;
    value: string;
}

export interface CreateOrUpdateVariableRow {
    id: string;
    repositoryId: string;
    name: string;
    value: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createOrUpdateVariable(sql: Sql, args: CreateOrUpdateVariableArgs): Promise<CreateOrUpdateVariableRow | null> {
    const rows = await sql.unsafe(createOrUpdateVariableQuery, [args.repositoryId, args.name, args.value]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        value: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const getVariableByNameQuery = `-- name: GetVariableByName :one
SELECT id, repository_id, name, value, created_at, updated_at FROM repository_variables
WHERE repository_id = $1 AND name = $2`;

export interface GetVariableByNameArgs {
    repositoryId: string;
    name: string;
}

export interface GetVariableByNameRow {
    id: string;
    repositoryId: string;
    name: string;
    value: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getVariableByName(sql: Sql, args: GetVariableByNameArgs): Promise<GetVariableByNameRow | null> {
    const rows = await sql.unsafe(getVariableByNameQuery, [args.repositoryId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        value: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const listVariablesQuery = `-- name: ListVariables :many
SELECT id, repository_id, name, value, created_at, updated_at FROM repository_variables
WHERE repository_id = $1
ORDER BY name`;

export interface ListVariablesArgs {
    repositoryId: string;
}

export interface ListVariablesRow {
    id: string;
    repositoryId: string;
    name: string;
    value: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listVariables(sql: Sql, args: ListVariablesArgs): Promise<ListVariablesRow[]> {
    return (await sql.unsafe(listVariablesQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        value: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    }));
}

export const deleteVariableQuery = `-- name: DeleteVariable :exec
DELETE FROM repository_variables
WHERE repository_id = $1 AND name = $2`;

export interface DeleteVariableArgs {
    repositoryId: string;
    name: string;
}

export async function deleteVariable(sql: Sql, args: DeleteVariableArgs): Promise<void> {
    await sql.unsafe(deleteVariableQuery, [args.repositoryId, args.name]);
}

