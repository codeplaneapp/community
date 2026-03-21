import { Sql } from "postgres";

export const createDeployKeyQuery = `-- name: CreateDeployKey :one
INSERT INTO deploy_keys (repository_id, title, key_fingerprint, public_key, read_only)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, repository_id, title, key_fingerprint, public_key, read_only, created_at`;

export interface CreateDeployKeyArgs {
    repositoryId: string;
    title: string;
    keyFingerprint: string;
    publicKey: string;
    readOnly: boolean;
}

export interface CreateDeployKeyRow {
    id: string;
    repositoryId: string;
    title: string;
    keyFingerprint: string;
    publicKey: string;
    readOnly: boolean;
    createdAt: Date;
}

export async function createDeployKey(sql: Sql, args: CreateDeployKeyArgs): Promise<CreateDeployKeyRow | null> {
    const rows = await sql.unsafe(createDeployKeyQuery, [args.repositoryId, args.title, args.keyFingerprint, args.publicKey, args.readOnly]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        keyFingerprint: row[3],
        publicKey: row[4],
        readOnly: row[5],
        createdAt: row[6]
    };
}

export const listDeployKeysByRepoQuery = `-- name: ListDeployKeysByRepo :many
SELECT id, repository_id, title, key_fingerprint, public_key, read_only, created_at
FROM deploy_keys
WHERE repository_id = $1
ORDER BY created_at DESC`;

export interface ListDeployKeysByRepoArgs {
    repositoryId: string;
}

export interface ListDeployKeysByRepoRow {
    id: string;
    repositoryId: string;
    title: string;
    keyFingerprint: string;
    publicKey: string;
    readOnly: boolean;
    createdAt: Date;
}

export async function listDeployKeysByRepo(sql: Sql, args: ListDeployKeysByRepoArgs): Promise<ListDeployKeysByRepoRow[]> {
    return (await sql.unsafe(listDeployKeysByRepoQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        keyFingerprint: row[3],
        publicKey: row[4],
        readOnly: row[5],
        createdAt: row[6]
    }));
}

export const getDeployKeyByIDQuery = `-- name: GetDeployKeyByID :one
SELECT id, repository_id, title, key_fingerprint, public_key, read_only, created_at
FROM deploy_keys
WHERE id = $1`;

export interface GetDeployKeyByIDArgs {
    id: string;
}

export interface GetDeployKeyByIDRow {
    id: string;
    repositoryId: string;
    title: string;
    keyFingerprint: string;
    publicKey: string;
    readOnly: boolean;
    createdAt: Date;
}

export async function getDeployKeyByID(sql: Sql, args: GetDeployKeyByIDArgs): Promise<GetDeployKeyByIDRow | null> {
    const rows = await sql.unsafe(getDeployKeyByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        keyFingerprint: row[3],
        publicKey: row[4],
        readOnly: row[5],
        createdAt: row[6]
    };
}

export const getDeployKeyByFingerprintQuery = `-- name: GetDeployKeyByFingerprint :one
SELECT id, repository_id, title, key_fingerprint, public_key, read_only, created_at
FROM deploy_keys
WHERE repository_id = $1
  AND key_fingerprint = $2`;

export interface GetDeployKeyByFingerprintArgs {
    repositoryId: string;
    keyFingerprint: string;
}

export interface GetDeployKeyByFingerprintRow {
    id: string;
    repositoryId: string;
    title: string;
    keyFingerprint: string;
    publicKey: string;
    readOnly: boolean;
    createdAt: Date;
}

export async function getDeployKeyByFingerprint(sql: Sql, args: GetDeployKeyByFingerprintArgs): Promise<GetDeployKeyByFingerprintRow | null> {
    const rows = await sql.unsafe(getDeployKeyByFingerprintQuery, [args.repositoryId, args.keyFingerprint]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        keyFingerprint: row[3],
        publicKey: row[4],
        readOnly: row[5],
        createdAt: row[6]
    };
}

export const getAnyDeployKeyByFingerprintQuery = `-- name: GetAnyDeployKeyByFingerprint :one
SELECT id, repository_id, title, key_fingerprint, public_key, read_only, created_at
FROM deploy_keys
WHERE key_fingerprint = $1
LIMIT 1`;

export interface GetAnyDeployKeyByFingerprintArgs {
    keyFingerprint: string;
}

export interface GetAnyDeployKeyByFingerprintRow {
    id: string;
    repositoryId: string;
    title: string;
    keyFingerprint: string;
    publicKey: string;
    readOnly: boolean;
    createdAt: Date;
}

export async function getAnyDeployKeyByFingerprint(sql: Sql, args: GetAnyDeployKeyByFingerprintArgs): Promise<GetAnyDeployKeyByFingerprintRow | null> {
    const rows = await sql.unsafe(getAnyDeployKeyByFingerprintQuery, [args.keyFingerprint]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        keyFingerprint: row[3],
        publicKey: row[4],
        readOnly: row[5],
        createdAt: row[6]
    };
}

export const deleteDeployKeyQuery = `-- name: DeleteDeployKey :exec
DELETE FROM deploy_keys
WHERE id = $1`;

export interface DeleteDeployKeyArgs {
    id: string;
}

export async function deleteDeployKey(sql: Sql, args: DeleteDeployKeyArgs): Promise<void> {
    await sql.unsafe(deleteDeployKeyQuery, [args.id]);
}

