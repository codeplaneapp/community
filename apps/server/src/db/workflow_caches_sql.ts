import { Sql } from "postgres";

export const getWorkflowCacheByIDQuery = `-- name: GetWorkflowCacheByID :one
SELECT id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at
FROM workflow_caches
WHERE id = $1`;

export interface GetWorkflowCacheByIDArgs {
    id: string;
}

export interface GetWorkflowCacheByIDRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowCacheByID(sql: Sql, args: GetWorkflowCacheByIDArgs): Promise<GetWorkflowCacheByIDRow | null> {
    const rows = await sql.unsafe(getWorkflowCacheByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const getWorkflowCacheByScopeVersionQuery = `-- name: GetWorkflowCacheByScopeVersion :one
SELECT id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at
FROM workflow_caches
WHERE repository_id = $1
  AND bookmark_name = $2
  AND cache_key = $3
  AND cache_version = $4
LIMIT 1`;

export interface GetWorkflowCacheByScopeVersionArgs {
    repositoryId: string;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
}

export interface GetWorkflowCacheByScopeVersionRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowCacheByScopeVersion(sql: Sql, args: GetWorkflowCacheByScopeVersionArgs): Promise<GetWorkflowCacheByScopeVersionRow | null> {
    const rows = await sql.unsafe(getWorkflowCacheByScopeVersionQuery, [args.repositoryId, args.bookmarkName, args.cacheKey, args.cacheVersion]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const findWorkflowCacheForRestoreQuery = `-- name: FindWorkflowCacheForRestore :one
SELECT id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at
FROM workflow_caches
WHERE repository_id = $1
  AND status = 'finalized'
  AND expires_at > NOW()
  AND cache_key = $2
  AND cache_version = $3
  AND bookmark_name IN ($4, $5)
ORDER BY
    CASE
        WHEN bookmark_name = $4 THEN 0
        ELSE 1
    END,
    finalized_at DESC NULLS LAST,
    id DESC
LIMIT 1`;

export interface FindWorkflowCacheForRestoreArgs {
    repositoryId: string;
    cacheKey: string;
    cacheVersion: string;
    bookmarkName: string;
    defaultBookmark: string;
}

export interface FindWorkflowCacheForRestoreRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function findWorkflowCacheForRestore(sql: Sql, args: FindWorkflowCacheForRestoreArgs): Promise<FindWorkflowCacheForRestoreRow | null> {
    const rows = await sql.unsafe(findWorkflowCacheForRestoreQuery, [args.repositoryId, args.cacheKey, args.cacheVersion, args.bookmarkName, args.defaultBookmark]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const upsertPendingWorkflowCacheQuery = `-- name: UpsertPendingWorkflowCache :one
WITH upserted AS (
    INSERT INTO workflow_caches (
        repository_id,
        workflow_run_id,
        bookmark_name,
        cache_key,
        cache_version,
        object_key,
        compression,
        status,
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
        'pending',
        $8
    )
    ON CONFLICT (repository_id, bookmark_name, cache_key, cache_version)
    DO UPDATE SET
        workflow_run_id = EXCLUDED.workflow_run_id,
        object_key = EXCLUDED.object_key,
        compression = EXCLUDED.compression,
        status = 'pending',
        object_size_bytes = 0,
        finalized_at = NULL,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    WHERE workflow_caches.status <> 'finalized'
      AND (
        workflow_caches.workflow_run_id IS NULL
        OR workflow_caches.workflow_run_id = EXCLUDED.workflow_run_id
        OR workflow_caches.expires_at <= NOW()
      )
    RETURNING id
),
selected AS (
    SELECT id
    FROM upserted
    UNION ALL
    SELECT id
    FROM workflow_caches
    WHERE repository_id = $1
      AND bookmark_name = $3
      AND cache_key = $4
      AND cache_version = $5
      AND NOT EXISTS (SELECT 1 FROM upserted)
)
SELECT workflow_caches.id, workflow_caches.repository_id, workflow_caches.workflow_run_id, workflow_caches.bookmark_name, workflow_caches.cache_key, workflow_caches.cache_version, workflow_caches.object_key, workflow_caches.object_size_bytes, workflow_caches.compression, workflow_caches.status, workflow_caches.hit_count, workflow_caches.last_hit_at, workflow_caches.finalized_at, workflow_caches.expires_at, workflow_caches.created_at, workflow_caches.updated_at
FROM workflow_caches
JOIN selected ON selected.id = workflow_caches.id`;

export interface UpsertPendingWorkflowCacheArgs {
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    compression: string;
    expiresAt: Date;
}

export interface UpsertPendingWorkflowCacheRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertPendingWorkflowCache(sql: Sql, args: UpsertPendingWorkflowCacheArgs): Promise<UpsertPendingWorkflowCacheRow | null> {
    const rows = await sql.unsafe(upsertPendingWorkflowCacheQuery, [args.repositoryId, args.workflowRunId, args.bookmarkName, args.cacheKey, args.cacheVersion, args.objectKey, args.compression, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const finalizeWorkflowCacheQuery = `-- name: FinalizeWorkflowCache :one
UPDATE workflow_caches
SET status = 'finalized',
    object_size_bytes = $1,
    expires_at = $2,
    finalized_at = NOW(),
    updated_at = NOW()
WHERE id = $3
  AND status = 'pending'
RETURNING id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at`;

export interface FinalizeWorkflowCacheArgs {
    objectSizeBytes: string;
    expiresAt: Date;
    id: string;
}

export interface FinalizeWorkflowCacheRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function finalizeWorkflowCache(sql: Sql, args: FinalizeWorkflowCacheArgs): Promise<FinalizeWorkflowCacheRow | null> {
    const rows = await sql.unsafe(finalizeWorkflowCacheQuery, [args.objectSizeBytes, args.expiresAt, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const touchWorkflowCacheHitQuery = `-- name: TouchWorkflowCacheHit :exec
UPDATE workflow_caches
SET hit_count = hit_count + 1,
    last_hit_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND status = 'finalized'`;

export interface TouchWorkflowCacheHitArgs {
    id: string;
}

export async function touchWorkflowCacheHit(sql: Sql, args: TouchWorkflowCacheHitArgs): Promise<void> {
    await sql.unsafe(touchWorkflowCacheHitQuery, [args.id]);
}

export const listWorkflowCachesQuery = `-- name: ListWorkflowCaches :many
SELECT id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at
FROM workflow_caches
WHERE repository_id = $1
  AND status = 'finalized'
  AND (
    $2::text = ''
    OR bookmark_name = $2
  )
  AND (
    $3::text = ''
    OR cache_key = $3
  )
ORDER BY updated_at DESC, id DESC
LIMIT $5
OFFSET $4`;

export interface ListWorkflowCachesArgs {
    repositoryId: string;
    bookmarkName: string;
    cacheKey: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkflowCachesRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowCaches(sql: Sql, args: ListWorkflowCachesArgs): Promise<ListWorkflowCachesRow[]> {
    return (await sql.unsafe(listWorkflowCachesQuery, [args.repositoryId, args.bookmarkName, args.cacheKey, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    }));
}

export const listWorkflowCachesForClearQuery = `-- name: ListWorkflowCachesForClear :many
SELECT id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at
FROM workflow_caches
WHERE repository_id = $1
  AND status = 'finalized'
  AND (
    $2::text = ''
    OR bookmark_name = $2
  )
  AND (
    $3::text = ''
    OR cache_key = $3
  )
ORDER BY updated_at DESC, id DESC`;

export interface ListWorkflowCachesForClearArgs {
    repositoryId: string;
    bookmarkName: string;
    cacheKey: string;
}

export interface ListWorkflowCachesForClearRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowCachesForClear(sql: Sql, args: ListWorkflowCachesForClearArgs): Promise<ListWorkflowCachesForClearRow[]> {
    return (await sql.unsafe(listWorkflowCachesForClearQuery, [args.repositoryId, args.bookmarkName, args.cacheKey]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    }));
}

export const deleteWorkflowCacheByIDQuery = `-- name: DeleteWorkflowCacheByID :one
DELETE FROM workflow_caches
WHERE id = $1
RETURNING id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at`;

export interface DeleteWorkflowCacheByIDArgs {
    id: string;
}

export interface DeleteWorkflowCacheByIDRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function deleteWorkflowCacheByID(sql: Sql, args: DeleteWorkflowCacheByIDArgs): Promise<DeleteWorkflowCacheByIDRow | null> {
    const rows = await sql.unsafe(deleteWorkflowCacheByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    };
}

export const getWorkflowCacheRepoUsageQuery = `-- name: GetWorkflowCacheRepoUsage :one
SELECT COALESCE(SUM(object_size_bytes), 0)::bigint
FROM workflow_caches
WHERE repository_id = $1
  AND status = 'finalized'`;

export interface GetWorkflowCacheRepoUsageArgs {
    repositoryId: string;
}

export interface GetWorkflowCacheRepoUsageRow {
    value: string;
}

export async function getWorkflowCacheRepoUsage(sql: Sql, args: GetWorkflowCacheRepoUsageArgs): Promise<GetWorkflowCacheRepoUsageRow | null> {
    const rows = await sql.unsafe(getWorkflowCacheRepoUsageQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        value: row[0]
    };
}

export const getWorkflowCacheStatsQuery = `-- name: GetWorkflowCacheStats :one
SELECT
    COALESCE(COUNT(*) FILTER (WHERE status = 'finalized'), 0)::bigint AS cache_count,
    COALESCE(SUM(object_size_bytes) FILTER (WHERE status = 'finalized'), 0)::bigint AS total_size_bytes,
    MAX(last_hit_at) FILTER (WHERE status = 'finalized') AS last_hit_at,
    MAX(expires_at) FILTER (WHERE status = 'finalized') AS max_expires_at
FROM workflow_caches
WHERE repository_id = $1`;

export interface GetWorkflowCacheStatsArgs {
    repositoryId: string;
}

export interface GetWorkflowCacheStatsRow {
    cacheCount: string;
    totalSizeBytes: string;
    lastHitAt: string;
    maxExpiresAt: string;
}

export async function getWorkflowCacheStats(sql: Sql, args: GetWorkflowCacheStatsArgs): Promise<GetWorkflowCacheStatsRow | null> {
    const rows = await sql.unsafe(getWorkflowCacheStatsQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        cacheCount: row[0],
        totalSizeBytes: row[1],
        lastHitAt: row[2],
        maxExpiresAt: row[3]
    };
}

export const listWorkflowCacheRepositoryIDsQuery = `-- name: ListWorkflowCacheRepositoryIDs :many
SELECT DISTINCT repository_id
FROM workflow_caches
ORDER BY repository_id ASC`;

export interface ListWorkflowCacheRepositoryIDsRow {
    repositoryId: string;
}

export async function listWorkflowCacheRepositoryIDs(sql: Sql): Promise<ListWorkflowCacheRepositoryIDsRow[]> {
    return (await sql.unsafe(listWorkflowCacheRepositoryIDsQuery, []).values()).map(row => ({
        repositoryId: row[0]
    }));
}

export const listWorkflowCacheEvictionCandidatesQuery = `-- name: ListWorkflowCacheEvictionCandidates :many
SELECT id, repository_id, workflow_run_id, bookmark_name, cache_key, cache_version, object_key, object_size_bytes, compression, status, hit_count, last_hit_at, finalized_at, expires_at, created_at, updated_at
FROM workflow_caches
WHERE repository_id = $1
  AND status IN ('pending', 'finalized')
ORDER BY
    CASE
        WHEN expires_at <= NOW() THEN 0
        WHEN status = 'finalized' THEN 1
        ELSE 2
    END,
    COALESCE(last_hit_at, finalized_at, updated_at, created_at) ASC,
    id ASC
LIMIT $2`;

export interface ListWorkflowCacheEvictionCandidatesArgs {
    repositoryId: string;
    limitCount: string;
}

export interface ListWorkflowCacheEvictionCandidatesRow {
    id: string;
    repositoryId: string;
    workflowRunId: string | null;
    bookmarkName: string;
    cacheKey: string;
    cacheVersion: string;
    objectKey: string;
    objectSizeBytes: string;
    compression: string;
    status: string;
    hitCount: string;
    lastHitAt: Date | null;
    finalizedAt: Date | null;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowCacheEvictionCandidates(sql: Sql, args: ListWorkflowCacheEvictionCandidatesArgs): Promise<ListWorkflowCacheEvictionCandidatesRow[]> {
    return (await sql.unsafe(listWorkflowCacheEvictionCandidatesQuery, [args.repositoryId, args.limitCount]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowRunId: row[2],
        bookmarkName: row[3],
        cacheKey: row[4],
        cacheVersion: row[5],
        objectKey: row[6],
        objectSizeBytes: row[7],
        compression: row[8],
        status: row[9],
        hitCount: row[10],
        lastHitAt: row[11],
        finalizedAt: row[12],
        expiresAt: row[13],
        createdAt: row[14],
        updatedAt: row[15]
    }));
}
