import { Sql } from "postgres";

export const createUserQuery = `-- name: CreateUser :one
INSERT INTO users (username, lower_username, email, lower_email, display_name)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at`;

export interface CreateUserArgs {
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
}

export interface CreateUserRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createUser(sql: Sql, args: CreateUserArgs): Promise<CreateUserRow | null> {
    const rows = await sql.unsafe(createUserQuery, [args.username, args.lowerUsername, args.email, args.lowerEmail, args.displayName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const createUserWithWalletQuery = `-- name: CreateUserWithWallet :one
INSERT INTO users (username, lower_username, display_name, wallet_address)
VALUES ($1, $2, $3, $4)
RETURNING id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at`;

export interface CreateUserWithWalletArgs {
    username: string;
    lowerUsername: string;
    displayName: string;
    walletAddress: string | null;
}

export interface CreateUserWithWalletRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createUserWithWallet(sql: Sql, args: CreateUserWithWalletArgs): Promise<CreateUserWithWalletRow | null> {
    const rows = await sql.unsafe(createUserWithWalletQuery, [args.username, args.lowerUsername, args.displayName, args.walletAddress]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getAuthInfoByTokenHashQuery = `-- name: GetAuthInfoByTokenHash :one
SELECT
    u.id, u.username, u.lower_username, u.email, u.lower_email, u.display_name, u.bio, u.search_vector, u.avatar_url, u.wallet_address, u.user_type, u.is_active, u.is_admin, u.prohibit_login, u.email_notifications_enabled, u.last_login_at, u.created_at, u.updated_at,
    t.id AS token_id,
    t.scopes AS token_scopes
FROM access_tokens t
JOIN users u ON t.user_id = u.id
WHERE t.token_hash = $1 AND u.is_active = true AND u.prohibit_login = false`;

export interface GetAuthInfoByTokenHashArgs {
    tokenHash: string;
}

export interface GetAuthInfoByTokenHashRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tokenId: string;
    tokenScopes: string;
}

export async function getAuthInfoByTokenHash(sql: Sql, args: GetAuthInfoByTokenHashArgs): Promise<GetAuthInfoByTokenHashRow | null> {
    const rows = await sql.unsafe(getAuthInfoByTokenHashQuery, [args.tokenHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17],
        tokenId: row[18],
        tokenScopes: row[19]
    };
}

export const getUserByIDQuery = `-- name: GetUserByID :one
SELECT id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at
FROM users
WHERE id = $1`;

export interface GetUserByIDArgs {
    id: string;
}

export interface GetUserByIDRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getUserByID(sql: Sql, args: GetUserByIDArgs): Promise<GetUserByIDRow | null> {
    const rows = await sql.unsafe(getUserByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getUserByLowerUsernameQuery = `-- name: GetUserByLowerUsername :one
SELECT id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at
FROM users
WHERE lower_username = $1
  AND is_active = true`;

export interface GetUserByLowerUsernameArgs {
    lowerUsername: string;
}

export interface GetUserByLowerUsernameRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getUserByLowerUsername(sql: Sql, args: GetUserByLowerUsernameArgs): Promise<GetUserByLowerUsernameRow | null> {
    const rows = await sql.unsafe(getUserByLowerUsernameQuery, [args.lowerUsername]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getUserByWalletAddressQuery = `-- name: GetUserByWalletAddress :one
SELECT id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at
FROM users
WHERE wallet_address = $1
  AND is_active = true
  AND prohibit_login = false`;

export interface GetUserByWalletAddressArgs {
    walletAddress: string | null;
}

export interface GetUserByWalletAddressRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getUserByWalletAddress(sql: Sql, args: GetUserByWalletAddressArgs): Promise<GetUserByWalletAddressRow | null> {
    const rows = await sql.unsafe(getUserByWalletAddressQuery, [args.walletAddress]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getUserByLowerEmailQuery = `-- name: GetUserByLowerEmail :one
SELECT id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at
FROM users
WHERE lower_email = $1
  AND is_active = true`;

export interface GetUserByLowerEmailArgs {
    lowerEmail: string | null;
}

export interface GetUserByLowerEmailRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getUserByLowerEmail(sql: Sql, args: GetUserByLowerEmailArgs): Promise<GetUserByLowerEmailRow | null> {
    const rows = await sql.unsafe(getUserByLowerEmailQuery, [args.lowerEmail]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const updateUserQuery = `-- name: UpdateUser :one
UPDATE users
SET display_name = $1,
    bio = $2,
    avatar_url = $3,
    email = $4,
    lower_email = $5,
    updated_at = NOW()
WHERE id = $6
RETURNING id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at`;

export interface UpdateUserArgs {
    displayName: string;
    bio: string;
    avatarUrl: string;
    email: string | null;
    lowerEmail: string | null;
    userId: string;
}

export interface UpdateUserRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateUser(sql: Sql, args: UpdateUserArgs): Promise<UpdateUserRow | null> {
    const rows = await sql.unsafe(updateUserQuery, [args.displayName, args.bio, args.avatarUrl, args.email, args.lowerEmail, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const updateUserLastLoginQuery = `-- name: UpdateUserLastLogin :exec
UPDATE users
SET last_login_at = NOW(),
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateUserLastLoginArgs {
    id: string;
}

export async function updateUserLastLogin(sql: Sql, args: UpdateUserLastLoginArgs): Promise<void> {
    await sql.unsafe(updateUserLastLoginQuery, [args.id]);
}

export const listUsersQuery = `-- name: ListUsers :many
SELECT id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at
FROM users
WHERE is_active = true
ORDER BY id ASC
LIMIT $2
OFFSET $1`;

export interface ListUsersArgs {
    pageOffset: string;
    pageSize: string;
}

export interface ListUsersRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUsers(sql: Sql, args: ListUsersArgs): Promise<ListUsersRow[]> {
    return (await sql.unsafe(listUsersQuery, [args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    }));
}

export const searchUsersQuery = `-- name: SearchUsers :many
SELECT id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at
FROM users
WHERE is_active = true
  AND (
    lower_username LIKE $1
    OR LOWER(display_name) LIKE $1
  )
ORDER BY id ASC
LIMIT $3
OFFSET $2`;

export interface SearchUsersArgs {
    searchQuery: string;
    pageOffset: string;
    pageSize: string;
}

export interface SearchUsersRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function searchUsers(sql: Sql, args: SearchUsersArgs): Promise<SearchUsersRow[]> {
    return (await sql.unsafe(searchUsersQuery, [args.searchQuery, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    }));
}

export const deactivateUserQuery = `-- name: DeactivateUser :exec
UPDATE users
SET is_active = false,
    updated_at = NOW()
WHERE id = $1`;

export interface DeactivateUserArgs {
    id: string;
}

export async function deactivateUser(sql: Sql, args: DeactivateUserArgs): Promise<void> {
    await sql.unsafe(deactivateUserQuery, [args.id]);
}

export const setUserAdminQuery = `-- name: SetUserAdmin :exec
UPDATE users
SET is_admin = $1,
    updated_at = NOW()
WHERE id = $2`;

export interface SetUserAdminArgs {
    isAdmin: boolean;
    userId: string;
}

export async function setUserAdmin(sql: Sql, args: SetUserAdminArgs): Promise<void> {
    await sql.unsafe(setUserAdminQuery, [args.isAdmin, args.userId]);
}

export const countUsersQuery = `-- name: CountUsers :one
SELECT COUNT(*)
FROM users
WHERE is_active = true`;

export interface CountUsersRow {
    count: string;
}

export async function countUsers(sql: Sql): Promise<CountUsersRow | null> {
    const rows = await sql.unsafe(countUsersQuery, []).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const updateUserNotificationPreferencesQuery = `-- name: UpdateUserNotificationPreferences :one
UPDATE users
SET email_notifications_enabled = $1,
    updated_at = NOW()
WHERE id = $2
RETURNING id, username, lower_username, email, lower_email, display_name, bio, search_vector, avatar_url, wallet_address, user_type, is_active, is_admin, prohibit_login, email_notifications_enabled, last_login_at, created_at, updated_at`;

export interface UpdateUserNotificationPreferencesArgs {
    emailNotificationsEnabled: boolean;
    userId: string;
}

export interface UpdateUserNotificationPreferencesRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateUserNotificationPreferences(sql: Sql, args: UpdateUserNotificationPreferencesArgs): Promise<UpdateUserNotificationPreferencesRow | null> {
    const rows = await sql.unsafe(updateUserNotificationPreferencesQuery, [args.emailNotificationsEnabled, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getUserNotificationPreferencesQuery = `-- name: GetUserNotificationPreferences :one
SELECT id, email_notifications_enabled
FROM users
WHERE id = $1`;

export interface GetUserNotificationPreferencesArgs {
    id: string;
}

export interface GetUserNotificationPreferencesRow {
    id: string;
    emailNotificationsEnabled: boolean;
}

export async function getUserNotificationPreferences(sql: Sql, args: GetUserNotificationPreferencesArgs): Promise<GetUserNotificationPreferencesRow | null> {
    const rows = await sql.unsafe(getUserNotificationPreferencesQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        emailNotificationsEnabled: row[1]
    };
}

export const deleteUserQuery = `-- name: DeleteUser :exec
UPDATE users
SET is_active = false,
    prohibit_login = true,
    updated_at = NOW()
WHERE id = $1`;

export interface DeleteUserArgs {
    id: string;
}

export async function deleteUser(sql: Sql, args: DeleteUserArgs): Promise<void> {
    await sql.unsafe(deleteUserQuery, [args.id]);
}

