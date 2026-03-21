import { Sql } from "postgres";

export const createSandboxAccessTokenQuery = `-- name: CreateSandboxAccessToken :one

INSERT INTO sandbox_access_tokens (
    workspace_id,
    vm_id,
    user_id,
    linux_user,
    token_hash,
    token_type,
    expires_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, workspace_id, vm_id, user_id, linux_user, token_hash, token_type, expires_at, used_at, created_at`;

export interface CreateSandboxAccessTokenArgs {
    workspaceId: string | null;
    vmId: string;
    userId: string;
    linuxUser: string;
    tokenHash: Buffer;
    tokenType: string;
    expiresAt: Date;
}

export interface CreateSandboxAccessTokenRow {
    id: string;
    workspaceId: string | null;
    vmId: string;
    userId: string;
    linuxUser: string;
    tokenHash: Buffer;
    tokenType: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
}

export async function createSandboxAccessToken(sql: Sql, args: CreateSandboxAccessTokenArgs): Promise<CreateSandboxAccessTokenRow | null> {
    const rows = await sql.unsafe(createSandboxAccessTokenQuery, [args.workspaceId, args.vmId, args.userId, args.linuxUser, args.tokenHash, args.tokenType, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        vmId: row[2],
        userId: row[3],
        linuxUser: row[4],
        tokenHash: row[5],
        tokenType: row[6],
        expiresAt: row[7],
        usedAt: row[8],
        createdAt: row[9]
    };
}

export const getSandboxAccessTokenByHashQuery = `-- name: GetSandboxAccessTokenByHash :one
SELECT id, workspace_id, vm_id, user_id, linux_user, token_hash, token_type, expires_at, used_at, created_at
FROM sandbox_access_tokens
WHERE token_hash = $1
  AND used_at IS NULL
  AND expires_at > NOW()`;

export interface GetSandboxAccessTokenByHashArgs {
    tokenHash: Buffer;
}

export interface GetSandboxAccessTokenByHashRow {
    id: string;
    workspaceId: string | null;
    vmId: string;
    userId: string;
    linuxUser: string;
    tokenHash: Buffer;
    tokenType: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
}

export async function getSandboxAccessTokenByHash(sql: Sql, args: GetSandboxAccessTokenByHashArgs): Promise<GetSandboxAccessTokenByHashRow | null> {
    const rows = await sql.unsafe(getSandboxAccessTokenByHashQuery, [args.tokenHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        vmId: row[2],
        userId: row[3],
        linuxUser: row[4],
        tokenHash: row[5],
        tokenType: row[6],
        expiresAt: row[7],
        usedAt: row[8],
        createdAt: row[9]
    };
}

export const markSandboxAccessTokenUsedQuery = `-- name: MarkSandboxAccessTokenUsed :exec
UPDATE sandbox_access_tokens
SET used_at = NOW()
WHERE id = $1
  AND used_at IS NULL`;

export interface MarkSandboxAccessTokenUsedArgs {
    id: string;
}

export async function markSandboxAccessTokenUsed(sql: Sql, args: MarkSandboxAccessTokenUsedArgs): Promise<void> {
    await sql.unsafe(markSandboxAccessTokenUsedQuery, [args.id]);
}

export const deleteExpiredSandboxAccessTokensQuery = `-- name: DeleteExpiredSandboxAccessTokens :exec
DELETE FROM sandbox_access_tokens
WHERE expires_at < NOW()`;

export async function deleteExpiredSandboxAccessTokens(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredSandboxAccessTokensQuery, []);
}

