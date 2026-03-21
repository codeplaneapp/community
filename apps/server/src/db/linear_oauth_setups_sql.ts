import { Sql } from "postgres";

export const createLinearOAuthSetupQuery = `-- name: CreateLinearOAuthSetup :one
INSERT INTO linear_oauth_setups (setup_key, user_id, payload_encrypted, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING setup_key, user_id, payload_encrypted, created_at, expires_at, used_at`;

export interface CreateLinearOAuthSetupArgs {
    setupKey: string;
    userId: string;
    payloadEncrypted: Buffer;
    expiresAt: Date;
}

export interface CreateLinearOAuthSetupRow {
    setupKey: string;
    userId: string;
    payloadEncrypted: Buffer;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function createLinearOAuthSetup(sql: Sql, args: CreateLinearOAuthSetupArgs): Promise<CreateLinearOAuthSetupRow | null> {
    const rows = await sql.unsafe(createLinearOAuthSetupQuery, [args.setupKey, args.userId, args.payloadEncrypted, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        setupKey: row[0],
        userId: row[1],
        payloadEncrypted: row[2],
        createdAt: row[3],
        expiresAt: row[4],
        usedAt: row[5]
    };
}

export const deleteLinearOAuthSetupsByUserQuery = `-- name: DeleteLinearOAuthSetupsByUser :exec
DELETE FROM linear_oauth_setups
WHERE user_id = $1
  AND used_at IS NULL`;

export interface DeleteLinearOAuthSetupsByUserArgs {
    userId: string;
}

export async function deleteLinearOAuthSetupsByUser(sql: Sql, args: DeleteLinearOAuthSetupsByUserArgs): Promise<void> {
    await sql.unsafe(deleteLinearOAuthSetupsByUserQuery, [args.userId]);
}

export const getLinearOAuthSetupByUserQuery = `-- name: GetLinearOAuthSetupByUser :one
SELECT setup_key, user_id, payload_encrypted, created_at, expires_at, used_at
FROM linear_oauth_setups
WHERE setup_key = $1
  AND user_id = $2
  AND used_at IS NULL
  AND expires_at > NOW()`;

export interface GetLinearOAuthSetupByUserArgs {
    setupKey: string;
    userId: string;
}

export interface GetLinearOAuthSetupByUserRow {
    setupKey: string;
    userId: string;
    payloadEncrypted: Buffer;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function getLinearOAuthSetupByUser(sql: Sql, args: GetLinearOAuthSetupByUserArgs): Promise<GetLinearOAuthSetupByUserRow | null> {
    const rows = await sql.unsafe(getLinearOAuthSetupByUserQuery, [args.setupKey, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        setupKey: row[0],
        userId: row[1],
        payloadEncrypted: row[2],
        createdAt: row[3],
        expiresAt: row[4],
        usedAt: row[5]
    };
}

export const consumeLinearOAuthSetupByUserQuery = `-- name: ConsumeLinearOAuthSetupByUser :one
WITH consumed AS (
    DELETE FROM linear_oauth_setups
    WHERE setup_key = $1
      AND user_id = $2
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING setup_key, user_id, payload_encrypted, created_at, expires_at, used_at
)
SELECT setup_key, user_id, payload_encrypted, created_at, expires_at, used_at
FROM consumed`;

export interface ConsumeLinearOAuthSetupByUserArgs {
    setupKey: string;
    userId: string;
}

export interface ConsumeLinearOAuthSetupByUserRow {
    setupKey: string;
    userId: string;
    payloadEncrypted: Buffer;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function consumeLinearOAuthSetupByUser(sql: Sql, args: ConsumeLinearOAuthSetupByUserArgs): Promise<ConsumeLinearOAuthSetupByUserRow | null> {
    const rows = await sql.unsafe(consumeLinearOAuthSetupByUserQuery, [args.setupKey, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        setupKey: row[0],
        userId: row[1],
        payloadEncrypted: row[2],
        createdAt: row[3],
        expiresAt: row[4],
        usedAt: row[5]
    };
}

export const deleteExpiredLinearOAuthSetupsQuery = `-- name: DeleteExpiredLinearOAuthSetups :exec
DELETE FROM linear_oauth_setups
WHERE expires_at < NOW()`;

export async function deleteExpiredLinearOAuthSetups(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredLinearOAuthSetupsQuery, []);
}

