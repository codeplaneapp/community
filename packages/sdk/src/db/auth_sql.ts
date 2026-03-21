import { Sql } from "postgres";

export const createAuthSessionQuery = `-- name: CreateAuthSession :one
INSERT INTO auth_sessions (session_key, user_id, username, is_admin, expires_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING session_key, user_id, username, is_admin, data, expires_at, created_at, updated_at`;

export interface CreateAuthSessionArgs {
    sessionKey: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    expiresAt: Date;
}

export interface CreateAuthSessionRow {
    sessionKey: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    data: Buffer | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function createAuthSession(sql: Sql, args: CreateAuthSessionArgs): Promise<CreateAuthSessionRow | null> {
    const rows = await sql.unsafe(createAuthSessionQuery, [args.sessionKey, args.userId, args.username, args.isAdmin, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        sessionKey: row[0],
        userId: row[1],
        username: row[2],
        isAdmin: row[3],
        data: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getAuthSessionBySessionKeyQuery = `-- name: GetAuthSessionBySessionKey :one
SELECT session_key, user_id, username, is_admin, data, expires_at, created_at, updated_at
FROM auth_sessions
WHERE session_key = $1`;

export interface GetAuthSessionBySessionKeyArgs {
    sessionKey: string;
}

export interface GetAuthSessionBySessionKeyRow {
    sessionKey: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    data: Buffer | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function getAuthSessionBySessionKey(sql: Sql, args: GetAuthSessionBySessionKeyArgs): Promise<GetAuthSessionBySessionKeyRow | null> {
    const rows = await sql.unsafe(getAuthSessionBySessionKeyQuery, [args.sessionKey]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        sessionKey: row[0],
        userId: row[1],
        username: row[2],
        isAdmin: row[3],
        data: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteAuthSessionQuery = `-- name: DeleteAuthSession :exec
DELETE FROM auth_sessions
WHERE session_key = $1`;

export interface DeleteAuthSessionArgs {
    sessionKey: string;
}

export async function deleteAuthSession(sql: Sql, args: DeleteAuthSessionArgs): Promise<void> {
    await sql.unsafe(deleteAuthSessionQuery, [args.sessionKey]);
}

export const createAuthNonceQuery = `-- name: CreateAuthNonce :one
INSERT INTO auth_nonces (nonce_key, expires_at)
VALUES ($1, $2)
RETURNING nonce_key, wallet_address, created_at, expires_at, used_at`;

export interface CreateAuthNonceArgs {
    nonce: string;
    expiresAt: Date;
}

export interface CreateAuthNonceRow {
    nonceKey: string;
    walletAddress: string | null;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function createAuthNonce(sql: Sql, args: CreateAuthNonceArgs): Promise<CreateAuthNonceRow | null> {
    const rows = await sql.unsafe(createAuthNonceQuery, [args.nonce, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        nonceKey: row[0],
        walletAddress: row[1],
        createdAt: row[2],
        expiresAt: row[3],
        usedAt: row[4]
    };
}

export const consumeAuthNonceQuery = `-- name: ConsumeAuthNonce :execrows
UPDATE auth_nonces
SET used_at = NOW(), wallet_address = $1
WHERE nonce_key = $2
  AND used_at IS NULL
  AND expires_at > NOW()`;

export interface ConsumeAuthNonceArgs {
    walletAddress: string | null;
    nonce: string;
}

export const createOAuthStateQuery = `-- name: CreateOAuthState :one
INSERT INTO oauth_states (state_key, context_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING state_key, context_hash, created_at, expires_at, used_at`;

export interface CreateOAuthStateArgs {
    state: string;
    contextHash: string;
    expiresAt: Date;
}

export interface CreateOAuthStateRow {
    stateKey: string;
    contextHash: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function createOAuthState(sql: Sql, args: CreateOAuthStateArgs): Promise<CreateOAuthStateRow | null> {
    const rows = await sql.unsafe(createOAuthStateQuery, [args.state, args.contextHash, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        stateKey: row[0],
        contextHash: row[1],
        createdAt: row[2],
        expiresAt: row[3],
        usedAt: row[4]
    };
}

export const consumeOAuthStateQuery = `-- name: ConsumeOAuthState :execrows
UPDATE oauth_states
SET used_at = NOW()
WHERE state_key = $1
  AND context_hash = $2
  AND used_at IS NULL
  AND expires_at > NOW()`;

export interface ConsumeOAuthStateArgs {
    state: string;
    contextHash: string;
}

export const deleteExpiredOAuthStatesQuery = `-- name: DeleteExpiredOAuthStates :exec
DELETE FROM oauth_states
WHERE expires_at < NOW()`;

export async function deleteExpiredOAuthStates(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredOAuthStatesQuery, []);
}

export const upsertEmailAddressQuery = `-- name: UpsertEmailAddress :one
WITH unset_primary AS (
    UPDATE email_addresses AS ea
    SET is_primary = FALSE,
        updated_at = NOW()
	    WHERE ea.user_id = $1
	      AND ea.is_primary = TRUE
	      AND $2::boolean = TRUE
	    RETURNING ea.id
),
upserted AS (
    INSERT INTO email_addresses (user_id, email, lower_email, is_activated, is_primary)
    SELECT
        $1,
        $3,
        $4,
        $5,
        $2::boolean
    FROM (SELECT 1) AS force_cte
    LEFT JOIN unset_primary ON TRUE
    ON CONFLICT (user_id, lower_email)
    DO UPDATE SET
        email = EXCLUDED.email,
        is_activated = EXCLUDED.is_activated,
        is_primary = EXCLUDED.is_primary,
        updated_at = NOW()
    RETURNING id, user_id, email, lower_email, is_activated, is_primary, created_at, updated_at
)
SELECT id, user_id, email, lower_email, is_activated, is_primary, created_at, updated_at FROM upserted`;

export interface UpsertEmailAddressArgs {
    userId: string;
    isPrimary: boolean;
    email: string;
    lowerEmail: string;
    isActivated: boolean;
}

export interface UpsertEmailAddressRow {
    id: string;
    userId: string;
    email: string;
    lowerEmail: string;
    isActivated: boolean;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertEmailAddress(sql: Sql, args: UpsertEmailAddressArgs): Promise<UpsertEmailAddressRow | null> {
    const rows = await sql.unsafe(upsertEmailAddressQuery, [args.userId, args.isPrimary, args.email, args.lowerEmail, args.isActivated]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        email: row[2],
        lowerEmail: row[3],
        isActivated: row[4],
        isPrimary: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const listUserSessionsQuery = `-- name: ListUserSessions :many
SELECT session_key, user_id, username, is_admin, data, expires_at, created_at, updated_at
FROM auth_sessions
WHERE user_id = $1
ORDER BY created_at DESC`;

export interface ListUserSessionsArgs {
    userId: string;
}

export interface ListUserSessionsRow {
    sessionKey: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    data: Buffer | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserSessions(sql: Sql, args: ListUserSessionsArgs): Promise<ListUserSessionsRow[]> {
    return (await sql.unsafe(listUserSessionsQuery, [args.userId]).values()).map(row => ({
        sessionKey: row[0],
        userId: row[1],
        username: row[2],
        isAdmin: row[3],
        data: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const deleteExpiredSessionsQuery = `-- name: DeleteExpiredSessions :exec
DELETE FROM auth_sessions
WHERE expires_at < NOW()`;

export async function deleteExpiredSessions(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredSessionsQuery, []);
}

export const deleteUserSessionsQuery = `-- name: DeleteUserSessions :exec
DELETE FROM auth_sessions
WHERE user_id = $1`;

export interface DeleteUserSessionsArgs {
    userId: string;
}

export async function deleteUserSessions(sql: Sql, args: DeleteUserSessionsArgs): Promise<void> {
    await sql.unsafe(deleteUserSessionsQuery, [args.userId]);
}

export const updateSessionExpiryQuery = `-- name: UpdateSessionExpiry :exec
UPDATE auth_sessions
SET expires_at = $1,
    updated_at = NOW()
WHERE session_key = $2`;

export interface UpdateSessionExpiryArgs {
    expiresAt: Date;
    sessionKey: string;
}

export async function updateSessionExpiry(sql: Sql, args: UpdateSessionExpiryArgs): Promise<void> {
    await sql.unsafe(updateSessionExpiryQuery, [args.expiresAt, args.sessionKey]);
}

export const refreshAuthSessionQuery = `-- name: RefreshAuthSession :one
UPDATE auth_sessions
SET expires_at = $1,
    updated_at = NOW()
WHERE session_key = $2
RETURNING session_key, user_id, username, is_admin, data, expires_at, created_at, updated_at`;

export interface RefreshAuthSessionArgs {
    expiresAt: Date;
    sessionKey: string;
}

export interface RefreshAuthSessionRow {
    sessionKey: string;
    userId: string;
    username: string;
    isAdmin: boolean;
    data: Buffer | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function refreshAuthSession(sql: Sql, args: RefreshAuthSessionArgs): Promise<RefreshAuthSessionRow | null> {
    const rows = await sql.unsafe(refreshAuthSessionQuery, [args.expiresAt, args.sessionKey]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        sessionKey: row[0],
        userId: row[1],
        username: row[2],
        isAdmin: row[3],
        data: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const createAccessTokenQuery = `-- name: CreateAccessToken :one
INSERT INTO access_tokens (user_id, name, token_hash, token_last_eight, scopes)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, user_id, name, token_hash, token_last_eight, scopes, last_used_at, created_at, updated_at`;

export interface CreateAccessTokenArgs {
    userId: string;
    name: string;
    tokenHash: string;
    tokenLastEight: string;
    scopes: string;
}

export interface CreateAccessTokenRow {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
    tokenLastEight: string;
    scopes: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createAccessToken(sql: Sql, args: CreateAccessTokenArgs): Promise<CreateAccessTokenRow | null> {
    const rows = await sql.unsafe(createAccessTokenQuery, [args.userId, args.name, args.tokenHash, args.tokenLastEight, args.scopes]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        name: row[2],
        tokenHash: row[3],
        tokenLastEight: row[4],
        scopes: row[5],
        lastUsedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const listUserAccessTokensQuery = `-- name: ListUserAccessTokens :many
SELECT id, user_id, name, token_hash, token_last_eight, scopes, last_used_at, created_at, updated_at
FROM access_tokens
WHERE user_id = $1
ORDER BY created_at DESC`;

export interface ListUserAccessTokensArgs {
    userId: string;
}

export interface ListUserAccessTokensRow {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
    tokenLastEight: string;
    scopes: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserAccessTokens(sql: Sql, args: ListUserAccessTokensArgs): Promise<ListUserAccessTokensRow[]> {
    return (await sql.unsafe(listUserAccessTokensQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        name: row[2],
        tokenHash: row[3],
        tokenLastEight: row[4],
        scopes: row[5],
        lastUsedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const listAccessTokensByUserIDQuery = `-- name: ListAccessTokensByUserID :many
SELECT id, user_id, name, token_hash, token_last_eight, scopes, last_used_at, created_at, updated_at
FROM access_tokens
WHERE user_id = $1
ORDER BY created_at DESC`;

export interface ListAccessTokensByUserIDArgs {
    userId: string;
}

export interface ListAccessTokensByUserIDRow {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
    tokenLastEight: string;
    scopes: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listAccessTokensByUserID(sql: Sql, args: ListAccessTokensByUserIDArgs): Promise<ListAccessTokensByUserIDRow[]> {
    return (await sql.unsafe(listAccessTokensByUserIDQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        name: row[2],
        tokenHash: row[3],
        tokenLastEight: row[4],
        scopes: row[5],
        lastUsedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const getAccessTokenByIDQuery = `-- name: GetAccessTokenByID :one
SELECT id, user_id, name, token_hash, token_last_eight, scopes, last_used_at, created_at, updated_at
FROM access_tokens
WHERE id = $1`;

export interface GetAccessTokenByIDArgs {
    id: string;
}

export interface GetAccessTokenByIDRow {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
    tokenLastEight: string;
    scopes: string;
    lastUsedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getAccessTokenByID(sql: Sql, args: GetAccessTokenByIDArgs): Promise<GetAccessTokenByIDRow | null> {
    const rows = await sql.unsafe(getAccessTokenByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        name: row[2],
        tokenHash: row[3],
        tokenLastEight: row[4],
        scopes: row[5],
        lastUsedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const deleteAccessTokenQuery = `-- name: DeleteAccessToken :exec
DELETE FROM access_tokens
WHERE id = $1
  AND user_id = $2`;

export interface DeleteAccessTokenArgs {
    id: string;
    userId: string;
}

export async function deleteAccessToken(sql: Sql, args: DeleteAccessTokenArgs): Promise<void> {
    await sql.unsafe(deleteAccessTokenQuery, [args.id, args.userId]);
}

export const deleteAccessTokenByIDAndUserIDQuery = `-- name: DeleteAccessTokenByIDAndUserID :execrows
DELETE FROM access_tokens
WHERE id = $1
  AND user_id = $2`;

export interface DeleteAccessTokenByIDAndUserIDArgs {
    id: string;
    userId: string;
}

export const updateAccessTokenLastUsedQuery = `-- name: UpdateAccessTokenLastUsed :exec
UPDATE access_tokens
SET last_used_at = NOW(),
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateAccessTokenLastUsedArgs {
    id: string;
}

export async function updateAccessTokenLastUsed(sql: Sql, args: UpdateAccessTokenLastUsedArgs): Promise<void> {
    await sql.unsafe(updateAccessTokenLastUsedQuery, [args.id]);
}

export const listUserEmailsQuery = `-- name: ListUserEmails :many
SELECT id, user_id, email, lower_email, is_activated, is_primary, created_at, updated_at
FROM email_addresses
WHERE user_id = $1
ORDER BY is_primary DESC, created_at ASC`;

export interface ListUserEmailsArgs {
    userId: string;
}

export interface ListUserEmailsRow {
    id: string;
    userId: string;
    email: string;
    lowerEmail: string;
    isActivated: boolean;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserEmails(sql: Sql, args: ListUserEmailsArgs): Promise<ListUserEmailsRow[]> {
    return (await sql.unsafe(listUserEmailsQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        email: row[2],
        lowerEmail: row[3],
        isActivated: row[4],
        isPrimary: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const getEmailByIDQuery = `-- name: GetEmailByID :one
SELECT id, user_id, email, lower_email, is_activated, is_primary, created_at, updated_at
FROM email_addresses
WHERE id = $1`;

export interface GetEmailByIDArgs {
    id: string;
}

export interface GetEmailByIDRow {
    id: string;
    userId: string;
    email: string;
    lowerEmail: string;
    isActivated: boolean;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getEmailByID(sql: Sql, args: GetEmailByIDArgs): Promise<GetEmailByIDRow | null> {
    const rows = await sql.unsafe(getEmailByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        email: row[2],
        lowerEmail: row[3],
        isActivated: row[4],
        isPrimary: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteEmailQuery = `-- name: DeleteEmail :exec
DELETE FROM email_addresses
WHERE id = $1
  AND user_id = $2`;

export interface DeleteEmailArgs {
    id: string;
    userId: string;
}

export async function deleteEmail(sql: Sql, args: DeleteEmailArgs): Promise<void> {
    await sql.unsafe(deleteEmailQuery, [args.id, args.userId]);
}

export const activateEmailQuery = `-- name: ActivateEmail :exec
UPDATE email_addresses
SET is_activated = true,
    updated_at = NOW()
WHERE id = $1
  AND user_id = $2`;

export interface ActivateEmailArgs {
    id: string;
    userId: string;
}

export async function activateEmail(sql: Sql, args: ActivateEmailArgs): Promise<void> {
    await sql.unsafe(activateEmailQuery, [args.id, args.userId]);
}

export const getPrimaryEmailQuery = `-- name: GetPrimaryEmail :one
SELECT id, user_id, email, lower_email, is_activated, is_primary, created_at, updated_at
FROM email_addresses
WHERE user_id = $1
  AND is_primary = true`;

export interface GetPrimaryEmailArgs {
    userId: string;
}

export interface GetPrimaryEmailRow {
    id: string;
    userId: string;
    email: string;
    lowerEmail: string;
    isActivated: boolean;
    isPrimary: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getPrimaryEmail(sql: Sql, args: GetPrimaryEmailArgs): Promise<GetPrimaryEmailRow | null> {
    const rows = await sql.unsafe(getPrimaryEmailQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        email: row[2],
        lowerEmail: row[3],
        isActivated: row[4],
        isPrimary: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const createEmailVerificationTokenQuery = `-- name: CreateEmailVerificationToken :one
INSERT INTO email_verification_tokens (user_id, email, token_hash, token_type, expires_at)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, user_id, email, token_hash, token_type, expires_at, created_at, used_at`;

export interface CreateEmailVerificationTokenArgs {
    userId: string;
    email: string;
    tokenHash: string;
    tokenType: string;
    expiresAt: Date;
}

export interface CreateEmailVerificationTokenRow {
    id: string;
    userId: string;
    email: string;
    tokenHash: string;
    tokenType: string;
    expiresAt: Date;
    createdAt: Date;
    usedAt: Date | null;
}

export async function createEmailVerificationToken(sql: Sql, args: CreateEmailVerificationTokenArgs): Promise<CreateEmailVerificationTokenRow | null> {
    const rows = await sql.unsafe(createEmailVerificationTokenQuery, [args.userId, args.email, args.tokenHash, args.tokenType, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        email: row[2],
        tokenHash: row[3],
        tokenType: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        usedAt: row[7]
    };
}

export const consumeEmailVerificationTokenQuery = `-- name: ConsumeEmailVerificationToken :execrows
UPDATE email_verification_tokens
SET used_at = NOW()
WHERE token_hash = $1
  AND used_at IS NULL
  AND expires_at > NOW()`;

export interface ConsumeEmailVerificationTokenArgs {
    tokenHash: string;
}

export const deleteExpiredVerificationTokensQuery = `-- name: DeleteExpiredVerificationTokens :exec
DELETE FROM email_verification_tokens
WHERE expires_at < NOW()`;

export async function deleteExpiredVerificationTokens(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredVerificationTokensQuery, []);
}

export const deleteExpiredNoncesQuery = `-- name: DeleteExpiredNonces :exec
DELETE FROM auth_nonces
WHERE expires_at < NOW()`;

export async function deleteExpiredNonces(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredNoncesQuery, []);
}

export const createOAuthAccountQuery = `-- name: CreateOAuthAccount :one
INSERT INTO oauth_accounts (
    user_id,
    provider,
    provider_user_id,
    access_token_encrypted,
    refresh_token_encrypted,
    profile_data
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6
)
RETURNING id, user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, profile_data, created_at, updated_at`;

export interface CreateOAuthAccountArgs {
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    profileData: any;
}

export interface CreateOAuthAccountRow {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    expiresAt: Date | null;
    profileData: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function createOAuthAccount(sql: Sql, args: CreateOAuthAccountArgs): Promise<CreateOAuthAccountRow | null> {
    const rows = await sql.unsafe(createOAuthAccountQuery, [args.userId, args.provider, args.providerUserId, args.accessTokenEncrypted, args.refreshTokenEncrypted, args.profileData]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        provider: row[2],
        providerUserId: row[3],
        accessTokenEncrypted: row[4],
        refreshTokenEncrypted: row[5],
        expiresAt: row[6],
        profileData: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const getOAuthAccountByProviderQuery = `-- name: GetOAuthAccountByProvider :one
SELECT id, user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, profile_data, created_at, updated_at
FROM oauth_accounts
WHERE provider = $1
  AND provider_user_id = $2`;

export interface GetOAuthAccountByProviderArgs {
    provider: string;
    providerUserId: string;
}

export interface GetOAuthAccountByProviderRow {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    expiresAt: Date | null;
    profileData: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOAuthAccountByProvider(sql: Sql, args: GetOAuthAccountByProviderArgs): Promise<GetOAuthAccountByProviderRow | null> {
    const rows = await sql.unsafe(getOAuthAccountByProviderQuery, [args.provider, args.providerUserId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        provider: row[2],
        providerUserId: row[3],
        accessTokenEncrypted: row[4],
        refreshTokenEncrypted: row[5],
        expiresAt: row[6],
        profileData: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const getOAuthAccountByProviderUserIDQuery = `-- name: GetOAuthAccountByProviderUserID :one
SELECT id, user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, profile_data, created_at, updated_at
FROM oauth_accounts
WHERE provider = $1
  AND provider_user_id = $2`;

export interface GetOAuthAccountByProviderUserIDArgs {
    provider: string;
    providerUserId: string;
}

export interface GetOAuthAccountByProviderUserIDRow {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    expiresAt: Date | null;
    profileData: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOAuthAccountByProviderUserID(sql: Sql, args: GetOAuthAccountByProviderUserIDArgs): Promise<GetOAuthAccountByProviderUserIDRow | null> {
    const rows = await sql.unsafe(getOAuthAccountByProviderUserIDQuery, [args.provider, args.providerUserId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        provider: row[2],
        providerUserId: row[3],
        accessTokenEncrypted: row[4],
        refreshTokenEncrypted: row[5],
        expiresAt: row[6],
        profileData: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const upsertOAuthAccountQuery = `-- name: UpsertOAuthAccount :one
INSERT INTO oauth_accounts (
    user_id,
    provider,
    provider_user_id,
    access_token_encrypted,
    refresh_token_encrypted,
    profile_data
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6
)
ON CONFLICT (provider, provider_user_id)
DO UPDATE SET
    user_id = EXCLUDED.user_id,
    access_token_encrypted = EXCLUDED.access_token_encrypted,
    refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
    profile_data = EXCLUDED.profile_data,
    updated_at = NOW()
RETURNING id, user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, profile_data, created_at, updated_at`;

export interface UpsertOAuthAccountArgs {
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    profileData: any;
}

export interface UpsertOAuthAccountRow {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    expiresAt: Date | null;
    profileData: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertOAuthAccount(sql: Sql, args: UpsertOAuthAccountArgs): Promise<UpsertOAuthAccountRow | null> {
    const rows = await sql.unsafe(upsertOAuthAccountQuery, [args.userId, args.provider, args.providerUserId, args.accessTokenEncrypted, args.refreshTokenEncrypted, args.profileData]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        provider: row[2],
        providerUserId: row[3],
        accessTokenEncrypted: row[4],
        refreshTokenEncrypted: row[5],
        expiresAt: row[6],
        profileData: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const listUserOAuthAccountsQuery = `-- name: ListUserOAuthAccounts :many
SELECT id, user_id, provider, provider_user_id, access_token_encrypted, refresh_token_encrypted, expires_at, profile_data, created_at, updated_at
FROM oauth_accounts
WHERE user_id = $1
ORDER BY id ASC`;

export interface ListUserOAuthAccountsArgs {
    userId: string;
}

export interface ListUserOAuthAccountsRow {
    id: string;
    userId: string;
    provider: string;
    providerUserId: string;
    accessTokenEncrypted: Buffer | null;
    refreshTokenEncrypted: Buffer | null;
    expiresAt: Date | null;
    profileData: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserOAuthAccounts(sql: Sql, args: ListUserOAuthAccountsArgs): Promise<ListUserOAuthAccountsRow[]> {
    return (await sql.unsafe(listUserOAuthAccountsQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        provider: row[2],
        providerUserId: row[3],
        accessTokenEncrypted: row[4],
        refreshTokenEncrypted: row[5],
        expiresAt: row[6],
        profileData: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const deleteOAuthAccountQuery = `-- name: DeleteOAuthAccount :exec
DELETE FROM oauth_accounts
WHERE id = $1
  AND user_id = $2`;

export interface DeleteOAuthAccountArgs {
    id: string;
    userId: string;
}

export async function deleteOAuthAccount(sql: Sql, args: DeleteOAuthAccountArgs): Promise<void> {
    await sql.unsafe(deleteOAuthAccountQuery, [args.id, args.userId]);
}

export const getEmailVerificationTokenByHashQuery = `-- name: GetEmailVerificationTokenByHash :one
SELECT id, user_id, email, token_hash, token_type, expires_at, created_at, used_at
FROM email_verification_tokens
WHERE token_hash = $1`;

export interface GetEmailVerificationTokenByHashArgs {
    tokenHash: string;
}

export interface GetEmailVerificationTokenByHashRow {
    id: string;
    userId: string;
    email: string;
    tokenHash: string;
    tokenType: string;
    expiresAt: Date;
    createdAt: Date;
    usedAt: Date | null;
}

export async function getEmailVerificationTokenByHash(sql: Sql, args: GetEmailVerificationTokenByHashArgs): Promise<GetEmailVerificationTokenByHashRow | null> {
    const rows = await sql.unsafe(getEmailVerificationTokenByHashQuery, [args.tokenHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        email: row[2],
        tokenHash: row[3],
        tokenType: row[4],
        expiresAt: row[5],
        createdAt: row[6],
        usedAt: row[7]
    };
}

