import { Sql } from "postgres";

export const createWorkflowArtifactQuery = `-- name: CreateWorkflowArtifact :one
WITH next_artifact AS (
    SELECT nextval(pg_get_serial_sequence('workflow_artifacts', 'id')) AS id
)
INSERT INTO workflow_artifacts (
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    expires_at
)
SELECT
    next_artifact.id,
    args.repository_id,
    args.workflow_run_id,
    args.name,
    args.size,
    args.content_type,
    'pending',
    concat(
        'repos/',
        args.repository_id,
        '/runs/',
        args.workflow_run_id,
        '/artifacts/',
        next_artifact.id,
        '/',
        args.name
    ),
    args.expires_at
FROM next_artifact
CROSS JOIN (
    VALUES (
        $1::bigint,
        $2::bigint,
        $3::text,
        $4::bigint,
        $5::text,
        $6::timestamptz
    )
) AS args(repository_id, workflow_run_id, name, size, content_type, expires_at)
RETURNING
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    release_tag,
    release_asset_name,
    release_attached_at,
    created_at,
    updated_at`;

export interface CreateWorkflowArtifactArgs {
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    expiresAt: Date;
}

export interface CreateWorkflowArtifactRow {
    id: string;
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    releaseTag: string | null;
    releaseAssetName: string | null;
    releaseAttachedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkflowArtifact(sql: Sql, args: CreateWorkflowArtifactArgs): Promise<CreateWorkflowArtifactRow | null> {
    const rows = await sql.unsafe(createWorkflowArtifactQuery, [args.repositoryId, args.workflowRunId, args.name, args.size, args.contentType, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        name: row[3],
        size: row[4],
        contentType: row[5],
        status: row[6],
        gcsKey: row[7],
        confirmedAt: row[8],
        expiresAt: row[9],
        releaseTag: row[10],
        releaseAssetName: row[11],
        releaseAttachedAt: row[12],
        createdAt: row[13],
        updatedAt: row[14]
    };
}

export const confirmWorkflowArtifactUploadQuery = `-- name: ConfirmWorkflowArtifactUpload :one
UPDATE workflow_artifacts
SET status = 'ready',
    confirmed_at = COALESCE(confirmed_at, NOW()),
    updated_at = NOW()
WHERE workflow_run_id = $1
  AND name = $2
RETURNING
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    release_tag,
    release_asset_name,
    release_attached_at,
    created_at,
    updated_at`;

export interface ConfirmWorkflowArtifactUploadArgs {
    workflowRunId: string;
    name: string;
}

export interface ConfirmWorkflowArtifactUploadRow {
    id: string;
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    releaseTag: string | null;
    releaseAssetName: string | null;
    releaseAttachedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function confirmWorkflowArtifactUpload(sql: Sql, args: ConfirmWorkflowArtifactUploadArgs): Promise<ConfirmWorkflowArtifactUploadRow | null> {
    const rows = await sql.unsafe(confirmWorkflowArtifactUploadQuery, [args.workflowRunId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        name: row[3],
        size: row[4],
        contentType: row[5],
        status: row[6],
        gcsKey: row[7],
        confirmedAt: row[8],
        expiresAt: row[9],
        releaseTag: row[10],
        releaseAssetName: row[11],
        releaseAttachedAt: row[12],
        createdAt: row[13],
        updatedAt: row[14]
    };
}

export const getWorkflowDefinitionNameByRunIDQuery = `-- name: GetWorkflowDefinitionNameByRunID :one
SELECT wd.name
FROM workflow_runs AS wr
JOIN workflow_definitions AS wd ON wd.id = wr.workflow_definition_id
WHERE wr.id = $1`;

export interface GetWorkflowDefinitionNameByRunIDArgs {
    id: string;
}

export interface GetWorkflowDefinitionNameByRunIDRow {
    name: string;
}

export async function getWorkflowDefinitionNameByRunID(sql: Sql, args: GetWorkflowDefinitionNameByRunIDArgs): Promise<GetWorkflowDefinitionNameByRunIDRow | null> {
    const rows = await sql.unsafe(getWorkflowDefinitionNameByRunIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        name: row[0]
    };
}

export const listWorkflowArtifactsByRunQuery = `-- name: ListWorkflowArtifactsByRun :many
SELECT
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    release_tag,
    release_asset_name,
    release_attached_at,
    created_at,
    updated_at
FROM workflow_artifacts
WHERE workflow_run_id = $1
ORDER BY created_at DESC, id DESC`;

export interface ListWorkflowArtifactsByRunArgs {
    workflowRunId: string;
}

export interface ListWorkflowArtifactsByRunRow {
    id: string;
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    releaseTag: string | null;
    releaseAssetName: string | null;
    releaseAttachedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowArtifactsByRun(sql: Sql, args: ListWorkflowArtifactsByRunArgs): Promise<ListWorkflowArtifactsByRunRow[]> {
    return (await sql.unsafe(listWorkflowArtifactsByRunQuery, [args.workflowRunId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        name: row[3],
        size: row[4],
        contentType: row[5],
        status: row[6],
        gcsKey: row[7],
        confirmedAt: row[8],
        expiresAt: row[9],
        releaseTag: row[10],
        releaseAssetName: row[11],
        releaseAttachedAt: row[12],
        createdAt: row[13],
        updatedAt: row[14]
    }));
}

export const getWorkflowArtifactByNameQuery = `-- name: GetWorkflowArtifactByName :one
SELECT
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    release_tag,
    release_asset_name,
    release_attached_at,
    created_at,
    updated_at
FROM workflow_artifacts
WHERE workflow_run_id = $1
  AND name = $2`;

export interface GetWorkflowArtifactByNameArgs {
    workflowRunId: string;
    name: string;
}

export interface GetWorkflowArtifactByNameRow {
    id: string;
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    releaseTag: string | null;
    releaseAssetName: string | null;
    releaseAttachedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowArtifactByName(sql: Sql, args: GetWorkflowArtifactByNameArgs): Promise<GetWorkflowArtifactByNameRow | null> {
    const rows = await sql.unsafe(getWorkflowArtifactByNameQuery, [args.workflowRunId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        name: row[3],
        size: row[4],
        contentType: row[5],
        status: row[6],
        gcsKey: row[7],
        confirmedAt: row[8],
        expiresAt: row[9],
        releaseTag: row[10],
        releaseAssetName: row[11],
        releaseAttachedAt: row[12],
        createdAt: row[13],
        updatedAt: row[14]
    };
}

export const deleteWorkflowArtifactQuery = `-- name: DeleteWorkflowArtifact :exec
DELETE FROM workflow_artifacts
WHERE workflow_run_id = $1
  AND name = $2`;

export interface DeleteWorkflowArtifactArgs {
    workflowRunId: string;
    name: string;
}

export async function deleteWorkflowArtifact(sql: Sql, args: DeleteWorkflowArtifactArgs): Promise<void> {
    await sql.unsafe(deleteWorkflowArtifactQuery, [args.workflowRunId, args.name]);
}

export const deleteWorkflowArtifactByIDQuery = `-- name: DeleteWorkflowArtifactByID :exec
DELETE FROM workflow_artifacts
WHERE id = $1`;

export interface DeleteWorkflowArtifactByIDArgs {
    id: string;
}

export async function deleteWorkflowArtifactByID(sql: Sql, args: DeleteWorkflowArtifactByIDArgs): Promise<void> {
    await sql.unsafe(deleteWorkflowArtifactByIDQuery, [args.id]);
}

export const pruneExpiredWorkflowArtifactsQuery = `-- name: PruneExpiredWorkflowArtifacts :many
DELETE FROM workflow_artifacts
WHERE id IN (
    SELECT wa.id
    FROM workflow_artifacts AS wa
    WHERE wa.expires_at <= $1
    ORDER BY wa.expires_at ASC, wa.id ASC
    LIMIT $2
)
RETURNING
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    release_tag,
    release_asset_name,
    release_attached_at,
    created_at,
    updated_at`;

export interface PruneExpiredWorkflowArtifactsArgs {
    expiresBefore: Date;
    limitRows: string;
}

export interface PruneExpiredWorkflowArtifactsRow {
    id: string;
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    releaseTag: string | null;
    releaseAssetName: string | null;
    releaseAttachedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function pruneExpiredWorkflowArtifacts(sql: Sql, args: PruneExpiredWorkflowArtifactsArgs): Promise<PruneExpiredWorkflowArtifactsRow[]> {
    return (await sql.unsafe(pruneExpiredWorkflowArtifactsQuery, [args.expiresBefore, args.limitRows]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        name: row[3],
        size: row[4],
        contentType: row[5],
        status: row[6],
        gcsKey: row[7],
        confirmedAt: row[8],
        expiresAt: row[9],
        releaseTag: row[10],
        releaseAssetName: row[11],
        releaseAttachedAt: row[12],
        createdAt: row[13],
        updatedAt: row[14]
    }));
}

export const attachWorkflowArtifactToReleaseQuery = `-- name: AttachWorkflowArtifactToRelease :one
UPDATE workflow_artifacts
SET release_tag = $1,
    release_asset_name = $2,
    release_attached_at = NOW(),
    updated_at = NOW()
WHERE workflow_run_id = $3
  AND name = $4
RETURNING
    id,
    repository_id,
    workflow_run_id,
    name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    release_tag,
    release_asset_name,
    release_attached_at,
    created_at,
    updated_at`;

export interface AttachWorkflowArtifactToReleaseArgs {
    releaseTag: string | null;
    releaseAssetName: string | null;
    workflowRunId: string;
    name: string;
}

export interface AttachWorkflowArtifactToReleaseRow {
    id: string;
    repositoryId: string;
    workflowRunId: string;
    name: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    releaseTag: string | null;
    releaseAssetName: string | null;
    releaseAttachedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function attachWorkflowArtifactToRelease(sql: Sql, args: AttachWorkflowArtifactToReleaseArgs): Promise<AttachWorkflowArtifactToReleaseRow | null> {
    const rows = await sql.unsafe(attachWorkflowArtifactToReleaseQuery, [args.releaseTag, args.releaseAssetName, args.workflowRunId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        name: row[3],
        size: row[4],
        contentType: row[5],
        status: row[6],
        gcsKey: row[7],
        confirmedAt: row[8],
        expiresAt: row[9],
        releaseTag: row[10],
        releaseAssetName: row[11],
        releaseAttachedAt: row[12],
        createdAt: row[13],
        updatedAt: row[14]
    };
}

