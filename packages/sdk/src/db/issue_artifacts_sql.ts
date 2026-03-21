import { Sql } from "postgres";

export const createIssueArtifactQuery = `-- name: CreateIssueArtifact :one
WITH next_artifact AS (
    SELECT nextval(pg_get_serial_sequence('issue_artifacts', 'id')) AS id
)
INSERT INTO issue_artifacts (
    id,
    repository_id,
    issue_id,
    name,
    step_name,
    size,
    content_type,
    status,
    gcs_key,
    expires_at
)
SELECT
    next_artifact.id,
    args.repository_id,
    args.issue_id,
    args.name,
    args.step_name,
    args.size,
    args.content_type,
    'pending',
    concat(
        'repos/',
        args.repository_id,
        '/issues/',
        args.issue_id,
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
        $4::text,
        $5::bigint,
        $6::text,
        $7::timestamptz
    )
) AS args(repository_id, issue_id, name, step_name, size, content_type, expires_at)
RETURNING
    id,
    repository_id,
    issue_id,
    name,
    step_name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    created_at,
    updated_at`;

export interface CreateIssueArtifactArgs {
    repositoryId: string;
    issueId: string;
    name: string;
    stepName: string;
    size: string;
    contentType: string;
    expiresAt: Date;
}

export interface CreateIssueArtifactRow {
    id: string;
    repositoryId: string;
    issueId: string;
    name: string;
    stepName: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function createIssueArtifact(sql: Sql, args: CreateIssueArtifactArgs): Promise<CreateIssueArtifactRow | null> {
    const rows = await sql.unsafe(createIssueArtifactQuery, [args.repositoryId, args.issueId, args.name, args.stepName, args.size, args.contentType, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        name: row[3],
        stepName: row[4],
        size: row[5],
        contentType: row[6],
        status: row[7],
        gcsKey: row[8],
        confirmedAt: row[9],
        expiresAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const confirmIssueArtifactUploadQuery = `-- name: ConfirmIssueArtifactUpload :one
UPDATE issue_artifacts
SET status = 'ready',
    confirmed_at = COALESCE(confirmed_at, NOW()),
    updated_at = NOW()
WHERE issue_id = $1
  AND name = $2
RETURNING
    id,
    repository_id,
    issue_id,
    name,
    step_name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    created_at,
    updated_at`;

export interface ConfirmIssueArtifactUploadArgs {
    issueId: string;
    name: string;
}

export interface ConfirmIssueArtifactUploadRow {
    id: string;
    repositoryId: string;
    issueId: string;
    name: string;
    stepName: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function confirmIssueArtifactUpload(sql: Sql, args: ConfirmIssueArtifactUploadArgs): Promise<ConfirmIssueArtifactUploadRow | null> {
    const rows = await sql.unsafe(confirmIssueArtifactUploadQuery, [args.issueId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        name: row[3],
        stepName: row[4],
        size: row[5],
        contentType: row[6],
        status: row[7],
        gcsKey: row[8],
        confirmedAt: row[9],
        expiresAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const listIssueArtifactsByIssueQuery = `-- name: ListIssueArtifactsByIssue :many
SELECT
    id,
    repository_id,
    issue_id,
    name,
    step_name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    created_at,
    updated_at
FROM issue_artifacts
WHERE issue_id = $1
ORDER BY created_at DESC, id DESC`;

export interface ListIssueArtifactsByIssueArgs {
    issueId: string;
}

export interface ListIssueArtifactsByIssueRow {
    id: string;
    repositoryId: string;
    issueId: string;
    name: string;
    stepName: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listIssueArtifactsByIssue(sql: Sql, args: ListIssueArtifactsByIssueArgs): Promise<ListIssueArtifactsByIssueRow[]> {
    return (await sql.unsafe(listIssueArtifactsByIssueQuery, [args.issueId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        name: row[3],
        stepName: row[4],
        size: row[5],
        contentType: row[6],
        status: row[7],
        gcsKey: row[8],
        confirmedAt: row[9],
        expiresAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    }));
}

export const getIssueArtifactByNameQuery = `-- name: GetIssueArtifactByName :one
SELECT
    id,
    repository_id,
    issue_id,
    name,
    step_name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    created_at,
    updated_at
FROM issue_artifacts
WHERE issue_id = $1
  AND name = $2`;

export interface GetIssueArtifactByNameArgs {
    issueId: string;
    name: string;
}

export interface GetIssueArtifactByNameRow {
    id: string;
    repositoryId: string;
    issueId: string;
    name: string;
    stepName: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function getIssueArtifactByName(sql: Sql, args: GetIssueArtifactByNameArgs): Promise<GetIssueArtifactByNameRow | null> {
    const rows = await sql.unsafe(getIssueArtifactByNameQuery, [args.issueId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        name: row[3],
        stepName: row[4],
        size: row[5],
        contentType: row[6],
        status: row[7],
        gcsKey: row[8],
        confirmedAt: row[9],
        expiresAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const deleteIssueArtifactQuery = `-- name: DeleteIssueArtifact :exec
DELETE FROM issue_artifacts
WHERE issue_id = $1
  AND name = $2`;

export interface DeleteIssueArtifactArgs {
    issueId: string;
    name: string;
}

export async function deleteIssueArtifact(sql: Sql, args: DeleteIssueArtifactArgs): Promise<void> {
    await sql.unsafe(deleteIssueArtifactQuery, [args.issueId, args.name]);
}

export const deleteIssueArtifactByIDQuery = `-- name: DeleteIssueArtifactByID :exec
DELETE FROM issue_artifacts
WHERE id = $1`;

export interface DeleteIssueArtifactByIDArgs {
    id: string;
}

export async function deleteIssueArtifactByID(sql: Sql, args: DeleteIssueArtifactByIDArgs): Promise<void> {
    await sql.unsafe(deleteIssueArtifactByIDQuery, [args.id]);
}

export const pruneExpiredIssueArtifactsQuery = `-- name: PruneExpiredIssueArtifacts :many
DELETE FROM issue_artifacts
WHERE id IN (
    SELECT ia.id
    FROM issue_artifacts AS ia
    WHERE ia.expires_at <= $1
    ORDER BY ia.expires_at ASC, ia.id ASC
    LIMIT $2
)
RETURNING
    id,
    repository_id,
    issue_id,
    name,
    step_name,
    size,
    content_type,
    status,
    gcs_key,
    confirmed_at,
    expires_at,
    created_at,
    updated_at`;

export interface PruneExpiredIssueArtifactsArgs {
    expiresBefore: Date;
    limitRows: string;
}

export interface PruneExpiredIssueArtifactsRow {
    id: string;
    repositoryId: string;
    issueId: string;
    name: string;
    stepName: string;
    size: string;
    contentType: string;
    status: string;
    gcsKey: string;
    confirmedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function pruneExpiredIssueArtifacts(sql: Sql, args: PruneExpiredIssueArtifactsArgs): Promise<PruneExpiredIssueArtifactsRow[]> {
    return (await sql.unsafe(pruneExpiredIssueArtifactsQuery, [args.expiresBefore, args.limitRows]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        name: row[3],
        stepName: row[4],
        size: row[5],
        contentType: row[6],
        status: row[7],
        gcsKey: row[8],
        confirmedAt: row[9],
        expiresAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    }));
}

export const getIssueIDByRepoAndNumberQuery = `-- name: GetIssueIDByRepoAndNumber :one
SELECT id
FROM issues
WHERE repository_id = $1
  AND number = $2`;

export interface GetIssueIDByRepoAndNumberArgs {
    repositoryId: string;
    number: string;
}

export interface GetIssueIDByRepoAndNumberRow {
    id: string;
}

export async function getIssueIDByRepoAndNumber(sql: Sql, args: GetIssueIDByRepoAndNumberArgs): Promise<GetIssueIDByRepoAndNumberRow | null> {
    const rows = await sql.unsafe(getIssueIDByRepoAndNumberQuery, [args.repositoryId, args.number]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0]
    };
}

