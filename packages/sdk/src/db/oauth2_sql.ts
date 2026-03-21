import { Sql } from "postgres";

export const createOAuth2ApplicationQuery = `-- name: CreateOAuth2Application :one
INSERT INTO oauth2_applications (
    client_id,
    client_secret_hash,
    name,
    redirect_uris,
    scopes,
    owner_id,
    confidential
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7
)
RETURNING id, client_id, client_secret_hash, name, redirect_uris, scopes, owner_id, confidential, created_at, updated_at`;

export interface CreateOAuth2ApplicationArgs {
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    ownerId: string;
    confidential: boolean;
}

export interface CreateOAuth2ApplicationRow {
    id: string;
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    ownerId: string;
    confidential: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function createOAuth2Application(sql: Sql, args: CreateOAuth2ApplicationArgs): Promise<CreateOAuth2ApplicationRow | null> {
    const rows = await sql.unsafe(createOAuth2ApplicationQuery, [args.clientId, args.clientSecretHash, args.name, args.redirectUris, args.scopes, args.ownerId, args.confidential]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        clientId: row[1],
        clientSecretHash: row[2],
        name: row[3],
        redirectUris: row[4],
        scopes: row[5],
        ownerId: row[6],
        confidential: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const getOAuth2ApplicationByIDQuery = `-- name: GetOAuth2ApplicationByID :one
SELECT id, client_id, client_secret_hash, name, redirect_uris, scopes, owner_id, confidential, created_at, updated_at
FROM oauth2_applications
WHERE id = $1`;

export interface GetOAuth2ApplicationByIDArgs {
    id: string;
}

export interface GetOAuth2ApplicationByIDRow {
    id: string;
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    ownerId: string;
    confidential: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOAuth2ApplicationByID(sql: Sql, args: GetOAuth2ApplicationByIDArgs): Promise<GetOAuth2ApplicationByIDRow | null> {
    const rows = await sql.unsafe(getOAuth2ApplicationByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        clientId: row[1],
        clientSecretHash: row[2],
        name: row[3],
        redirectUris: row[4],
        scopes: row[5],
        ownerId: row[6],
        confidential: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const getOAuth2ApplicationByClientIDQuery = `-- name: GetOAuth2ApplicationByClientID :one
SELECT id, client_id, client_secret_hash, name, redirect_uris, scopes, owner_id, confidential, created_at, updated_at
FROM oauth2_applications
WHERE client_id = $1`;

export interface GetOAuth2ApplicationByClientIDArgs {
    clientId: string;
}

export interface GetOAuth2ApplicationByClientIDRow {
    id: string;
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    ownerId: string;
    confidential: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOAuth2ApplicationByClientID(sql: Sql, args: GetOAuth2ApplicationByClientIDArgs): Promise<GetOAuth2ApplicationByClientIDRow | null> {
    const rows = await sql.unsafe(getOAuth2ApplicationByClientIDQuery, [args.clientId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        clientId: row[1],
        clientSecretHash: row[2],
        name: row[3],
        redirectUris: row[4],
        scopes: row[5],
        ownerId: row[6],
        confidential: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const listOAuth2ApplicationsByOwnerQuery = `-- name: ListOAuth2ApplicationsByOwner :many
SELECT id, client_id, client_secret_hash, name, redirect_uris, scopes, owner_id, confidential, created_at, updated_at
FROM oauth2_applications
WHERE owner_id = $1
ORDER BY created_at DESC`;

export interface ListOAuth2ApplicationsByOwnerArgs {
    ownerId: string;
}

export interface ListOAuth2ApplicationsByOwnerRow {
    id: string;
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    ownerId: string;
    confidential: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listOAuth2ApplicationsByOwner(sql: Sql, args: ListOAuth2ApplicationsByOwnerArgs): Promise<ListOAuth2ApplicationsByOwnerRow[]> {
    return (await sql.unsafe(listOAuth2ApplicationsByOwnerQuery, [args.ownerId]).values()).map(row => ({
        id: row[0],
        clientId: row[1],
        clientSecretHash: row[2],
        name: row[3],
        redirectUris: row[4],
        scopes: row[5],
        ownerId: row[6],
        confidential: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const updateOAuth2ApplicationQuery = `-- name: UpdateOAuth2Application :one
UPDATE oauth2_applications
SET name = $1,
    redirect_uris = $2,
    scopes = $3,
    confidential = $4,
    updated_at = NOW()
WHERE id = $5
  AND owner_id = $6
RETURNING id, client_id, client_secret_hash, name, redirect_uris, scopes, owner_id, confidential, created_at, updated_at`;

export interface UpdateOAuth2ApplicationArgs {
    name: string;
    redirectUris: string[];
    scopes: string[];
    confidential: boolean;
    id: string;
    ownerId: string;
}

export interface UpdateOAuth2ApplicationRow {
    id: string;
    clientId: string;
    clientSecretHash: string;
    name: string;
    redirectUris: string[];
    scopes: string[];
    ownerId: string;
    confidential: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateOAuth2Application(sql: Sql, args: UpdateOAuth2ApplicationArgs): Promise<UpdateOAuth2ApplicationRow | null> {
    const rows = await sql.unsafe(updateOAuth2ApplicationQuery, [args.name, args.redirectUris, args.scopes, args.confidential, args.id, args.ownerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        clientId: row[1],
        clientSecretHash: row[2],
        name: row[3],
        redirectUris: row[4],
        scopes: row[5],
        ownerId: row[6],
        confidential: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const deleteOAuth2ApplicationQuery = `-- name: DeleteOAuth2Application :execrows
DELETE FROM oauth2_applications
WHERE id = $1
  AND owner_id = $2`;

export interface DeleteOAuth2ApplicationArgs {
    id: string;
    ownerId: string;
}

export const createOAuth2AuthorizationCodeQuery = `-- name: CreateOAuth2AuthorizationCode :exec
INSERT INTO oauth2_authorization_codes (
    code_hash,
    app_id,
    user_id,
    scopes,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    expires_at
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8
)`;

export interface CreateOAuth2AuthorizationCodeArgs {
    codeHash: string;
    appId: string;
    userId: string;
    scopes: string[];
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    expiresAt: Date;
}

export async function createOAuth2AuthorizationCode(sql: Sql, args: CreateOAuth2AuthorizationCodeArgs): Promise<void> {
    await sql.unsafe(createOAuth2AuthorizationCodeQuery, [args.codeHash, args.appId, args.userId, args.scopes, args.redirectUri, args.codeChallenge, args.codeChallengeMethod, args.expiresAt]);
}

export const consumeOAuth2AuthorizationCodeQuery = `-- name: ConsumeOAuth2AuthorizationCode :one
UPDATE oauth2_authorization_codes
SET used_at = NOW()
WHERE code_hash = $1
  AND used_at IS NULL
  AND expires_at > NOW()
RETURNING code_hash, app_id, user_id, scopes, redirect_uri, code_challenge, code_challenge_method, expires_at, used_at, created_at`;

export interface ConsumeOAuth2AuthorizationCodeArgs {
    codeHash: string;
}

export interface ConsumeOAuth2AuthorizationCodeRow {
    codeHash: string;
    appId: string;
    userId: string;
    scopes: string[];
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdAt: Date;
}

export async function consumeOAuth2AuthorizationCode(sql: Sql, args: ConsumeOAuth2AuthorizationCodeArgs): Promise<ConsumeOAuth2AuthorizationCodeRow | null> {
    const rows = await sql.unsafe(consumeOAuth2AuthorizationCodeQuery, [args.codeHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        codeHash: row[0],
        appId: row[1],
        userId: row[2],
        scopes: row[3],
        redirectUri: row[4],
        codeChallenge: row[5],
        codeChallengeMethod: row[6],
        expiresAt: row[7],
        usedAt: row[8],
        createdAt: row[9]
    };
}

export const deleteExpiredOAuth2AuthorizationCodesQuery = `-- name: DeleteExpiredOAuth2AuthorizationCodes :exec
DELETE FROM oauth2_authorization_codes
WHERE expires_at < NOW()`;

export async function deleteExpiredOAuth2AuthorizationCodes(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredOAuth2AuthorizationCodesQuery, []);
}

export const createOAuth2AccessTokenQuery = `-- name: CreateOAuth2AccessToken :one
INSERT INTO oauth2_access_tokens (
    token_hash,
    app_id,
    user_id,
    scopes,
    expires_at
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, token_hash, app_id, user_id, scopes, expires_at, created_at`;

export interface CreateOAuth2AccessTokenArgs {
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[];
    expiresAt: Date;
}

export interface CreateOAuth2AccessTokenRow {
    id: string;
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[];
    expiresAt: Date;
    createdAt: Date;
}

export async function createOAuth2AccessToken(sql: Sql, args: CreateOAuth2AccessTokenArgs): Promise<CreateOAuth2AccessTokenRow | null> {
    const rows = await sql.unsafe(createOAuth2AccessTokenQuery, [args.tokenHash, args.appId, args.userId, args.scopes, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        tokenHash: row[1],
        appId: row[2],
        userId: row[3],
        scopes: row[4],
        expiresAt: row[5],
        createdAt: row[6]
    };
}

export const getOAuth2AccessTokenByHashQuery = `-- name: GetOAuth2AccessTokenByHash :one
SELECT id, token_hash, app_id, user_id, scopes, expires_at, created_at
FROM oauth2_access_tokens
WHERE token_hash = $1
  AND expires_at > NOW()`;

export interface GetOAuth2AccessTokenByHashArgs {
    tokenHash: string;
}

export interface GetOAuth2AccessTokenByHashRow {
    id: string;
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[];
    expiresAt: Date;
    createdAt: Date;
}

export async function getOAuth2AccessTokenByHash(sql: Sql, args: GetOAuth2AccessTokenByHashArgs): Promise<GetOAuth2AccessTokenByHashRow | null> {
    const rows = await sql.unsafe(getOAuth2AccessTokenByHashQuery, [args.tokenHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        tokenHash: row[1],
        appId: row[2],
        userId: row[3],
        scopes: row[4],
        expiresAt: row[5],
        createdAt: row[6]
    };
}

export const deleteOAuth2AccessTokensByAppAndUserQuery = `-- name: DeleteOAuth2AccessTokensByAppAndUser :exec
DELETE FROM oauth2_access_tokens
WHERE app_id = $1
  AND user_id = $2`;

export interface DeleteOAuth2AccessTokensByAppAndUserArgs {
    appId: string;
    userId: string;
}

export async function deleteOAuth2AccessTokensByAppAndUser(sql: Sql, args: DeleteOAuth2AccessTokensByAppAndUserArgs): Promise<void> {
    await sql.unsafe(deleteOAuth2AccessTokensByAppAndUserQuery, [args.appId, args.userId]);
}

export const deleteOAuth2AccessTokenByHashQuery = `-- name: DeleteOAuth2AccessTokenByHash :execrows
DELETE FROM oauth2_access_tokens
WHERE token_hash = $1`;

export interface DeleteOAuth2AccessTokenByHashArgs {
    tokenHash: string;
}

export const deleteExpiredOAuth2AccessTokensQuery = `-- name: DeleteExpiredOAuth2AccessTokens :exec
DELETE FROM oauth2_access_tokens
WHERE expires_at < NOW()`;

export async function deleteExpiredOAuth2AccessTokens(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredOAuth2AccessTokensQuery, []);
}

export const createOAuth2RefreshTokenQuery = `-- name: CreateOAuth2RefreshToken :one
INSERT INTO oauth2_refresh_tokens (
    token_hash,
    app_id,
    user_id,
    scopes,
    expires_at
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, token_hash, app_id, user_id, scopes, expires_at, created_at`;

export interface CreateOAuth2RefreshTokenArgs {
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[] | null;
    expiresAt: Date;
}

export interface CreateOAuth2RefreshTokenRow {
    id: string;
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[] | null;
    expiresAt: Date;
    createdAt: Date;
}

export async function createOAuth2RefreshToken(sql: Sql, args: CreateOAuth2RefreshTokenArgs): Promise<CreateOAuth2RefreshTokenRow | null> {
    const rows = await sql.unsafe(createOAuth2RefreshTokenQuery, [args.tokenHash, args.appId, args.userId, args.scopes, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        tokenHash: row[1],
        appId: row[2],
        userId: row[3],
        scopes: row[4],
        expiresAt: row[5],
        createdAt: row[6]
    };
}

export const getOAuth2RefreshTokenByHashQuery = `-- name: GetOAuth2RefreshTokenByHash :one
SELECT id, token_hash, app_id, user_id, scopes, expires_at, created_at
FROM oauth2_refresh_tokens
WHERE token_hash = $1
  AND expires_at > NOW()`;

export interface GetOAuth2RefreshTokenByHashArgs {
    tokenHash: string;
}

export interface GetOAuth2RefreshTokenByHashRow {
    id: string;
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[] | null;
    expiresAt: Date;
    createdAt: Date;
}

export async function getOAuth2RefreshTokenByHash(sql: Sql, args: GetOAuth2RefreshTokenByHashArgs): Promise<GetOAuth2RefreshTokenByHashRow | null> {
    const rows = await sql.unsafe(getOAuth2RefreshTokenByHashQuery, [args.tokenHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        tokenHash: row[1],
        appId: row[2],
        userId: row[3],
        scopes: row[4],
        expiresAt: row[5],
        createdAt: row[6]
    };
}

export const consumeOAuth2RefreshTokenQuery = `-- name: ConsumeOAuth2RefreshToken :one
DELETE FROM oauth2_refresh_tokens
WHERE token_hash = $1
  AND expires_at > NOW()
RETURNING id, token_hash, app_id, user_id, scopes, expires_at, created_at`;

export interface ConsumeOAuth2RefreshTokenArgs {
    tokenHash: string;
}

export interface ConsumeOAuth2RefreshTokenRow {
    id: string;
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[] | null;
    expiresAt: Date;
    createdAt: Date;
}

export async function consumeOAuth2RefreshToken(sql: Sql, args: ConsumeOAuth2RefreshTokenArgs): Promise<ConsumeOAuth2RefreshTokenRow | null> {
    const rows = await sql.unsafe(consumeOAuth2RefreshTokenQuery, [args.tokenHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        tokenHash: row[1],
        appId: row[2],
        userId: row[3],
        scopes: row[4],
        expiresAt: row[5],
        createdAt: row[6]
    };
}

export const deleteOAuth2RefreshTokenByHashQuery = `-- name: DeleteOAuth2RefreshTokenByHash :execrows
DELETE FROM oauth2_refresh_tokens
WHERE token_hash = $1`;

export interface DeleteOAuth2RefreshTokenByHashArgs {
    tokenHash: string;
}

export const deleteOAuth2RefreshTokensByAppAndUserQuery = `-- name: DeleteOAuth2RefreshTokensByAppAndUser :exec
DELETE FROM oauth2_refresh_tokens
WHERE app_id = $1
  AND user_id = $2`;

export interface DeleteOAuth2RefreshTokensByAppAndUserArgs {
    appId: string;
    userId: string;
}

export async function deleteOAuth2RefreshTokensByAppAndUser(sql: Sql, args: DeleteOAuth2RefreshTokensByAppAndUserArgs): Promise<void> {
    await sql.unsafe(deleteOAuth2RefreshTokensByAppAndUserQuery, [args.appId, args.userId]);
}

export const deleteExpiredOAuth2RefreshTokensQuery = `-- name: DeleteExpiredOAuth2RefreshTokens :exec
DELETE FROM oauth2_refresh_tokens
WHERE expires_at < NOW()`;

export async function deleteExpiredOAuth2RefreshTokens(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredOAuth2RefreshTokensQuery, []);
}

export const listOAuth2AccessTokensByUserQuery = `-- name: ListOAuth2AccessTokensByUser :many
SELECT t.id, t.token_hash, t.app_id, t.user_id, t.scopes, t.expires_at, t.created_at, a.name AS app_name, a.client_id AS app_client_id
FROM oauth2_access_tokens t
JOIN oauth2_applications a ON a.id = t.app_id
WHERE t.user_id = $1
  AND t.expires_at > NOW()
ORDER BY t.created_at DESC`;

export interface ListOAuth2AccessTokensByUserArgs {
    userId: string;
}

export interface ListOAuth2AccessTokensByUserRow {
    id: string;
    tokenHash: string;
    appId: string;
    userId: string;
    scopes: string[];
    expiresAt: Date;
    createdAt: Date;
    appName: string;
    appClientId: string;
}

export async function listOAuth2AccessTokensByUser(sql: Sql, args: ListOAuth2AccessTokensByUserArgs): Promise<ListOAuth2AccessTokensByUserRow[]> {
    return (await sql.unsafe(listOAuth2AccessTokensByUserQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        tokenHash: row[1],
        appId: row[2],
        userId: row[3],
        scopes: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        appName: row[7],
        appClientId: row[8]
    }));
}

