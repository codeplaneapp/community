import { Sql } from "postgres";

export const createLinearIntegrationQuery = `-- name: CreateLinearIntegration :one
INSERT INTO linear_integrations (
    user_id, org_id, linear_team_id, linear_team_name, linear_team_key,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name,
    linear_actor_id
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at`;

export interface CreateLinearIntegrationArgs {
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
}

export interface CreateLinearIntegrationRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLinearIntegration(sql: Sql, args: CreateLinearIntegrationArgs): Promise<CreateLinearIntegrationRow | null> {
    const rows = await sql.unsafe(createLinearIntegrationQuery, [args.userId, args.orgId, args.linearTeamId, args.linearTeamName, args.linearTeamKey, args.accessTokenEncrypted, args.refreshTokenEncrypted, args.tokenExpiresAt, args.webhookSecret, args.jjhubRepoId, args.jjhubRepoOwner, args.jjhubRepoName, args.linearActorId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLinearIntegrationQuery = `-- name: GetLinearIntegration :one
SELECT id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at FROM linear_integrations WHERE id = $1`;

export interface GetLinearIntegrationArgs {
    id: string;
}

export interface GetLinearIntegrationRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLinearIntegration(sql: Sql, args: GetLinearIntegrationArgs): Promise<GetLinearIntegrationRow | null> {
    const rows = await sql.unsafe(getLinearIntegrationQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLinearIntegrationByUserAndIDQuery = `-- name: GetLinearIntegrationByUserAndID :one
SELECT id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at FROM linear_integrations WHERE id = $1 AND user_id = $2`;

export interface GetLinearIntegrationByUserAndIDArgs {
    id: string;
    userId: string;
}

export interface GetLinearIntegrationByUserAndIDRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLinearIntegrationByUserAndID(sql: Sql, args: GetLinearIntegrationByUserAndIDArgs): Promise<GetLinearIntegrationByUserAndIDRow | null> {
    const rows = await sql.unsafe(getLinearIntegrationByUserAndIDQuery, [args.id, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLinearIntegrationByLinearTeamIDQuery = `-- name: GetLinearIntegrationByLinearTeamID :one
SELECT id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at FROM linear_integrations
WHERE linear_team_id = $1 AND is_active = TRUE
LIMIT 1`;

export interface GetLinearIntegrationByLinearTeamIDArgs {
    linearTeamId: string;
}

export interface GetLinearIntegrationByLinearTeamIDRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLinearIntegrationByLinearTeamID(sql: Sql, args: GetLinearIntegrationByLinearTeamIDArgs): Promise<GetLinearIntegrationByLinearTeamIDRow | null> {
    const rows = await sql.unsafe(getLinearIntegrationByLinearTeamIDQuery, [args.linearTeamId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const listLinearIntegrationsByUserQuery = `-- name: ListLinearIntegrationsByUser :many
SELECT id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at FROM linear_integrations
WHERE user_id = $1
ORDER BY created_at DESC`;

export interface ListLinearIntegrationsByUserArgs {
    userId: string;
}

export interface ListLinearIntegrationsByUserRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLinearIntegrationsByUser(sql: Sql, args: ListLinearIntegrationsByUserArgs): Promise<ListLinearIntegrationsByUserRow[]> {
    return (await sql.unsafe(listLinearIntegrationsByUserQuery, [args.userId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    }));
}

export const listLinearIntegrationsByRepoQuery = `-- name: ListLinearIntegrationsByRepo :many
SELECT id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at FROM linear_integrations
WHERE jjhub_repo_id = $1 AND is_active = TRUE
ORDER BY created_at DESC`;

export interface ListLinearIntegrationsByRepoArgs {
    jjhubRepoId: string;
}

export interface ListLinearIntegrationsByRepoRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLinearIntegrationsByRepo(sql: Sql, args: ListLinearIntegrationsByRepoArgs): Promise<ListLinearIntegrationsByRepoRow[]> {
    return (await sql.unsafe(listLinearIntegrationsByRepoQuery, [args.jjhubRepoId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    }));
}

export const listActiveLinearIntegrationsQuery = `-- name: ListActiveLinearIntegrations :many
SELECT id, user_id, org_id, linear_team_id, linear_team_name, linear_team_key, access_token_encrypted, refresh_token_encrypted, token_expires_at, webhook_secret, jjhub_repo_id, jjhub_repo_owner, jjhub_repo_name, linear_actor_id, is_active, last_sync_at, created_at, updated_at FROM linear_integrations
WHERE is_active = TRUE
ORDER BY id`;

export interface ListActiveLinearIntegrationsRow {
    id: string;
    userId: string;
    orgId: string | null;
    linearTeamId: string;
    linearTeamName: string;
    linearTeamKey: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
    webhookSecret: string;
    jjhubRepoId: string;
    jjhubRepoOwner: string;
    jjhubRepoName: string;
    linearActorId: string;
    isActive: boolean;
    lastSyncAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listActiveLinearIntegrations(sql: Sql): Promise<ListActiveLinearIntegrationsRow[]> {
    return (await sql.unsafe(listActiveLinearIntegrationsQuery, []).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        linearTeamId: row[3],
        linearTeamName: row[4],
        linearTeamKey: row[5],
        accessTokenEncrypted: row[6],
        refreshTokenEncrypted: row[7],
        tokenExpiresAt: row[8],
        webhookSecret: row[9],
        jjhubRepoId: row[10],
        jjhubRepoOwner: row[11],
        jjhubRepoName: row[12],
        linearActorId: row[13],
        isActive: row[14],
        lastSyncAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    }));
}

export const updateLinearIntegrationTokensQuery = `-- name: UpdateLinearIntegrationTokens :exec
UPDATE linear_integrations
SET access_token_encrypted = $2,
    refresh_token_encrypted = $3,
    token_expires_at = $4,
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateLinearIntegrationTokensArgs {
    id: string;
    accessTokenEncrypted: Buffer;
    refreshTokenEncrypted: Buffer | null;
    tokenExpiresAt: Date | null;
}

export async function updateLinearIntegrationTokens(sql: Sql, args: UpdateLinearIntegrationTokensArgs): Promise<void> {
    await sql.unsafe(updateLinearIntegrationTokensQuery, [args.id, args.accessTokenEncrypted, args.refreshTokenEncrypted, args.tokenExpiresAt]);
}

export const updateLinearIntegrationLastSyncQuery = `-- name: UpdateLinearIntegrationLastSync :exec
UPDATE linear_integrations
SET last_sync_at = NOW(),
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateLinearIntegrationLastSyncArgs {
    id: string;
}

export async function updateLinearIntegrationLastSync(sql: Sql, args: UpdateLinearIntegrationLastSyncArgs): Promise<void> {
    await sql.unsafe(updateLinearIntegrationLastSyncQuery, [args.id]);
}

export const updateLinearIntegrationActiveQuery = `-- name: UpdateLinearIntegrationActive :exec
UPDATE linear_integrations
SET is_active = $2,
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateLinearIntegrationActiveArgs {
    id: string;
    isActive: boolean;
}

export async function updateLinearIntegrationActive(sql: Sql, args: UpdateLinearIntegrationActiveArgs): Promise<void> {
    await sql.unsafe(updateLinearIntegrationActiveQuery, [args.id, args.isActive]);
}

export const deleteLinearIntegrationQuery = `-- name: DeleteLinearIntegration :exec
DELETE FROM linear_integrations WHERE id = $1 AND user_id = $2`;

export interface DeleteLinearIntegrationArgs {
    id: string;
    userId: string;
}

export async function deleteLinearIntegration(sql: Sql, args: DeleteLinearIntegrationArgs): Promise<void> {
    await sql.unsafe(deleteLinearIntegrationQuery, [args.id, args.userId]);
}

export const createLinearIssueMapQuery = `-- name: CreateLinearIssueMap :one
INSERT INTO linear_issue_map (
    integration_id, jjhub_issue_id, jjhub_issue_number,
    linear_issue_id, linear_identifier
)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, integration_id, jjhub_issue_id, jjhub_issue_number, linear_issue_id, linear_identifier, created_at, updated_at`;

export interface CreateLinearIssueMapArgs {
    integrationId: string;
    jjhubIssueId: string;
    jjhubIssueNumber: string;
    linearIssueId: string;
    linearIdentifier: string;
}

export interface CreateLinearIssueMapRow {
    id: string;
    integrationId: string;
    jjhubIssueId: string;
    jjhubIssueNumber: string;
    linearIssueId: string;
    linearIdentifier: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLinearIssueMap(sql: Sql, args: CreateLinearIssueMapArgs): Promise<CreateLinearIssueMapRow | null> {
    const rows = await sql.unsafe(createLinearIssueMapQuery, [args.integrationId, args.jjhubIssueId, args.jjhubIssueNumber, args.linearIssueId, args.linearIdentifier]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        integrationId: row[1],
        jjhubIssueId: row[2],
        jjhubIssueNumber: row[3],
        linearIssueId: row[4],
        linearIdentifier: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getLinearIssueMapByJJHubIssueQuery = `-- name: GetLinearIssueMapByJJHubIssue :one
SELECT id, integration_id, jjhub_issue_id, jjhub_issue_number, linear_issue_id, linear_identifier, created_at, updated_at FROM linear_issue_map
WHERE integration_id = $1 AND jjhub_issue_id = $2`;

export interface GetLinearIssueMapByJJHubIssueArgs {
    integrationId: string;
    jjhubIssueId: string;
}

export interface GetLinearIssueMapByJJHubIssueRow {
    id: string;
    integrationId: string;
    jjhubIssueId: string;
    jjhubIssueNumber: string;
    linearIssueId: string;
    linearIdentifier: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLinearIssueMapByJJHubIssue(sql: Sql, args: GetLinearIssueMapByJJHubIssueArgs): Promise<GetLinearIssueMapByJJHubIssueRow | null> {
    const rows = await sql.unsafe(getLinearIssueMapByJJHubIssueQuery, [args.integrationId, args.jjhubIssueId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        integrationId: row[1],
        jjhubIssueId: row[2],
        jjhubIssueNumber: row[3],
        linearIssueId: row[4],
        linearIdentifier: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getLinearIssueMapByLinearIssueQuery = `-- name: GetLinearIssueMapByLinearIssue :one
SELECT id, integration_id, jjhub_issue_id, jjhub_issue_number, linear_issue_id, linear_identifier, created_at, updated_at FROM linear_issue_map
WHERE integration_id = $1 AND linear_issue_id = $2`;

export interface GetLinearIssueMapByLinearIssueArgs {
    integrationId: string;
    linearIssueId: string;
}

export interface GetLinearIssueMapByLinearIssueRow {
    id: string;
    integrationId: string;
    jjhubIssueId: string;
    jjhubIssueNumber: string;
    linearIssueId: string;
    linearIdentifier: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLinearIssueMapByLinearIssue(sql: Sql, args: GetLinearIssueMapByLinearIssueArgs): Promise<GetLinearIssueMapByLinearIssueRow | null> {
    const rows = await sql.unsafe(getLinearIssueMapByLinearIssueQuery, [args.integrationId, args.linearIssueId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        integrationId: row[1],
        jjhubIssueId: row[2],
        jjhubIssueNumber: row[3],
        linearIssueId: row[4],
        linearIdentifier: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const listLinearIssueMapsQuery = `-- name: ListLinearIssueMaps :many
SELECT id, integration_id, jjhub_issue_id, jjhub_issue_number, linear_issue_id, linear_identifier, created_at, updated_at FROM linear_issue_map
WHERE integration_id = $1
ORDER BY created_at DESC`;

export interface ListLinearIssueMapsArgs {
    integrationId: string;
}

export interface ListLinearIssueMapsRow {
    id: string;
    integrationId: string;
    jjhubIssueId: string;
    jjhubIssueNumber: string;
    linearIssueId: string;
    linearIdentifier: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLinearIssueMaps(sql: Sql, args: ListLinearIssueMapsArgs): Promise<ListLinearIssueMapsRow[]> {
    return (await sql.unsafe(listLinearIssueMapsQuery, [args.integrationId]).values()).map(row => ({
        id: row[0],
        integrationId: row[1],
        jjhubIssueId: row[2],
        jjhubIssueNumber: row[3],
        linearIssueId: row[4],
        linearIdentifier: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const createLinearCommentMapQuery = `-- name: CreateLinearCommentMap :one
INSERT INTO linear_comment_map (issue_map_id, jjhub_comment_id, linear_comment_id)
VALUES ($1, $2, $3)
RETURNING id, issue_map_id, jjhub_comment_id, linear_comment_id, created_at`;

export interface CreateLinearCommentMapArgs {
    issueMapId: string;
    jjhubCommentId: string;
    linearCommentId: string;
}

export interface CreateLinearCommentMapRow {
    id: string;
    issueMapId: string;
    jjhubCommentId: string;
    linearCommentId: string;
    createdAt: Date;
}

export async function createLinearCommentMap(sql: Sql, args: CreateLinearCommentMapArgs): Promise<CreateLinearCommentMapRow | null> {
    const rows = await sql.unsafe(createLinearCommentMapQuery, [args.issueMapId, args.jjhubCommentId, args.linearCommentId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueMapId: row[1],
        jjhubCommentId: row[2],
        linearCommentId: row[3],
        createdAt: row[4]
    };
}

export const getLinearCommentMapByJJHubCommentQuery = `-- name: GetLinearCommentMapByJJHubComment :one
SELECT id, issue_map_id, jjhub_comment_id, linear_comment_id, created_at FROM linear_comment_map
WHERE issue_map_id = $1 AND jjhub_comment_id = $2`;

export interface GetLinearCommentMapByJJHubCommentArgs {
    issueMapId: string;
    jjhubCommentId: string;
}

export interface GetLinearCommentMapByJJHubCommentRow {
    id: string;
    issueMapId: string;
    jjhubCommentId: string;
    linearCommentId: string;
    createdAt: Date;
}

export async function getLinearCommentMapByJJHubComment(sql: Sql, args: GetLinearCommentMapByJJHubCommentArgs): Promise<GetLinearCommentMapByJJHubCommentRow | null> {
    const rows = await sql.unsafe(getLinearCommentMapByJJHubCommentQuery, [args.issueMapId, args.jjhubCommentId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueMapId: row[1],
        jjhubCommentId: row[2],
        linearCommentId: row[3],
        createdAt: row[4]
    };
}

export const getLinearCommentMapByLinearCommentQuery = `-- name: GetLinearCommentMapByLinearComment :one
SELECT id, issue_map_id, jjhub_comment_id, linear_comment_id, created_at FROM linear_comment_map
WHERE issue_map_id = $1 AND linear_comment_id = $2`;

export interface GetLinearCommentMapByLinearCommentArgs {
    issueMapId: string;
    linearCommentId: string;
}

export interface GetLinearCommentMapByLinearCommentRow {
    id: string;
    issueMapId: string;
    jjhubCommentId: string;
    linearCommentId: string;
    createdAt: Date;
}

export async function getLinearCommentMapByLinearComment(sql: Sql, args: GetLinearCommentMapByLinearCommentArgs): Promise<GetLinearCommentMapByLinearCommentRow | null> {
    const rows = await sql.unsafe(getLinearCommentMapByLinearCommentQuery, [args.issueMapId, args.linearCommentId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueMapId: row[1],
        jjhubCommentId: row[2],
        linearCommentId: row[3],
        createdAt: row[4]
    };
}

export const deleteLinearCommentMapByJJHubCommentQuery = `-- name: DeleteLinearCommentMapByJJHubComment :exec
DELETE FROM linear_comment_map
WHERE issue_map_id = $1 AND jjhub_comment_id = $2`;

export interface DeleteLinearCommentMapByJJHubCommentArgs {
    issueMapId: string;
    jjhubCommentId: string;
}

export async function deleteLinearCommentMapByJJHubComment(sql: Sql, args: DeleteLinearCommentMapByJJHubCommentArgs): Promise<void> {
    await sql.unsafe(deleteLinearCommentMapByJJHubCommentQuery, [args.issueMapId, args.jjhubCommentId]);
}

export const deleteLinearCommentMapByLinearCommentQuery = `-- name: DeleteLinearCommentMapByLinearComment :exec
DELETE FROM linear_comment_map
WHERE issue_map_id = $1 AND linear_comment_id = $2`;

export interface DeleteLinearCommentMapByLinearCommentArgs {
    issueMapId: string;
    linearCommentId: string;
}

export async function deleteLinearCommentMapByLinearComment(sql: Sql, args: DeleteLinearCommentMapByLinearCommentArgs): Promise<void> {
    await sql.unsafe(deleteLinearCommentMapByLinearCommentQuery, [args.issueMapId, args.linearCommentId]);
}

export const logLinearSyncOpQuery = `-- name: LogLinearSyncOp :one
INSERT INTO linear_sync_ops (
    integration_id, source, target, entity, entity_id, action, status, error_message
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, integration_id, source, target, entity, entity_id, action, status, error_message, created_at`;

export interface LogLinearSyncOpArgs {
    integrationId: string;
    source: string;
    target: string;
    entity: string;
    entityId: string;
    action: string;
    status: string;
    errorMessage: string;
}

export interface LogLinearSyncOpRow {
    id: string;
    integrationId: string;
    source: string;
    target: string;
    entity: string;
    entityId: string;
    action: string;
    status: string;
    errorMessage: string;
    createdAt: Date;
}

export async function logLinearSyncOp(sql: Sql, args: LogLinearSyncOpArgs): Promise<LogLinearSyncOpRow | null> {
    const rows = await sql.unsafe(logLinearSyncOpQuery, [args.integrationId, args.source, args.target, args.entity, args.entityId, args.action, args.status, args.errorMessage]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        integrationId: row[1],
        source: row[2],
        target: row[3],
        entity: row[4],
        entityId: row[5],
        action: row[6],
        status: row[7],
        errorMessage: row[8],
        createdAt: row[9]
    };
}

export const recentLinearSyncOpExistsQuery = `-- name: RecentLinearSyncOpExists :one
SELECT EXISTS (
    SELECT 1 FROM linear_sync_ops
    WHERE integration_id = $1
      AND entity = $2
      AND entity_id = $3
      AND action = $4
      AND status = 'success'
      AND created_at > NOW() - INTERVAL '5 seconds'
) AS exists`;

export interface RecentLinearSyncOpExistsArgs {
    integrationId: string;
    entity: string;
    entityId: string;
    action: string;
}

export interface RecentLinearSyncOpExistsRow {
    exists: boolean;
}

export async function recentLinearSyncOpExists(sql: Sql, args: RecentLinearSyncOpExistsArgs): Promise<RecentLinearSyncOpExistsRow | null> {
    const rows = await sql.unsafe(recentLinearSyncOpExistsQuery, [args.integrationId, args.entity, args.entityId, args.action]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        exists: row[0]
    };
}

