import { Sql } from "postgres";

export const getUserBySSHFingerprintQuery = `-- name: GetUserBySSHFingerprint :one
SELECT u.id AS user_id, u.username FROM ssh_keys k
JOIN users u ON k.user_id = u.id
WHERE k.fingerprint = $1 AND u.is_active = true AND u.prohibit_login = false`;

export interface GetUserBySSHFingerprintArgs {
    fingerprint: string;
}

export interface GetUserBySSHFingerprintRow {
    userId: string;
    username: string;
}

export async function getUserBySSHFingerprint(sql: Sql, args: GetUserBySSHFingerprintArgs): Promise<GetUserBySSHFingerprintRow | null> {
    const rows = await sql.unsafe(getUserBySSHFingerprintQuery, [args.fingerprint]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        userId: row[0],
        username: row[1]
    };
}

export const listUserSSHKeysQuery = `-- name: ListUserSSHKeys :many
SELECT id, user_id, name, public_key, fingerprint, key_type, created_at, updated_at
FROM ssh_keys
WHERE user_id = $1
ORDER BY created_at DESC`;

export interface ListUserSSHKeysArgs {
    userId: string;
}

export interface ListUserSSHKeysRow {
    id: string;
    userId: string;
    name: string;
    publicKey: string;
    fingerprint: string;
    keyType: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserSSHKeys(sql: Sql, args: ListUserSSHKeysArgs): Promise<ListUserSSHKeysRow[]> {
    return (await sql.unsafe(listUserSSHKeysQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        name: row[2],
        publicKey: row[3],
        fingerprint: row[4],
        keyType: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const createSSHKeyQuery = `-- name: CreateSSHKey :one
INSERT INTO ssh_keys (user_id, name, public_key, fingerprint, key_type)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, user_id, name, public_key, fingerprint, key_type, created_at, updated_at`;

export interface CreateSSHKeyArgs {
    userId: string;
    name: string;
    publicKey: string;
    fingerprint: string;
    keyType: string;
}

export interface CreateSSHKeyRow {
    id: string;
    userId: string;
    name: string;
    publicKey: string;
    fingerprint: string;
    keyType: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createSSHKey(sql: Sql, args: CreateSSHKeyArgs): Promise<CreateSSHKeyRow | null> {
    const rows = await sql.unsafe(createSSHKeyQuery, [args.userId, args.name, args.publicKey, args.fingerprint, args.keyType]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        name: row[2],
        publicKey: row[3],
        fingerprint: row[4],
        keyType: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteSSHKeyQuery = `-- name: DeleteSSHKey :exec
DELETE FROM ssh_keys
WHERE id = $1
  AND user_id = $2`;

export interface DeleteSSHKeyArgs {
    id: string;
    userId: string;
}

export async function deleteSSHKey(sql: Sql, args: DeleteSSHKeyArgs): Promise<void> {
    await sql.unsafe(deleteSSHKeyQuery, [args.id, args.userId]);
}

export const getSSHKeyByIDQuery = `-- name: GetSSHKeyByID :one
SELECT id, user_id, name, public_key, fingerprint, key_type, created_at, updated_at
FROM ssh_keys
WHERE id = $1`;

export interface GetSSHKeyByIDArgs {
    id: string;
}

export interface GetSSHKeyByIDRow {
    id: string;
    userId: string;
    name: string;
    publicKey: string;
    fingerprint: string;
    keyType: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getSSHKeyByID(sql: Sql, args: GetSSHKeyByIDArgs): Promise<GetSSHKeyByIDRow | null> {
    const rows = await sql.unsafe(getSSHKeyByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        name: row[2],
        publicKey: row[3],
        fingerprint: row[4],
        keyType: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getSSHKeyByFingerprintQuery = `-- name: GetSSHKeyByFingerprint :one
SELECT id, user_id, name, public_key, fingerprint, key_type, created_at, updated_at
FROM ssh_keys
WHERE fingerprint = $1`;

export interface GetSSHKeyByFingerprintArgs {
    fingerprint: string;
}

export interface GetSSHKeyByFingerprintRow {
    id: string;
    userId: string;
    name: string;
    publicKey: string;
    fingerprint: string;
    keyType: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getSSHKeyByFingerprint(sql: Sql, args: GetSSHKeyByFingerprintArgs): Promise<GetSSHKeyByFingerprintRow | null> {
    const rows = await sql.unsafe(getSSHKeyByFingerprintQuery, [args.fingerprint]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        name: row[2],
        publicKey: row[3],
        fingerprint: row[4],
        keyType: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

