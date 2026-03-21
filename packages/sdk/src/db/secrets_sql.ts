import { Sql } from "postgres";

export const createOrUpdateSecretQuery = `-- name: CreateOrUpdateSecret :one
INSERT INTO repository_secrets (repository_id, name, value_encrypted)
VALUES ($1, $2, $3)
ON CONFLICT (repository_id, name)
DO UPDATE SET value_encrypted = EXCLUDED.value_encrypted, updated_at = NOW()
RETURNING id, repository_id, name, value_encrypted, created_at, updated_at`;

export interface CreateOrUpdateSecretArgs {
    repositoryId: string;
    name: string;
    valueEncrypted: Buffer;
}

export interface CreateOrUpdateSecretRow {
    id: string;
    repositoryId: string;
    name: string;
    valueEncrypted: Buffer;
    createdAt: Date;
    updatedAt: Date;
}

export async function createOrUpdateSecret(sql: Sql, args: CreateOrUpdateSecretArgs): Promise<CreateOrUpdateSecretRow | null> {
    const rows = await sql.unsafe(createOrUpdateSecretQuery, [args.repositoryId, args.name, args.valueEncrypted]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        valueEncrypted: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const listSecretsQuery = `-- name: ListSecrets :many
SELECT id, repository_id, name, created_at, updated_at
FROM repository_secrets
WHERE repository_id = $1
ORDER BY name`;

export interface ListSecretsArgs {
    repositoryId: string;
}

export interface ListSecretsRow {
    id: string;
    repositoryId: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listSecrets(sql: Sql, args: ListSecretsArgs): Promise<ListSecretsRow[]> {
    return (await sql.unsafe(listSecretsQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        createdAt: row[3],
        updatedAt: row[4]
    }));
}

export const listSecretValuesForRepoQuery = `-- name: ListSecretValuesForRepo :many
SELECT name, value_encrypted
FROM repository_secrets
WHERE repository_id = $1
ORDER BY name`;

export interface ListSecretValuesForRepoArgs {
    repositoryId: string;
}

export interface ListSecretValuesForRepoRow {
    name: string;
    valueEncrypted: Buffer;
}

export async function listSecretValuesForRepo(sql: Sql, args: ListSecretValuesForRepoArgs): Promise<ListSecretValuesForRepoRow[]> {
    return (await sql.unsafe(listSecretValuesForRepoQuery, [args.repositoryId]).values()).map(row => ({
        name: row[0],
        valueEncrypted: row[1]
    }));
}

export const listSecretValuesQuery = `-- name: ListSecretValues :many
SELECT name, value_encrypted
FROM repository_secrets
WHERE repository_id = $1
ORDER BY name`;

export interface ListSecretValuesArgs {
    repositoryId: string;
}

export interface ListSecretValuesRow {
    name: string;
    valueEncrypted: Buffer;
}

export async function listSecretValues(sql: Sql, args: ListSecretValuesArgs): Promise<ListSecretValuesRow[]> {
    return (await sql.unsafe(listSecretValuesQuery, [args.repositoryId]).values()).map(row => ({
        name: row[0],
        valueEncrypted: row[1]
    }));
}

export const getSecretValueByNameQuery = `-- name: GetSecretValueByName :one
SELECT value_encrypted
FROM repository_secrets
WHERE repository_id = $1
  AND name = $2`;

export interface GetSecretValueByNameArgs {
    repositoryId: string;
    name: string;
}

export interface GetSecretValueByNameRow {
    valueEncrypted: Buffer;
}

export async function getSecretValueByName(sql: Sql, args: GetSecretValueByNameArgs): Promise<GetSecretValueByNameRow | null> {
    const rows = await sql.unsafe(getSecretValueByNameQuery, [args.repositoryId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        valueEncrypted: row[0]
    };
}

export const deleteSecretQuery = `-- name: DeleteSecret :exec
DELETE FROM repository_secrets
WHERE repository_id = $1 AND name = $2`;

export interface DeleteSecretArgs {
    repositoryId: string;
    name: string;
}

export async function deleteSecret(sql: Sql, args: DeleteSecretArgs): Promise<void> {
    await sql.unsafe(deleteSecretQuery, [args.repositoryId, args.name]);
}

