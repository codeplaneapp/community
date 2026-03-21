import { Sql } from "postgres";

export const createWorkspaceQuery = `-- name: CreateWorkspace :one

INSERT INTO workspaces (
    repository_id,
    user_id,
    name,
    is_fork,
    parent_workspace_id,
    source_snapshot_id,
    status
)
VALUES ($1, $2, $3, $4, $5, $6, $7::text)
RETURNING id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at`;

export interface CreateWorkspaceArgs {
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    status: string;
}

export interface CreateWorkspaceRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkspace(sql: Sql, args: CreateWorkspaceArgs): Promise<CreateWorkspaceRow | null> {
    const rows = await sql.unsafe(createWorkspaceQuery, [args.repositoryId, args.userId, args.name, args.isFork, args.parentWorkspaceId, args.sourceSnapshotId, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const getWorkspaceQuery = `-- name: GetWorkspace :one
SELECT id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at
FROM workspaces
WHERE id = $1`;

export interface GetWorkspaceArgs {
    id: string;
}

export interface GetWorkspaceRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkspace(sql: Sql, args: GetWorkspaceArgs): Promise<GetWorkspaceRow | null> {
    const rows = await sql.unsafe(getWorkspaceQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const getWorkspaceForUserRepoQuery = `-- name: GetWorkspaceForUserRepo :one
SELECT id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at
FROM workspaces
WHERE id = $1
  AND repository_id = $2
  AND user_id = $3`;

export interface GetWorkspaceForUserRepoArgs {
    id: string;
    repositoryId: string;
    userId: string;
}

export interface GetWorkspaceForUserRepoRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkspaceForUserRepo(sql: Sql, args: GetWorkspaceForUserRepoArgs): Promise<GetWorkspaceForUserRepoRow | null> {
    const rows = await sql.unsafe(getWorkspaceForUserRepoQuery, [args.id, args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const listWorkspacesByRepoQuery = `-- name: ListWorkspacesByRepo :many
SELECT id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at
FROM workspaces
WHERE repository_id = $1
  AND user_id = $2
ORDER BY created_at DESC
LIMIT $4 OFFSET $3`;

export interface ListWorkspacesByRepoArgs {
    repositoryId: string;
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkspacesByRepoRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkspacesByRepo(sql: Sql, args: ListWorkspacesByRepoArgs): Promise<ListWorkspacesByRepoRow[]> {
    return (await sql.unsafe(listWorkspacesByRepoQuery, [args.repositoryId, args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    }));
}

export const countWorkspacesByRepoQuery = `-- name: CountWorkspacesByRepo :one
SELECT COUNT(*)
FROM workspaces
WHERE repository_id = $1
  AND user_id = $2`;

export interface CountWorkspacesByRepoArgs {
    repositoryId: string;
    userId: string;
}

export interface CountWorkspacesByRepoRow {
    count: string;
}

export async function countWorkspacesByRepo(sql: Sql, args: CountWorkspacesByRepoArgs): Promise<CountWorkspacesByRepoRow | null> {
    const rows = await sql.unsafe(countWorkspacesByRepoQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const getActiveWorkspaceForUserRepoQuery = `-- name: GetActiveWorkspaceForUserRepo :one
SELECT id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at
FROM workspaces
WHERE repository_id = $1
  AND user_id = $2
  AND is_fork = FALSE
  AND (
    status IN ('running', 'suspended')
    OR (status = 'starting' AND vm_id <> '')
  )
LIMIT 1`;

export interface GetActiveWorkspaceForUserRepoArgs {
    repositoryId: string;
    userId: string;
}

export interface GetActiveWorkspaceForUserRepoRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getActiveWorkspaceForUserRepo(sql: Sql, args: GetActiveWorkspaceForUserRepoArgs): Promise<GetActiveWorkspaceForUserRepoRow | null> {
    const rows = await sql.unsafe(getActiveWorkspaceForUserRepoQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const updateWorkspaceStatusQuery = `-- name: UpdateWorkspaceStatus :one
UPDATE workspaces
SET status = $2::text,
    suspended_at = CASE
        WHEN $2::text = 'suspended' THEN NOW()
        WHEN $2::text = 'running' THEN NULL::timestamptz
        ELSE suspended_at
    END,
    updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at`;

export interface UpdateWorkspaceStatusArgs {
    id: string;
    status: string;
}

export interface UpdateWorkspaceStatusRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateWorkspaceStatus(sql: Sql, args: UpdateWorkspaceStatusArgs): Promise<UpdateWorkspaceStatusRow | null> {
    const rows = await sql.unsafe(updateWorkspaceStatusQuery, [args.id, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const updateWorkspaceExecutionInfoQuery = `-- name: UpdateWorkspaceExecutionInfo :one
UPDATE workspaces
SET vm_id = $2,
    status = $3::text,
    suspended_at = CASE
        WHEN $3::text = 'suspended' THEN NOW()
        WHEN $3::text = 'running' THEN NULL::timestamptz
        ELSE suspended_at
    END,
    updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at`;

export interface UpdateWorkspaceExecutionInfoArgs {
    id: string;
    vmId: string;
    status: string;
}

export interface UpdateWorkspaceExecutionInfoRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateWorkspaceExecutionInfo(sql: Sql, args: UpdateWorkspaceExecutionInfoArgs): Promise<UpdateWorkspaceExecutionInfoRow | null> {
    const rows = await sql.unsafe(updateWorkspaceExecutionInfoQuery, [args.id, args.vmId, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const updateWorkspaceSessionSSHConnectionInfoQuery = `-- name: UpdateWorkspaceSessionSSHConnectionInfo :one
UPDATE workspace_sessions
SET ssh_connection_info = $2,
    updated_at = NOW()
WHERE id = $1
RETURNING id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at`;

export interface UpdateWorkspaceSessionSSHConnectionInfoArgs {
    id: string;
    sshConnectionInfo: any;
}

export interface UpdateWorkspaceSessionSSHConnectionInfoRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateWorkspaceSessionSSHConnectionInfo(sql: Sql, args: UpdateWorkspaceSessionSSHConnectionInfoArgs): Promise<UpdateWorkspaceSessionSSHConnectionInfoRow | null> {
    const rows = await sql.unsafe(updateWorkspaceSessionSSHConnectionInfoQuery, [args.id, args.sshConnectionInfo]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const createWorkspaceSnapshotQuery = `-- name: CreateWorkspaceSnapshot :one

INSERT INTO workspace_snapshots (
    repository_id,
    user_id,
    workspace_id,
    name,
    snapshot_id
)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, repository_id, user_id, workspace_id, name, snapshot_id, created_at, updated_at`;

export interface CreateWorkspaceSnapshotArgs {
    repositoryId: string;
    userId: string;
    workspaceId: string;
    name: string;
    snapshotId: string;
}

export interface CreateWorkspaceSnapshotRow {
    id: string;
    repositoryId: string;
    userId: string;
    workspaceId: string;
    name: string;
    snapshotId: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkspaceSnapshot(sql: Sql, args: CreateWorkspaceSnapshotArgs): Promise<CreateWorkspaceSnapshotRow | null> {
    const rows = await sql.unsafe(createWorkspaceSnapshotQuery, [args.repositoryId, args.userId, args.workspaceId, args.name, args.snapshotId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workspaceId: row[3],
        name: row[4],
        snapshotId: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getWorkspaceSnapshotQuery = `-- name: GetWorkspaceSnapshot :one
SELECT id, repository_id, user_id, workspace_id, name, snapshot_id, created_at, updated_at
FROM workspace_snapshots
WHERE id = $1`;

export interface GetWorkspaceSnapshotArgs {
    id: string;
}

export interface GetWorkspaceSnapshotRow {
    id: string;
    repositoryId: string;
    userId: string;
    workspaceId: string;
    name: string;
    snapshotId: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkspaceSnapshot(sql: Sql, args: GetWorkspaceSnapshotArgs): Promise<GetWorkspaceSnapshotRow | null> {
    const rows = await sql.unsafe(getWorkspaceSnapshotQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workspaceId: row[3],
        name: row[4],
        snapshotId: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getWorkspaceSnapshotForUserRepoQuery = `-- name: GetWorkspaceSnapshotForUserRepo :one
SELECT id, repository_id, user_id, workspace_id, name, snapshot_id, created_at, updated_at
FROM workspace_snapshots
WHERE id = $1
  AND repository_id = $2
  AND user_id = $3`;

export interface GetWorkspaceSnapshotForUserRepoArgs {
    id: string;
    repositoryId: string;
    userId: string;
}

export interface GetWorkspaceSnapshotForUserRepoRow {
    id: string;
    repositoryId: string;
    userId: string;
    workspaceId: string;
    name: string;
    snapshotId: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkspaceSnapshotForUserRepo(sql: Sql, args: GetWorkspaceSnapshotForUserRepoArgs): Promise<GetWorkspaceSnapshotForUserRepoRow | null> {
    const rows = await sql.unsafe(getWorkspaceSnapshotForUserRepoQuery, [args.id, args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workspaceId: row[3],
        name: row[4],
        snapshotId: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const listWorkspaceSnapshotsByRepoQuery = `-- name: ListWorkspaceSnapshotsByRepo :many
SELECT id, repository_id, user_id, workspace_id, name, snapshot_id, created_at, updated_at
FROM workspace_snapshots
WHERE repository_id = $1
  AND user_id = $2
ORDER BY created_at DESC
LIMIT $4 OFFSET $3`;

export interface ListWorkspaceSnapshotsByRepoArgs {
    repositoryId: string;
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkspaceSnapshotsByRepoRow {
    id: string;
    repositoryId: string;
    userId: string;
    workspaceId: string;
    name: string;
    snapshotId: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkspaceSnapshotsByRepo(sql: Sql, args: ListWorkspaceSnapshotsByRepoArgs): Promise<ListWorkspaceSnapshotsByRepoRow[]> {
    return (await sql.unsafe(listWorkspaceSnapshotsByRepoQuery, [args.repositoryId, args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workspaceId: row[3],
        name: row[4],
        snapshotId: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const countWorkspaceSnapshotsByRepoQuery = `-- name: CountWorkspaceSnapshotsByRepo :one
SELECT COUNT(*)
FROM workspace_snapshots
WHERE repository_id = $1
  AND user_id = $2`;

export interface CountWorkspaceSnapshotsByRepoArgs {
    repositoryId: string;
    userId: string;
}

export interface CountWorkspaceSnapshotsByRepoRow {
    count: string;
}

export async function countWorkspaceSnapshotsByRepo(sql: Sql, args: CountWorkspaceSnapshotsByRepoArgs): Promise<CountWorkspaceSnapshotsByRepoRow | null> {
    const rows = await sql.unsafe(countWorkspaceSnapshotsByRepoQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const deleteWorkspaceSnapshotQuery = `-- name: DeleteWorkspaceSnapshot :exec
DELETE FROM workspace_snapshots
WHERE id = $1`;

export interface DeleteWorkspaceSnapshotArgs {
    id: string;
}

export async function deleteWorkspaceSnapshot(sql: Sql, args: DeleteWorkspaceSnapshotArgs): Promise<void> {
    await sql.unsafe(deleteWorkspaceSnapshotQuery, [args.id]);
}

export const notifyWorkspaceStatusQuery = `-- name: NotifyWorkspaceStatus :exec

SELECT pg_notify(
    'workspace_status_' || replace($1::text, '-', ''),
    $2::text
)`;

export interface NotifyWorkspaceStatusArgs {
    sessionId: string;
    payload: string;
}

export interface NotifyWorkspaceStatusRow {
    pgNotify: string;
}

export async function notifyWorkspaceStatus(sql: Sql, args: NotifyWorkspaceStatusArgs): Promise<void> {
    await sql.unsafe(notifyWorkspaceStatusQuery, [args.sessionId, args.payload]);
}

export const upsertWorkspaceWorkflowDefinitionQuery = `-- name: UpsertWorkspaceWorkflowDefinition :one

INSERT INTO workflow_definitions (repository_id, name, path, config)
VALUES ($1, 'Workspace', '.codeplane/workspace', '{"workspace": true}'::jsonb)
ON CONFLICT (repository_id, path) DO UPDATE SET updated_at = NOW()
RETURNING id, repository_id, name, path, config, is_active, created_at, updated_at`;

export interface UpsertWorkspaceWorkflowDefinitionArgs {
    repositoryId: string;
}

export interface UpsertWorkspaceWorkflowDefinitionRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertWorkspaceWorkflowDefinition(sql: Sql, args: UpsertWorkspaceWorkflowDefinitionArgs): Promise<UpsertWorkspaceWorkflowDefinitionRow | null> {
    const rows = await sql.unsafe(upsertWorkspaceWorkflowDefinitionQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        path: row[3],
        config: row[4],
        isActive: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const createWorkspaceSessionQuery = `-- name: CreateWorkspaceSession :one

INSERT INTO workspace_sessions (workspace_id, repository_id, user_id, cols, rows)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at`;

export interface CreateWorkspaceSessionArgs {
    workspaceId: string;
    repositoryId: string;
    userId: string;
    cols: number;
    rows: number;
}

export interface CreateWorkspaceSessionRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkspaceSession(sql: Sql, args: CreateWorkspaceSessionArgs): Promise<CreateWorkspaceSessionRow | null> {
    const rows = await sql.unsafe(createWorkspaceSessionQuery, [args.workspaceId, args.repositoryId, args.userId, args.cols, args.rows]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const getWorkspaceSessionQuery = `-- name: GetWorkspaceSession :one
SELECT id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at
FROM workspace_sessions
WHERE id = $1`;

export interface GetWorkspaceSessionArgs {
    id: string;
}

export interface GetWorkspaceSessionRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkspaceSession(sql: Sql, args: GetWorkspaceSessionArgs): Promise<GetWorkspaceSessionRow | null> {
    const rows = await sql.unsafe(getWorkspaceSessionQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const getWorkspaceSessionForUserRepoQuery = `-- name: GetWorkspaceSessionForUserRepo :one
SELECT id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at
FROM workspace_sessions
WHERE id = $1
  AND repository_id = $2
  AND user_id = $3`;

export interface GetWorkspaceSessionForUserRepoArgs {
    id: string;
    repositoryId: string;
    userId: string;
}

export interface GetWorkspaceSessionForUserRepoRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkspaceSessionForUserRepo(sql: Sql, args: GetWorkspaceSessionForUserRepoArgs): Promise<GetWorkspaceSessionForUserRepoRow | null> {
    const rows = await sql.unsafe(getWorkspaceSessionForUserRepoQuery, [args.id, args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const listWorkspaceSessionsByRepoQuery = `-- name: ListWorkspaceSessionsByRepo :many
SELECT id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at
FROM workspace_sessions
WHERE repository_id = $1
  AND user_id = $2
ORDER BY created_at DESC
LIMIT $4 OFFSET $3`;

export interface ListWorkspaceSessionsByRepoArgs {
    repositoryId: string;
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkspaceSessionsByRepoRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkspaceSessionsByRepo(sql: Sql, args: ListWorkspaceSessionsByRepoArgs): Promise<ListWorkspaceSessionsByRepoRow[]> {
    return (await sql.unsafe(listWorkspaceSessionsByRepoQuery, [args.repositoryId, args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const countWorkspaceSessionsByRepoQuery = `-- name: CountWorkspaceSessionsByRepo :one
SELECT COUNT(*)
FROM workspace_sessions
WHERE repository_id = $1
  AND user_id = $2`;

export interface CountWorkspaceSessionsByRepoArgs {
    repositoryId: string;
    userId: string;
}

export interface CountWorkspaceSessionsByRepoRow {
    count: string;
}

export async function countWorkspaceSessionsByRepo(sql: Sql, args: CountWorkspaceSessionsByRepoArgs): Promise<CountWorkspaceSessionsByRepoRow | null> {
    const rows = await sql.unsafe(countWorkspaceSessionsByRepoQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const updateWorkspaceSessionStatusQuery = `-- name: UpdateWorkspaceSessionStatus :one
UPDATE workspace_sessions
SET status = $2, updated_at = NOW()
WHERE id = $1
RETURNING id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at`;

export interface UpdateWorkspaceSessionStatusArgs {
    id: string;
    status: string;
}

export interface UpdateWorkspaceSessionStatusRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateWorkspaceSessionStatus(sql: Sql, args: UpdateWorkspaceSessionStatusArgs): Promise<UpdateWorkspaceSessionStatusRow | null> {
    const rows = await sql.unsafe(updateWorkspaceSessionStatusQuery, [args.id, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const touchWorkspaceSessionActivityQuery = `-- name: TouchWorkspaceSessionActivity :exec
UPDATE workspace_sessions
SET last_activity_at = NOW(), updated_at = NOW()
WHERE id = $1`;

export interface TouchWorkspaceSessionActivityArgs {
    id: string;
}

export async function touchWorkspaceSessionActivity(sql: Sql, args: TouchWorkspaceSessionActivityArgs): Promise<void> {
    await sql.unsafe(touchWorkspaceSessionActivityQuery, [args.id]);
}

export const touchWorkspaceActivityQuery = `-- name: TouchWorkspaceActivity :exec

UPDATE workspaces
SET last_activity_at = NOW(), updated_at = NOW()
WHERE id = $1`;

export interface TouchWorkspaceActivityArgs {
    id: string;
}

export async function touchWorkspaceActivity(sql: Sql, args: TouchWorkspaceActivityArgs): Promise<void> {
    await sql.unsafe(touchWorkspaceActivityQuery, [args.id]);
}

export const listPendingSessionsForWorkspaceQuery = `-- name: ListPendingSessionsForWorkspace :many
SELECT id, workspace_id, repository_id, user_id, ssh_connection_info, status, cols, rows, last_activity_at, idle_timeout_secs, created_at, updated_at
FROM workspace_sessions
WHERE workspace_id = $1
  AND status IN ('pending', 'starting')`;

export interface ListPendingSessionsForWorkspaceArgs {
    workspaceId: string;
}

export interface ListPendingSessionsForWorkspaceRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function listPendingSessionsForWorkspace(sql: Sql, args: ListPendingSessionsForWorkspaceArgs): Promise<ListPendingSessionsForWorkspaceRow[]> {
    return (await sql.unsafe(listPendingSessionsForWorkspaceQuery, [args.workspaceId]).values()).map(row => ({
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const countActiveSessionsForWorkspaceQuery = `-- name: CountActiveSessionsForWorkspace :one

SELECT COUNT(*)
FROM workspace_sessions
WHERE workspace_id = $1
  AND status IN ('pending', 'starting', 'running')`;

export interface CountActiveSessionsForWorkspaceArgs {
    workspaceId: string;
}

export interface CountActiveSessionsForWorkspaceRow {
    count: string;
}

export async function countActiveSessionsForWorkspace(sql: Sql, args: CountActiveSessionsForWorkspaceArgs): Promise<CountActiveSessionsForWorkspaceRow | null> {
    const rows = await sql.unsafe(countActiveSessionsForWorkspaceQuery, [args.workspaceId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countActiveSessionsForUserQuery = `-- name: CountActiveSessionsForUser :one
SELECT COUNT(*)
FROM workspace_sessions
WHERE user_id = $1
  AND status IN ('pending', 'starting', 'running')`;

export interface CountActiveSessionsForUserArgs {
    userId: string;
}

export interface CountActiveSessionsForUserRow {
    count: string;
}

export async function countActiveSessionsForUser(sql: Sql, args: CountActiveSessionsForUserArgs): Promise<CountActiveSessionsForUserRow | null> {
    const rows = await sql.unsafe(countActiveSessionsForUserQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listIdleWorkspacesQuery = `-- name: ListIdleWorkspaces :many
SELECT w.id, w.repository_id, w.user_id, w.name, w.is_fork, w.parent_workspace_id, w.source_snapshot_id, w.vm_id, w.status, w.last_activity_at, w.idle_timeout_secs, w.suspended_at, w.created_at, w.updated_at
FROM workspaces w
WHERE w.status = 'running'
  AND NOW() > w.last_activity_at + make_interval(secs => w.idle_timeout_secs)`;

export interface ListIdleWorkspacesRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listIdleWorkspaces(sql: Sql): Promise<ListIdleWorkspacesRow[]> {
    return (await sql.unsafe(listIdleWorkspacesQuery, []).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    }));
}

export const listStalePendingWorkspacesQuery = `-- name: ListStalePendingWorkspaces :many
SELECT id, repository_id, user_id, name, is_fork, parent_workspace_id, source_snapshot_id, vm_id, status, last_activity_at, idle_timeout_secs, suspended_at, created_at, updated_at
FROM workspaces
WHERE status IN ('pending', 'starting')
  AND vm_id = ''
  AND updated_at < NOW() - make_interval(secs => $1::int)
ORDER BY updated_at ASC`;

export interface ListStalePendingWorkspacesArgs {
    staleAfterSecs: number;
}

export interface ListStalePendingWorkspacesRow {
    id: string;
    repositoryId: string;
    userId: string;
    name: string;
    isFork: boolean;
    parentWorkspaceId: string;
    sourceSnapshotId: string;
    vmId: string;
    status: string;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    suspendedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listStalePendingWorkspaces(sql: Sql, args: ListStalePendingWorkspacesArgs): Promise<ListStalePendingWorkspacesRow[]> {
    return (await sql.unsafe(listStalePendingWorkspacesQuery, [args.staleAfterSecs]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        name: row[3],
        isFork: row[4],
        parentWorkspaceId: row[5],
        sourceSnapshotId: row[6],
        vmId: row[7],
        status: row[8],
        lastActivityAt: row[9],
        idleTimeoutSecs: row[10],
        suspendedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    }));
}

export const listIdleWorkspaceSessionsQuery = `-- name: ListIdleWorkspaceSessions :many
SELECT s.id, s.workspace_id, s.repository_id, s.user_id, s.ssh_connection_info, s.status, s.cols, s.rows, s.last_activity_at, s.idle_timeout_secs, s.created_at, s.updated_at
FROM workspace_sessions s
WHERE s.status = 'running'
  AND NOW() > s.last_activity_at + make_interval(secs => s.idle_timeout_secs)`;

export interface ListIdleWorkspaceSessionsRow {
    id: string;
    workspaceId: string;
    repositoryId: string;
    userId: string;
    sshConnectionInfo: any;
    status: string;
    cols: number;
    rows: number;
    lastActivityAt: Date;
    idleTimeoutSecs: number;
    createdAt: Date;
    updatedAt: Date;
}

export async function listIdleWorkspaceSessions(sql: Sql): Promise<ListIdleWorkspaceSessionsRow[]> {
    return (await sql.unsafe(listIdleWorkspaceSessionsQuery, []).values()).map(row => ({
        id: row[0],
        workspaceId: row[1],
        repositoryId: row[2],
        userId: row[3],
        sshConnectionInfo: row[4],
        status: row[5],
        cols: row[6],
        rows: row[7],
        lastActivityAt: row[8],
        idleTimeoutSecs: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

