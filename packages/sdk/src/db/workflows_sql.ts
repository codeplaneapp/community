import { Sql } from "postgres";

export const createWorkflowDefinitionQuery = `-- name: CreateWorkflowDefinition :one
INSERT INTO workflow_definitions (repository_id, name, path, config)
VALUES ($1, $2, $3, $4)
RETURNING id, repository_id, name, path, config, is_active, created_at, updated_at`;

export interface CreateWorkflowDefinitionArgs {
    repositoryId: string;
    name: string;
    path: string;
    config: any;
}

export interface CreateWorkflowDefinitionRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkflowDefinition(sql: Sql, args: CreateWorkflowDefinitionArgs): Promise<CreateWorkflowDefinitionRow | null> {
    const rows = await sql.unsafe(createWorkflowDefinitionQuery, [args.repositoryId, args.name, args.path, args.config]).values();
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

export const listBlockedTasksForRunQuery = `-- name: ListBlockedTasksForRun :many
SELECT wt.id, wt.payload, ws.name as step_name
FROM workflow_tasks wt
JOIN workflow_steps ws ON ws.id = wt.workflow_step_id
WHERE wt.workflow_run_id = $1
  AND wt.status = 'blocked'`;

export interface ListBlockedTasksForRunArgs {
    workflowRunId: string;
}

export interface ListBlockedTasksForRunRow {
    id: string;
    payload: any;
    stepName: string;
}

export async function listBlockedTasksForRun(sql: Sql, args: ListBlockedTasksForRunArgs): Promise<ListBlockedTasksForRunRow[]> {
    return (await sql.unsafe(listBlockedTasksForRunQuery, [args.workflowRunId]).values()).map(row => ({
        id: row[0],
        payload: row[1],
        stepName: row[2]
    }));
}

export const listTaskStepInfoForRunQuery = `-- name: ListTaskStepInfoForRun :many
SELECT wt.id, wt.status, ws.name as step_name
FROM workflow_tasks wt
JOIN workflow_steps ws ON ws.id = wt.workflow_step_id
WHERE wt.workflow_run_id = $1`;

export interface ListTaskStepInfoForRunArgs {
    workflowRunId: string;
}

export interface ListTaskStepInfoForRunRow {
    id: string;
    status: string;
    stepName: string;
}

export async function listTaskStepInfoForRun(sql: Sql, args: ListTaskStepInfoForRunArgs): Promise<ListTaskStepInfoForRunRow[]> {
    return (await sql.unsafe(listTaskStepInfoForRunQuery, [args.workflowRunId]).values()).map(row => ({
        id: row[0],
        status: row[1],
        stepName: row[2]
    }));
}

export const unblockWorkflowTaskQuery = `-- name: UnblockWorkflowTask :exec
UPDATE workflow_tasks
SET status = 'pending',
    available_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND status = 'blocked'`;

export interface UnblockWorkflowTaskArgs {
    id: string;
}

export async function unblockWorkflowTask(sql: Sql, args: UnblockWorkflowTaskArgs): Promise<void> {
    await sql.unsafe(unblockWorkflowTaskQuery, [args.id]);
}

export const skipBlockedWorkflowTaskQuery = `-- name: SkipBlockedWorkflowTask :exec
UPDATE workflow_tasks
SET status = 'skipped',
    finished_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND status = 'blocked'`;

export interface SkipBlockedWorkflowTaskArgs {
    id: string;
}

export async function skipBlockedWorkflowTask(sql: Sql, args: SkipBlockedWorkflowTaskArgs): Promise<void> {
    await sql.unsafe(skipBlockedWorkflowTaskQuery, [args.id]);
}

export const upsertWorkflowDefinitionQuery = `-- name: UpsertWorkflowDefinition :one
INSERT INTO workflow_definitions (repository_id, name, path, config, is_active)
VALUES ($1, $2, $3, $4, TRUE)
ON CONFLICT (repository_id, path)
DO UPDATE SET
  name = EXCLUDED.name,
  config = EXCLUDED.config,
  is_active = TRUE,
  updated_at = NOW()
RETURNING id, repository_id, name, path, config, is_active, created_at, updated_at`;

export interface UpsertWorkflowDefinitionArgs {
    repositoryId: string;
    name: string;
    path: string;
    config: any;
}

export interface UpsertWorkflowDefinitionRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertWorkflowDefinition(sql: Sql, args: UpsertWorkflowDefinitionArgs): Promise<UpsertWorkflowDefinitionRow | null> {
    const rows = await sql.unsafe(upsertWorkflowDefinitionQuery, [args.repositoryId, args.name, args.path, args.config]).values();
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

export const deactivateWorkflowDefinitionByPathQuery = `-- name: DeactivateWorkflowDefinitionByPath :exec
UPDATE workflow_definitions
SET is_active = FALSE,
    updated_at = NOW()
WHERE repository_id = $1
  AND path = $2`;

export interface DeactivateWorkflowDefinitionByPathArgs {
    repositoryId: string;
    path: string;
}

export async function deactivateWorkflowDefinitionByPath(sql: Sql, args: DeactivateWorkflowDefinitionByPathArgs): Promise<void> {
    await sql.unsafe(deactivateWorkflowDefinitionByPathQuery, [args.repositoryId, args.path]);
}

export const ensureWorkflowDefinitionReferenceQuery = `-- name: EnsureWorkflowDefinitionReference :one
INSERT INTO workflow_definitions (repository_id, name, path, config, is_active)
VALUES ($1, $2, $3, $4, FALSE)
ON CONFLICT (repository_id, path)
DO UPDATE SET
  updated_at = NOW()
RETURNING id, repository_id, name, path, config, is_active, created_at, updated_at`;

export interface EnsureWorkflowDefinitionReferenceArgs {
    repositoryId: string;
    name: string;
    path: string;
    config: any;
}

export interface EnsureWorkflowDefinitionReferenceRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function ensureWorkflowDefinitionReference(sql: Sql, args: EnsureWorkflowDefinitionReferenceArgs): Promise<EnsureWorkflowDefinitionReferenceRow | null> {
    const rows = await sql.unsafe(ensureWorkflowDefinitionReferenceQuery, [args.repositoryId, args.name, args.path, args.config]).values();
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

export const upsertAgentWorkflowDefinitionQuery = `-- name: UpsertAgentWorkflowDefinition :one
INSERT INTO workflow_definitions (repository_id, name, path, config)
VALUES ($1, 'Agent', '.jjhub/agent', '{"agent": true}'::jsonb)
ON CONFLICT (repository_id, path) DO UPDATE SET updated_at = NOW()
RETURNING id, repository_id, name, path, config, is_active, created_at, updated_at`;

export interface UpsertAgentWorkflowDefinitionArgs {
    repositoryId: string;
}

export interface UpsertAgentWorkflowDefinitionRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertAgentWorkflowDefinition(sql: Sql, args: UpsertAgentWorkflowDefinitionArgs): Promise<UpsertAgentWorkflowDefinitionRow | null> {
    const rows = await sql.unsafe(upsertAgentWorkflowDefinitionQuery, [args.repositoryId]).values();
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

export const getWorkflowDefinitionQuery = `-- name: GetWorkflowDefinition :one
SELECT id, repository_id, name, path, config, is_active, created_at, updated_at
FROM workflow_definitions
WHERE id = $1
  AND repository_id = $2`;

export interface GetWorkflowDefinitionArgs {
    id: string;
    repositoryId: string;
}

export interface GetWorkflowDefinitionRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowDefinition(sql: Sql, args: GetWorkflowDefinitionArgs): Promise<GetWorkflowDefinitionRow | null> {
    const rows = await sql.unsafe(getWorkflowDefinitionQuery, [args.id, args.repositoryId]).values();
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

export const getWorkflowDefinitionByPathQuery = `-- name: GetWorkflowDefinitionByPath :one
SELECT id, repository_id, name, path, config, is_active, created_at, updated_at
FROM workflow_definitions
WHERE repository_id = $1
  AND path = $2`;

export interface GetWorkflowDefinitionByPathArgs {
    repositoryId: string;
    path: string;
}

export interface GetWorkflowDefinitionByPathRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowDefinitionByPath(sql: Sql, args: GetWorkflowDefinitionByPathArgs): Promise<GetWorkflowDefinitionByPathRow | null> {
    const rows = await sql.unsafe(getWorkflowDefinitionByPathQuery, [args.repositoryId, args.path]).values();
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

export const getWorkflowRunQuery = `-- name: GetWorkflowRun :one
SELECT id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at
FROM workflow_runs
WHERE id = $1
  AND repository_id = $2`;

export interface GetWorkflowRunArgs {
    id: string;
    repositoryId: string;
}

export interface GetWorkflowRunRow {
    id: string;
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    dispatchInputs: any | null;
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowRun(sql: Sql, args: GetWorkflowRunArgs): Promise<GetWorkflowRunRow | null> {
    const rows = await sql.unsafe(getWorkflowRunQuery, [args.id, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowDefinitionId: row[2],
        status: row[3],
        triggerEvent: row[4],
        triggerRef: row[5],
        triggerCommitSha: row[6],
        dispatchInputs: row[7],
        agentTokenHash: row[8],
        agentTokenExpiresAt: row[9],
        startedAt: row[10],
        completedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const getWorkflowRunByRunIDQuery = `-- name: GetWorkflowRunByRunID :one
SELECT id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at
FROM workflow_runs
WHERE id = $1`;

export interface GetWorkflowRunByRunIDArgs {
    id: string;
}

export interface GetWorkflowRunByRunIDRow {
    id: string;
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    dispatchInputs: any | null;
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowRunByRunID(sql: Sql, args: GetWorkflowRunByRunIDArgs): Promise<GetWorkflowRunByRunIDRow | null> {
    const rows = await sql.unsafe(getWorkflowRunByRunIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowDefinitionId: row[2],
        status: row[3],
        triggerEvent: row[4],
        triggerRef: row[5],
        triggerCommitSha: row[6],
        dispatchInputs: row[7],
        agentTokenHash: row[8],
        agentTokenExpiresAt: row[9],
        startedAt: row[10],
        completedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const listWorkflowRunsByDefinitionQuery = `-- name: ListWorkflowRunsByDefinition :many
SELECT id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at
FROM workflow_runs
WHERE workflow_definition_id = $1
  AND repository_id = $2
ORDER BY id DESC
LIMIT $4
OFFSET $3`;

export interface ListWorkflowRunsByDefinitionArgs {
    workflowDefinitionId: string;
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkflowRunsByDefinitionRow {
    id: string;
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    dispatchInputs: any | null;
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowRunsByDefinition(sql: Sql, args: ListWorkflowRunsByDefinitionArgs): Promise<ListWorkflowRunsByDefinitionRow[]> {
    return (await sql.unsafe(listWorkflowRunsByDefinitionQuery, [args.workflowDefinitionId, args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowDefinitionId: row[2],
        status: row[3],
        triggerEvent: row[4],
        triggerRef: row[5],
        triggerCommitSha: row[6],
        dispatchInputs: row[7],
        agentTokenHash: row[8],
        agentTokenExpiresAt: row[9],
        startedAt: row[10],
        completedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    }));
}

export const listWorkflowDefinitionsByRepoQuery = `-- name: ListWorkflowDefinitionsByRepo :many
SELECT id, repository_id, name, path, config, is_active, created_at, updated_at
FROM workflow_definitions
WHERE repository_id = $1
ORDER BY id DESC
LIMIT $3
OFFSET $2`;

export interface ListWorkflowDefinitionsByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkflowDefinitionsByRepoRow {
    id: string;
    repositoryId: string;
    name: string;
    path: string;
    config: any;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowDefinitionsByRepo(sql: Sql, args: ListWorkflowDefinitionsByRepoArgs): Promise<ListWorkflowDefinitionsByRepoRow[]> {
    return (await sql.unsafe(listWorkflowDefinitionsByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        path: row[3],
        config: row[4],
        isActive: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const createWorkflowRunQuery = `-- name: CreateWorkflowRun :one
INSERT INTO workflow_runs (repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at`;

export interface CreateWorkflowRunArgs {
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    dispatchInputs: any | null;
}

export interface CreateWorkflowRunRow {
    id: string;
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    dispatchInputs: any | null;
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkflowRun(sql: Sql, args: CreateWorkflowRunArgs): Promise<CreateWorkflowRunRow | null> {
    const rows = await sql.unsafe(createWorkflowRunQuery, [args.repositoryId, args.workflowDefinitionId, args.status, args.triggerEvent, args.triggerRef, args.triggerCommitSha, args.dispatchInputs]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        workflowDefinitionId: row[2],
        status: row[3],
        triggerEvent: row[4],
        triggerRef: row[5],
        triggerCommitSha: row[6],
        dispatchInputs: row[7],
        agentTokenHash: row[8],
        agentTokenExpiresAt: row[9],
        startedAt: row[10],
        completedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    };
}

export const listWorkflowRunsByRepoQuery = `-- name: ListWorkflowRunsByRepo :many
SELECT id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at
FROM workflow_runs
WHERE repository_id = $1
ORDER BY id DESC
LIMIT $3
OFFSET $2`;

export interface ListWorkflowRunsByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWorkflowRunsByRepoRow {
    id: string;
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    dispatchInputs: any | null;
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWorkflowRunsByRepo(sql: Sql, args: ListWorkflowRunsByRepoArgs): Promise<ListWorkflowRunsByRepoRow[]> {
    return (await sql.unsafe(listWorkflowRunsByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        workflowDefinitionId: row[2],
        status: row[3],
        triggerEvent: row[4],
        triggerRef: row[5],
        triggerCommitSha: row[6],
        dispatchInputs: row[7],
        agentTokenHash: row[8],
        agentTokenExpiresAt: row[9],
        startedAt: row[10],
        completedAt: row[11],
        createdAt: row[12],
        updatedAt: row[13]
    }));
}

export const createWorkflowStepQuery = `-- name: CreateWorkflowStep :one
INSERT INTO workflow_steps (workflow_run_id, name, position, status)
VALUES ($1, $2, $3, $4)
RETURNING id, workflow_run_id, name, position, status, started_at, completed_at, created_at, updated_at`;

export interface CreateWorkflowStepArgs {
    workflowRunId: string;
    name: string;
    position: string;
    status: string;
}

export interface CreateWorkflowStepRow {
    id: string;
    workflowRunId: string;
    name: string;
    position: string;
    status: string;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkflowStep(sql: Sql, args: CreateWorkflowStepArgs): Promise<CreateWorkflowStepRow | null> {
    const rows = await sql.unsafe(createWorkflowStepQuery, [args.workflowRunId, args.name, args.position, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        name: row[2],
        position: row[3],
        status: row[4],
        startedAt: row[5],
        completedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const createWorkflowTaskQuery = `-- name: CreateWorkflowTask :one
INSERT INTO workflow_tasks (workflow_run_id, workflow_step_id, repository_id, status, priority, payload, available_at, freestyle_vm_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, workflow_run_id, workflow_step_id, repository_id, status, priority, payload, available_at, attempt, runner_id, freestyle_vm_id, assigned_at, started_at, finished_at, last_error, created_at, updated_at`;

export interface CreateWorkflowTaskArgs {
    workflowRunId: string;
    workflowStepId: string;
    repositoryId: string;
    status: string;
    priority: number;
    payload: any;
    availableAt: Date;
    freestyleVmId: string | null;
}

export interface CreateWorkflowTaskRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    repositoryId: string;
    status: string;
    priority: number;
    payload: any;
    availableAt: Date;
    attempt: number;
    runnerId: string | null;
    freestyleVmId: string | null;
    assignedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWorkflowTask(sql: Sql, args: CreateWorkflowTaskArgs): Promise<CreateWorkflowTaskRow | null> {
    const rows = await sql.unsafe(createWorkflowTaskQuery, [args.workflowRunId, args.workflowStepId, args.repositoryId, args.status, args.priority, args.payload, args.availableAt, args.freestyleVmId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        repositoryId: row[3],
        status: row[4],
        priority: row[5],
        payload: row[6],
        availableAt: row[7],
        attempt: row[8],
        runnerId: row[9],
        freestyleVmId: row[10],
        assignedAt: row[11],
        startedAt: row[12],
        finishedAt: row[13],
        lastError: row[14],
        createdAt: row[15],
        updatedAt: row[16]
    };
}

export const getClaimableWorkflowTaskBacklogQuery = `-- name: GetClaimableWorkflowTaskBacklog :one
SELECT
    COUNT(*)::bigint AS depth,
    COALESCE(EXTRACT(EPOCH FROM NOW() - MIN(available_at)), 0)::double precision AS oldest_age_seconds
FROM workflow_tasks
WHERE status = 'pending'
  AND available_at <= NOW()`;

export interface GetClaimableWorkflowTaskBacklogRow {
    depth: string;
    oldestAgeSeconds: number;
}

export async function getClaimableWorkflowTaskBacklog(sql: Sql): Promise<GetClaimableWorkflowTaskBacklogRow | null> {
    const rows = await sql.unsafe(getClaimableWorkflowTaskBacklogQuery, []).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        depth: row[0],
        oldestAgeSeconds: row[1]
    };
}

export const markWorkflowTaskFreestyleRunningQuery = `-- name: MarkWorkflowTaskFreestyleRunning :execrows
UPDATE workflow_tasks
SET status = 'running',
    freestyle_vm_id = $1,
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
WHERE id = $2
  AND status IN ('pending', 'assigned')`;

export interface MarkWorkflowTaskFreestyleRunningArgs {
    freestyleVmId: string | null;
    id: string;
}

export const claimPendingTaskQuery = `-- name: ClaimPendingTask :one
WITH claimed AS (
    SELECT id
    FROM workflow_tasks
    WHERE status = 'pending'
      AND available_at <= NOW()
    ORDER BY priority DESC, created_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE workflow_tasks wt
SET status = 'assigned',
    attempt = wt.attempt + 1,
    runner_id = $1,
    assigned_at = NOW(),
    updated_at = NOW()
FROM claimed
WHERE wt.id = claimed.id
RETURNING wt.id, wt.workflow_run_id, wt.workflow_step_id, wt.repository_id, wt.status, wt.priority, wt.payload, wt.available_at, wt.attempt, wt.runner_id, wt.freestyle_vm_id, wt.assigned_at, wt.started_at, wt.finished_at, wt.last_error, wt.created_at, wt.updated_at`;

export interface ClaimPendingTaskArgs {
    runnerId: string | null;
}

export interface ClaimPendingTaskRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    repositoryId: string;
    status: string;
    priority: number;
    payload: any;
    availableAt: Date;
    attempt: number;
    runnerId: string | null;
    freestyleVmId: string | null;
    assignedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function claimPendingTask(sql: Sql, args: ClaimPendingTaskArgs): Promise<ClaimPendingTaskRow | null> {
    const rows = await sql.unsafe(claimPendingTaskQuery, [args.runnerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        repositoryId: row[3],
        status: row[4],
        priority: row[5],
        payload: row[6],
        availableAt: row[7],
        attempt: row[8],
        runnerId: row[9],
        freestyleVmId: row[10],
        assignedAt: row[11],
        startedAt: row[12],
        finishedAt: row[13],
        lastError: row[14],
        createdAt: row[15],
        updatedAt: row[16]
    };
}

export const markWorkflowTaskRunningQuery = `-- name: MarkWorkflowTaskRunning :execrows
UPDATE workflow_tasks
SET status = 'running',
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
WHERE id = $1
  AND runner_id = $2
  AND status = 'assigned'`;

export interface MarkWorkflowTaskRunningArgs {
    id: string;
    runnerId: string | null;
}

export const getWorkflowTaskStepIDQuery = `-- name: GetWorkflowTaskStepID :one
SELECT workflow_step_id FROM workflow_tasks WHERE id = $1`;

export interface GetWorkflowTaskStepIDArgs {
    id: string;
}

export interface GetWorkflowTaskStepIDRow {
    workflowStepId: string;
}

export async function getWorkflowTaskStepID(sql: Sql, args: GetWorkflowTaskStepIDArgs): Promise<GetWorkflowTaskStepIDRow | null> {
    const rows = await sql.unsafe(getWorkflowTaskStepIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        workflowStepId: row[0]
    };
}

export const updateWorkflowStepStatusRunningQuery = `-- name: UpdateWorkflowStepStatusRunning :execrows
UPDATE workflow_steps
SET status = 'running',
    started_at = COALESCE(workflow_steps.started_at, NOW()),
    updated_at = NOW()
WHERE workflow_steps.id = $1`;

export interface UpdateWorkflowStepStatusRunningArgs {
    stepId: string;
}

export const updateWorkflowStepStatusTerminalQuery = `-- name: UpdateWorkflowStepStatusTerminal :execrows
UPDATE workflow_steps
SET status = $1,
    completed_at = NOW(),
    updated_at = NOW()
WHERE workflow_steps.id = $2`;

export interface UpdateWorkflowStepStatusTerminalArgs {
    status: string;
    stepId: string;
}

export const markWorkflowTaskDoneQuery = `-- name: MarkWorkflowTaskDone :one
UPDATE workflow_tasks
SET status = $3,
    last_error = $4,
    finished_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND runner_id = $2
  AND status = 'running'
  AND $3 IN ('done', 'failed', 'cancelled')
RETURNING workflow_run_id`;

export interface MarkWorkflowTaskDoneArgs {
    id: string;
    runnerId: string | null;
    status: string;
    lastError: string | null;
}

export interface MarkWorkflowTaskDoneRow {
    workflowRunId: string;
}

export async function markWorkflowTaskDone(sql: Sql, args: MarkWorkflowTaskDoneArgs): Promise<MarkWorkflowTaskDoneRow | null> {
    const rows = await sql.unsafe(markWorkflowTaskDoneQuery, [args.id, args.runnerId, args.status, args.lastError]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        workflowRunId: row[0]
    };
}

export const markWorkflowTaskTerminalByIDQuery = `-- name: MarkWorkflowTaskTerminalByID :one
UPDATE workflow_tasks
SET status = $1,
    last_error = $2,
    finished_at = NOW(),
    updated_at = NOW()
WHERE id = $3
  AND status IN ('pending', 'assigned', 'running')
  AND $1 IN ('done', 'failed', 'cancelled')
RETURNING workflow_run_id`;

export interface MarkWorkflowTaskTerminalByIDArgs {
    status: string;
    lastError: string | null;
    id: string;
}

export interface MarkWorkflowTaskTerminalByIDRow {
    workflowRunId: string;
}

export async function markWorkflowTaskTerminalByID(sql: Sql, args: MarkWorkflowTaskTerminalByIDArgs): Promise<MarkWorkflowTaskTerminalByIDRow | null> {
    const rows = await sql.unsafe(markWorkflowTaskTerminalByIDQuery, [args.status, args.lastError, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        workflowRunId: row[0]
    };
}

export const getWorkflowTaskByRunIDQuery = `-- name: GetWorkflowTaskByRunID :one
SELECT id, workflow_run_id, workflow_step_id, repository_id, status, priority, payload, available_at, attempt, runner_id, freestyle_vm_id, assigned_at, started_at, finished_at, last_error, created_at, updated_at
FROM workflow_tasks
WHERE workflow_run_id = $1
ORDER BY id DESC
LIMIT 1`;

export interface GetWorkflowTaskByRunIDArgs {
    workflowRunId: string;
}

export interface GetWorkflowTaskByRunIDRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    repositoryId: string;
    status: string;
    priority: number;
    payload: any;
    availableAt: Date;
    attempt: number;
    runnerId: string | null;
    freestyleVmId: string | null;
    assignedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowTaskByRunID(sql: Sql, args: GetWorkflowTaskByRunIDArgs): Promise<GetWorkflowTaskByRunIDRow | null> {
    const rows = await sql.unsafe(getWorkflowTaskByRunIDQuery, [args.workflowRunId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        repositoryId: row[3],
        status: row[4],
        priority: row[5],
        payload: row[6],
        availableAt: row[7],
        attempt: row[8],
        runnerId: row[9],
        freestyleVmId: row[10],
        assignedAt: row[11],
        startedAt: row[12],
        finishedAt: row[13],
        lastError: row[14],
        createdAt: row[15],
        updatedAt: row[16]
    };
}

export const requeueTasksForRunnerQuery = `-- name: RequeueTasksForRunner :one
WITH affected AS (
    SELECT id, workflow_step_id, status
    FROM workflow_tasks
    WHERE workflow_tasks.runner_id = $1
      AND workflow_tasks.status IN ('assigned', 'running')
    FOR UPDATE
),
requeued AS (
    UPDATE workflow_tasks wt
    SET status = 'pending',
        runner_id = NULL,
        assigned_at = NULL,
        started_at = NULL,
        available_at = NOW() + (
            INTERVAL '1 second' * LEAST(
                300,
                POWER(2, LEAST(GREATEST(wt.attempt - 1, 0), 9))
            )
        ),
        updated_at = NOW()
    FROM affected
    WHERE wt.id = affected.id
    RETURNING affected.workflow_step_id, affected.status
),
reset_steps AS (
    UPDATE workflow_steps ws
    SET status = 'queued',
        started_at = NULL,
        completed_at = NULL,
        updated_at = NOW()
    WHERE ws.id IN (
        SELECT workflow_step_id
        FROM requeued
        WHERE status = 'running'
    )
      AND ws.status = 'running'
    RETURNING ws.id
)
SELECT COUNT(*)::bigint
FROM requeued`;

export interface RequeueTasksForRunnerArgs {
    runnerId: string | null;
}

export interface RequeueTasksForRunnerRow {
    value: string;
}

export async function requeueTasksForRunner(sql: Sql, args: RequeueTasksForRunnerArgs): Promise<RequeueTasksForRunnerRow | null> {
    const rows = await sql.unsafe(requeueTasksForRunnerQuery, [args.runnerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        value: row[0]
    };
}

export const updateWorkflowRunStatusBasedOnTasksQuery = `-- name: UpdateWorkflowRunStatusBasedOnTasks :one
WITH task_summary AS (
    SELECT
        workflow_run_id,
        COUNT(*) FILTER (WHERE status IN ('pending', 'assigned', 'running', 'blocked')) AS active,
        COUNT(*) FILTER (WHERE status = 'failed')                            AS failed,
        COUNT(*) FILTER (WHERE status = 'cancelled')                         AS cancelled,
        COUNT(*) FILTER (WHERE status IN ('done', 'skipped'))                AS done,
        COUNT(*)                                                              AS total
    FROM workflow_tasks
    WHERE workflow_run_id = $1
    GROUP BY workflow_run_id
),
derived AS (
    SELECT
        CASE
            WHEN active > 0                   THEN 'running'
            WHEN failed > 0                   THEN 'failure'
            WHEN cancelled > 0 AND done = 0   THEN 'cancelled'
            WHEN done = total AND total > 0    THEN 'success'
            ELSE 'failure'
        END AS new_status
    FROM task_summary
)
UPDATE workflow_runs wr
SET status       = derived.new_status,
    completed_at = CASE WHEN derived.new_status IN ('success', 'failure', 'cancelled') THEN NOW() ELSE completed_at END,
    started_at   = COALESCE(started_at, NOW()),
    updated_at   = NOW()
FROM derived
WHERE wr.id = $1
RETURNING wr.status`;

export interface UpdateWorkflowRunStatusBasedOnTasksArgs {
    id: string;
}

export interface UpdateWorkflowRunStatusBasedOnTasksRow {
    status: string;
}

export async function updateWorkflowRunStatusBasedOnTasks(sql: Sql, args: UpdateWorkflowRunStatusBasedOnTasksArgs): Promise<UpdateWorkflowRunStatusBasedOnTasksRow | null> {
    const rows = await sql.unsafe(updateWorkflowRunStatusBasedOnTasksQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        status: row[0]
    };
}

export const notifyWorkflowRunEventQuery = `-- name: NotifyWorkflowRunEvent :exec
SELECT pg_notify(
    'workflow_run_events_' || $1::bigint::text,
    $2::text
)`;

export interface NotifyWorkflowRunEventArgs {
    runId: string;
    payload: string;
}

export interface NotifyWorkflowRunEventRow {
    pgNotify: string;
}

export async function notifyWorkflowRunEvent(sql: Sql, args: NotifyWorkflowRunEventArgs): Promise<void> {
    await sql.unsafe(notifyWorkflowRunEventQuery, [args.runId, args.payload]);
}

export const getWorkflowTaskQuery = `-- name: GetWorkflowTask :one
SELECT id, workflow_run_id, workflow_step_id, repository_id, status, priority, payload, available_at, attempt, runner_id, freestyle_vm_id, assigned_at, started_at, finished_at, last_error, created_at, updated_at
FROM workflow_tasks
WHERE id = $1
  AND repository_id = $2`;

export interface GetWorkflowTaskArgs {
    id: string;
    repositoryId: string;
}

export interface GetWorkflowTaskRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    repositoryId: string;
    status: string;
    priority: number;
    payload: any;
    availableAt: Date;
    attempt: number;
    runnerId: string | null;
    freestyleVmId: string | null;
    assignedAt: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowTask(sql: Sql, args: GetWorkflowTaskArgs): Promise<GetWorkflowTaskRow | null> {
    const rows = await sql.unsafe(getWorkflowTaskQuery, [args.id, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        repositoryId: row[3],
        status: row[4],
        priority: row[5],
        payload: row[6],
        availableAt: row[7],
        attempt: row[8],
        runnerId: row[9],
        freestyleVmId: row[10],
        assignedAt: row[11],
        startedAt: row[12],
        finishedAt: row[13],
        lastError: row[14],
        createdAt: row[15],
        updatedAt: row[16]
    };
}

export const cancelWorkflowRunQuery = `-- name: CancelWorkflowRun :exec
UPDATE workflow_runs
SET status = 'cancelled',
    completed_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND status NOT IN ('success', 'failure', 'cancelled')`;

export interface CancelWorkflowRunArgs {
    id: string;
}

export async function cancelWorkflowRun(sql: Sql, args: CancelWorkflowRunArgs): Promise<void> {
    await sql.unsafe(cancelWorkflowRunQuery, [args.id]);
}

export const cancelWorkflowTasksQuery = `-- name: CancelWorkflowTasks :exec
UPDATE workflow_tasks
SET status = 'cancelled',
    finished_at = NOW(),
    updated_at = NOW()
WHERE workflow_run_id = $1
  AND status IN ('pending', 'assigned', 'running', 'blocked')`;

export interface CancelWorkflowTasksArgs {
    workflowRunId: string;
}

export async function cancelWorkflowTasks(sql: Sql, args: CancelWorkflowTasksArgs): Promise<void> {
    await sql.unsafe(cancelWorkflowTasksQuery, [args.workflowRunId]);
}

export const resumeWorkflowRunQuery = `-- name: ResumeWorkflowRun :exec
UPDATE workflow_runs
SET status = 'queued',
    completed_at = NULL,
    updated_at = NOW()
WHERE id = $1
  AND status IN ('cancelled', 'failure')`;

export interface ResumeWorkflowRunArgs {
    id: string;
}

export async function resumeWorkflowRun(sql: Sql, args: ResumeWorkflowRunArgs): Promise<void> {
    await sql.unsafe(resumeWorkflowRunQuery, [args.id]);
}

export const resumeWorkflowTasksQuery = `-- name: ResumeWorkflowTasks :exec
UPDATE workflow_tasks
SET status = 'pending',
    runner_id = NULL,
    assigned_at = NULL,
    started_at = NULL,
    finished_at = NULL,
    last_error = NULL,
    available_at = NOW(),
    updated_at = NOW()
WHERE workflow_run_id = $1
  AND status IN ('cancelled', 'failed')`;

export interface ResumeWorkflowTasksArgs {
    workflowRunId: string;
}

export async function resumeWorkflowTasks(sql: Sql, args: ResumeWorkflowTasksArgs): Promise<void> {
    await sql.unsafe(resumeWorkflowTasksQuery, [args.workflowRunId]);
}

export const resumeWorkflowStepsQuery = `-- name: ResumeWorkflowSteps :exec
UPDATE workflow_steps
SET status = 'queued',
    started_at = NULL,
    completed_at = NULL,
    updated_at = NOW()
WHERE workflow_run_id = $1
  AND status IN ('cancelled', 'failure')`;

export interface ResumeWorkflowStepsArgs {
    workflowRunId: string;
}

export async function resumeWorkflowSteps(sql: Sql, args: ResumeWorkflowStepsArgs): Promise<void> {
    await sql.unsafe(resumeWorkflowStepsQuery, [args.workflowRunId]);
}

export const createCommitStatusQuery = `-- name: CreateCommitStatus :one
INSERT INTO commit_statuses (repository_id, change_id, commit_sha, context, status, description, target_url, workflow_run_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, repository_id, change_id, commit_sha, context, status, description, target_url, workflow_run_id, created_at, updated_at`;

export interface CreateCommitStatusArgs {
    repositoryId: string;
    changeId: string | null;
    commitSha: string | null;
    context: string;
    status: string;
    description: string;
    targetUrl: string;
    workflowRunId: string | null;
}

export interface CreateCommitStatusRow {
    id: string;
    repositoryId: string;
    changeId: string | null;
    commitSha: string | null;
    context: string;
    status: string;
    description: string;
    targetUrl: string;
    workflowRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createCommitStatus(sql: Sql, args: CreateCommitStatusArgs): Promise<CreateCommitStatusRow | null> {
    const rows = await sql.unsafe(createCommitStatusQuery, [args.repositoryId, args.changeId, args.commitSha, args.context, args.status, args.description, args.targetUrl, args.workflowRunId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitSha: row[3],
        context: row[4],
        status: row[5],
        description: row[6],
        targetUrl: row[7],
        workflowRunId: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    };
}

export const updateLatestCommitStatusByWorkflowRunIDQuery = `-- name: UpdateLatestCommitStatusByWorkflowRunID :one
UPDATE commit_statuses
SET status = $2,
    description = $3,
    target_url = $4,
    updated_at = NOW()
WHERE id = (
  SELECT cs.id
  FROM commit_statuses cs
  WHERE cs.workflow_run_id = $1
  ORDER BY cs.id DESC
  LIMIT 1
)
RETURNING id, repository_id, change_id, commit_sha, context, status, description, target_url, workflow_run_id, created_at, updated_at`;

export interface UpdateLatestCommitStatusByWorkflowRunIDArgs {
    workflowRunId: string | null;
    status: string;
    description: string;
    targetUrl: string;
}

export interface UpdateLatestCommitStatusByWorkflowRunIDRow {
    id: string;
    repositoryId: string;
    changeId: string | null;
    commitSha: string | null;
    context: string;
    status: string;
    description: string;
    targetUrl: string;
    workflowRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateLatestCommitStatusByWorkflowRunID(sql: Sql, args: UpdateLatestCommitStatusByWorkflowRunIDArgs): Promise<UpdateLatestCommitStatusByWorkflowRunIDRow | null> {
    const rows = await sql.unsafe(updateLatestCommitStatusByWorkflowRunIDQuery, [args.workflowRunId, args.status, args.description, args.targetUrl]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitSha: row[3],
        context: row[4],
        status: row[5],
        description: row[6],
        targetUrl: row[7],
        workflowRunId: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    };
}

export const listCommitStatusesByRefQuery = `-- name: ListCommitStatusesByRef :many
SELECT id, repository_id, change_id, commit_sha, context, status, description, target_url, workflow_run_id, created_at, updated_at
FROM commit_statuses
WHERE repository_id = $1
  AND (change_id = $2 OR commit_sha = $2)
ORDER BY created_at DESC
LIMIT $4
OFFSET $3`;

export interface ListCommitStatusesByRefArgs {
    repositoryId: string;
    ref: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListCommitStatusesByRefRow {
    id: string;
    repositoryId: string;
    changeId: string | null;
    commitSha: string | null;
    context: string;
    status: string;
    description: string;
    targetUrl: string;
    workflowRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listCommitStatusesByRef(sql: Sql, args: ListCommitStatusesByRefArgs): Promise<ListCommitStatusesByRefRow[]> {
    return (await sql.unsafe(listCommitStatusesByRefQuery, [args.repositoryId, args.ref, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitSha: row[3],
        context: row[4],
        status: row[5],
        description: row[6],
        targetUrl: row[7],
        workflowRunId: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    }));
}

export const listCommitStatusesBySHAQuery = `-- name: ListCommitStatusesBySHA :many
SELECT id, repository_id, change_id, commit_sha, context, status, description, target_url, workflow_run_id, created_at, updated_at
FROM commit_statuses
WHERE repository_id = $1
  AND commit_sha = $2
ORDER BY created_at DESC
LIMIT $4
OFFSET $3`;

export interface ListCommitStatusesBySHAArgs {
    repositoryId: string;
    commitSha: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListCommitStatusesBySHARow {
    id: string;
    repositoryId: string;
    changeId: string | null;
    commitSha: string | null;
    context: string;
    status: string;
    description: string;
    targetUrl: string;
    workflowRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listCommitStatusesBySHA(sql: Sql, args: ListCommitStatusesBySHAArgs): Promise<ListCommitStatusesBySHARow[]> {
    return (await sql.unsafe(listCommitStatusesBySHAQuery, [args.repositoryId, args.commitSha, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitSha: row[3],
        context: row[4],
        status: row[5],
        description: row[6],
        targetUrl: row[7],
        workflowRunId: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    }));
}

export const countCommitStatusesByRefQuery = `-- name: CountCommitStatusesByRef :one
SELECT COUNT(*)
FROM commit_statuses
WHERE repository_id = $1
  AND (change_id = $2 OR commit_sha = $2)`;

export interface CountCommitStatusesByRefArgs {
    repositoryId: string;
    ref: string | null;
}

export interface CountCommitStatusesByRefRow {
    count: string;
}

export async function countCommitStatusesByRef(sql: Sql, args: CountCommitStatusesByRefArgs): Promise<CountCommitStatusesByRefRow | null> {
    const rows = await sql.unsafe(countCommitStatusesByRefQuery, [args.repositoryId, args.ref]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const getLatestCommitStatusBySHAQuery = `-- name: GetLatestCommitStatusBySHA :one
SELECT id, repository_id, change_id, commit_sha, context, status, description, target_url, workflow_run_id, created_at, updated_at
FROM commit_statuses
WHERE repository_id = $1
  AND commit_sha = $2
ORDER BY created_at DESC
LIMIT 1`;

export interface GetLatestCommitStatusBySHAArgs {
    repositoryId: string;
    commitSha: string | null;
}

export interface GetLatestCommitStatusBySHARow {
    id: string;
    repositoryId: string;
    changeId: string | null;
    commitSha: string | null;
    context: string;
    status: string;
    description: string;
    targetUrl: string;
    workflowRunId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLatestCommitStatusBySHA(sql: Sql, args: GetLatestCommitStatusBySHAArgs): Promise<GetLatestCommitStatusBySHARow | null> {
    const rows = await sql.unsafe(getLatestCommitStatusBySHAQuery, [args.repositoryId, args.commitSha]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        commitSha: row[3],
        context: row[4],
        status: row[5],
        description: row[6],
        targetUrl: row[7],
        workflowRunId: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    };
}

export const listLatestCanaryStepStatusesQuery = `-- name: ListLatestCanaryStepStatuses :many
WITH latest_run AS (
    SELECT wr.id
    FROM workflow_runs wr
    JOIN workflow_definitions wd ON wd.id = wr.workflow_definition_id
    WHERE wd.path = $1
      AND wr.completed_at IS NOT NULL
    ORDER BY wr.completed_at DESC, wr.id DESC
    LIMIT 1
)
SELECT ws.name, ws.status
FROM latest_run lr
JOIN workflow_steps ws ON ws.workflow_run_id = lr.id
WHERE ws.name LIKE 'canary-%'
ORDER BY ws.position ASC, ws.id ASC`;

export interface ListLatestCanaryStepStatusesArgs {
    workflowPath: string;
}

export interface ListLatestCanaryStepStatusesRow {
    name: string;
    status: string;
}

export async function listLatestCanaryStepStatuses(sql: Sql, args: ListLatestCanaryStepStatusesArgs): Promise<ListLatestCanaryStepStatusesRow[]> {
    return (await sql.unsafe(listLatestCanaryStepStatusesQuery, [args.workflowPath]).values()).map(row => ({
        name: row[0],
        status: row[1]
    }));
}

export const getLatestCommitStatusesByChangeIDsAndContextsQuery = `-- name: GetLatestCommitStatusesByChangeIDsAndContexts :many
SELECT DISTINCT ON (cs.context)
    cs.context,
    cs.status,
    cs.created_at
FROM commit_statuses cs
WHERE cs.repository_id = $1
  AND cs.change_id = ANY($2::text[])
  AND cs.context = ANY($3::text[])
ORDER BY cs.context, cs.created_at DESC`;

export interface GetLatestCommitStatusesByChangeIDsAndContextsArgs {
    repositoryId: string;
    changeIds: string[];
    contexts: string[];
}

export interface GetLatestCommitStatusesByChangeIDsAndContextsRow {
    context: string;
    status: string;
    createdAt: Date;
}

export async function getLatestCommitStatusesByChangeIDsAndContexts(sql: Sql, args: GetLatestCommitStatusesByChangeIDsAndContextsArgs): Promise<GetLatestCommitStatusesByChangeIDsAndContextsRow[]> {
    return (await sql.unsafe(getLatestCommitStatusesByChangeIDsAndContextsQuery, [args.repositoryId, args.changeIds, args.contexts]).values()).map(row => ({
        context: row[0],
        status: row[1],
        createdAt: row[2]
    }));
}

