import { Sql } from "postgres";

export const upsertRunnerQuery = `-- name: UpsertRunner :one
INSERT INTO runner_pool (name, status, last_heartbeat_at, metadata)
VALUES ($1, 'idle', NOW(), $2)
ON CONFLICT (name) DO UPDATE
SET status = CASE
                 WHEN runner_pool.status IN ('busy', 'draining') THEN runner_pool.status
                 ELSE 'idle'
             END,
    metadata = EXCLUDED.metadata,
    last_heartbeat_at = NOW(),
    updated_at = NOW()
RETURNING id, name, status, last_heartbeat_at, metadata, created_at, updated_at`;

export interface UpsertRunnerArgs {
    name: string;
    metadata: any;
}

export interface UpsertRunnerRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertRunner(sql: Sql, args: UpsertRunnerArgs): Promise<UpsertRunnerRow | null> {
    const rows = await sql.unsafe(upsertRunnerQuery, [args.name, args.metadata]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const touchRunnerHeartbeatQuery = `-- name: TouchRunnerHeartbeat :one
UPDATE runner_pool
SET last_heartbeat_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING id, name, status, last_heartbeat_at, metadata, created_at, updated_at`;

export interface TouchRunnerHeartbeatArgs {
    id: string;
}

export interface TouchRunnerHeartbeatRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function touchRunnerHeartbeat(sql: Sql, args: TouchRunnerHeartbeatArgs): Promise<TouchRunnerHeartbeatRow | null> {
    const rows = await sql.unsafe(touchRunnerHeartbeatQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const claimIdleRunnerQuery = `-- name: ClaimIdleRunner :one
UPDATE runner_pool
SET status = 'busy',
    updated_at = NOW()
WHERE id = $1
  AND status = 'idle'
RETURNING id, name, status, last_heartbeat_at, metadata, created_at, updated_at`;

export interface ClaimIdleRunnerArgs {
    id: string;
}

export interface ClaimIdleRunnerRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function claimIdleRunner(sql: Sql, args: ClaimIdleRunnerArgs): Promise<ClaimIdleRunnerRow | null> {
    const rows = await sql.unsafe(claimIdleRunnerQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const releaseRunnerQuery = `-- name: ReleaseRunner :execrows
UPDATE runner_pool
SET status = 'idle',
    updated_at = NOW()
WHERE id = $1
  AND status = 'busy'`;

export interface ReleaseRunnerArgs {
    id: string;
}

export const terminateRunnerQuery = `-- name: TerminateRunner :one
UPDATE runner_pool
SET status = 'offline',
    updated_at = NOW()
WHERE id = $1
  AND status <> 'offline'
RETURNING id, name, status, last_heartbeat_at, metadata, created_at, updated_at`;

export interface TerminateRunnerArgs {
    id: string;
}

export interface TerminateRunnerRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function terminateRunner(sql: Sql, args: TerminateRunnerArgs): Promise<TerminateRunnerRow | null> {
    const rows = await sql.unsafe(terminateRunnerQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const listStaleRunnersQuery = `-- name: ListStaleRunners :many
SELECT id, name, status, last_heartbeat_at, metadata, created_at, updated_at
FROM runner_pool
WHERE status IN ('idle', 'busy', 'draining')
  AND last_heartbeat_at IS NOT NULL
  AND last_heartbeat_at < $1
ORDER BY id`;

export interface ListStaleRunnersArgs {
    cutoffAt: Date | null;
}

export interface ListStaleRunnersRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function listStaleRunners(sql: Sql, args: ListStaleRunnersArgs): Promise<ListStaleRunnersRow[]> {
    return (await sql.unsafe(listStaleRunnersQuery, [args.cutoffAt]).values()).map(row => ({
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const claimAvailableRunnerQuery = `-- name: ClaimAvailableRunner :one
WITH candidate AS (
    SELECT id
    FROM runner_pool
    WHERE status = 'idle'
      AND last_heartbeat_at IS NOT NULL
      AND last_heartbeat_at > NOW() - $1::interval
    ORDER BY id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE runner_pool rp
SET status = 'busy',
    updated_at = NOW()
FROM candidate
WHERE rp.id = candidate.id
RETURNING rp.id, rp.name, rp.status, rp.last_heartbeat_at, rp.metadata, rp.created_at, rp.updated_at`;

export interface ClaimAvailableRunnerArgs {
    maxStaleness: string;
}

export interface ClaimAvailableRunnerRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function claimAvailableRunner(sql: Sql, args: ClaimAvailableRunnerArgs): Promise<ClaimAvailableRunnerRow | null> {
    const rows = await sql.unsafe(claimAvailableRunnerQuery, [args.maxStaleness]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const listRunnersQuery = `-- name: ListRunners :many
SELECT id, name, status, last_heartbeat_at, metadata, created_at, updated_at
FROM runner_pool
WHERE (
        $1::text = ''
        OR status = $1::text
    )
ORDER BY id DESC
LIMIT $3
OFFSET $2`;

export interface ListRunnersArgs {
    statusFilter: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListRunnersRow {
    id: string;
    name: string;
    status: string;
    lastHeartbeatAt: Date | null;
    metadata: any;
    createdAt: Date;
    updatedAt: Date;
}

export async function listRunners(sql: Sql, args: ListRunnersArgs): Promise<ListRunnersRow[]> {
    return (await sql.unsafe(listRunnersQuery, [args.statusFilter, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        name: row[1],
        status: row[2],
        lastHeartbeatAt: row[3],
        metadata: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const countRunnersQuery = `-- name: CountRunners :one
SELECT COUNT(*) AS count
FROM runner_pool
WHERE (
        $1::text = ''
        OR status = $1::text
    )`;

export interface CountRunnersArgs {
    statusFilter: string;
}

export interface CountRunnersRow {
    count: string;
}

export async function countRunners(sql: Sql, args: CountRunnersArgs): Promise<CountRunnersRow | null> {
    const rows = await sql.unsafe(countRunnersQuery, [args.statusFilter]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const cleanupStaleRunnersQuery = `-- name: CleanupStaleRunners :execrows
UPDATE runner_pool
SET status = 'offline',
    updated_at = NOW()
WHERE status IN ('idle', 'busy')
  AND last_heartbeat_at IS NOT NULL
  AND last_heartbeat_at < NOW() - $1::interval`;

export interface CleanupStaleRunnersArgs {
    staleInterval: string;
}

