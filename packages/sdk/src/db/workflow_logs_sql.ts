import { Sql } from "postgres";

export const getWorkflowTaskForRunnerQuery = `-- name: GetWorkflowTaskForRunner :one
SELECT id, workflow_run_id, workflow_step_id, repository_id, runner_id, status
FROM workflow_tasks
WHERE id = $1
  AND status = 'running'`;

export interface GetWorkflowTaskForRunnerArgs {
    taskId: string;
}

export interface GetWorkflowTaskForRunnerRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    repositoryId: string;
    runnerId: string | null;
    status: string;
}

export async function getWorkflowTaskForRunner(sql: Sql, args: GetWorkflowTaskForRunnerArgs): Promise<GetWorkflowTaskForRunnerRow | null> {
    const rows = await sql.unsafe(getWorkflowTaskForRunnerQuery, [args.taskId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        repositoryId: row[3],
        runnerId: row[4],
        status: row[5]
    };
}

export const getWorkflowTaskRuntimeContextQuery = `-- name: GetWorkflowTaskRuntimeContext :one
SELECT id, workflow_run_id, repository_id, status
FROM workflow_tasks
WHERE id = $1
  AND workflow_run_id = $2
  AND status IN ('assigned', 'running')`;

export interface GetWorkflowTaskRuntimeContextArgs {
    taskId: string;
    workflowRunId: string;
}

export interface GetWorkflowTaskRuntimeContextRow {
    id: string;
    workflowRunId: string;
    repositoryId: string;
    status: string;
}

export async function getWorkflowTaskRuntimeContext(sql: Sql, args: GetWorkflowTaskRuntimeContextArgs): Promise<GetWorkflowTaskRuntimeContextRow | null> {
    const rows = await sql.unsafe(getWorkflowTaskRuntimeContextQuery, [args.taskId, args.workflowRunId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        repositoryId: row[2],
        status: row[3]
    };
}

export const insertWorkflowLogQuery = `-- name: InsertWorkflowLog :one
INSERT INTO workflow_logs (workflow_run_id, workflow_step_id, sequence, stream, entry)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, workflow_run_id, workflow_step_id, sequence, stream, entry, created_at`;

export interface InsertWorkflowLogArgs {
    workflowRunId: string;
    workflowStepId: string;
    sequence: string;
    stream: string;
    entry: string;
}

export interface InsertWorkflowLogRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    sequence: string;
    stream: string;
    entry: string;
    createdAt: Date;
}

export async function insertWorkflowLog(sql: Sql, args: InsertWorkflowLogArgs): Promise<InsertWorkflowLogRow | null> {
    const rows = await sql.unsafe(insertWorkflowLogQuery, [args.workflowRunId, args.workflowStepId, args.sequence, args.stream, args.entry]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        sequence: row[3],
        stream: row[4],
        entry: row[5],
        createdAt: row[6]
    };
}

export const insertWorkflowLogNextSequenceQuery = `-- name: InsertWorkflowLogNextSequence :one
WITH step_lock AS (
    SELECT pg_advisory_xact_lock($1) AS locked
),
next_sequence AS (
    SELECT COALESCE(MAX(sequence), 0)::bigint + 1 AS sequence
    FROM step_lock
    LEFT JOIN workflow_logs ON workflow_logs.workflow_step_id = $1
),
inserted AS (
    INSERT INTO workflow_logs (workflow_run_id, workflow_step_id, sequence, stream, entry)
    SELECT
        $2,
        $1,
        next_sequence.sequence,
        $3,
        $4
    FROM step_lock, next_sequence
    RETURNING id, workflow_run_id, workflow_step_id, sequence, stream, entry, created_at
)
SELECT id, workflow_run_id, workflow_step_id, sequence, stream, entry, created_at
FROM inserted`;

export interface InsertWorkflowLogNextSequenceArgs {
    workflowStepId: string;
    workflowRunId: string;
    stream: string;
    entry: string;
}

export interface InsertWorkflowLogNextSequenceRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    sequence: string;
    stream: string;
    entry: string;
    createdAt: Date;
}

export async function insertWorkflowLogNextSequence(sql: Sql, args: InsertWorkflowLogNextSequenceArgs): Promise<InsertWorkflowLogNextSequenceRow | null> {
    const rows = await sql.unsafe(insertWorkflowLogNextSequenceQuery, [args.workflowStepId, args.workflowRunId, args.stream, args.entry]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        sequence: row[3],
        stream: row[4],
        entry: row[5],
        createdAt: row[6]
    };
}

export const notifyWorkflowLogQuery = `-- name: NotifyWorkflowLog :exec
SELECT pg_notify(
    'workflow_step_logs_' || $1::bigint::text,
    $2::text
)`;

export interface NotifyWorkflowLogArgs {
    stepId: string;
    payload: string;
}

export interface NotifyWorkflowLogRow {
    pgNotify: string;
}

export async function notifyWorkflowLog(sql: Sql, args: NotifyWorkflowLogArgs): Promise<void> {
    await sql.unsafe(notifyWorkflowLogQuery, [args.stepId, args.payload]);
}

export const getWorkflowRunByIDAndRepoQuery = `-- name: GetWorkflowRunByIDAndRepo :one
SELECT id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at
FROM workflow_runs
WHERE id = $1
  AND repository_id = $2`;

export interface GetWorkflowRunByIDAndRepoArgs {
    runId: string;
    repositoryId: string;
}

export interface GetWorkflowRunByIDAndRepoRow {
    id: string;
    repositoryId: string;
    workflowDefinitionId: string;
    status: string;
    triggerEvent: string;
    triggerRef: string;
    triggerCommitSha: string;
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWorkflowRunByIDAndRepo(sql: Sql, args: GetWorkflowRunByIDAndRepoArgs): Promise<GetWorkflowRunByIDAndRepoRow | null> {
    const rows = await sql.unsafe(getWorkflowRunByIDAndRepoQuery, [args.runId, args.repositoryId]).values();
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
        agentTokenHash: row[7],
        agentTokenExpiresAt: row[8],
        startedAt: row[9],
        completedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const listWorkflowStepsByRunIDQuery = `-- name: ListWorkflowStepsByRunID :many
SELECT id, workflow_run_id, name, position, status, started_at, completed_at, created_at, updated_at
FROM workflow_steps
WHERE workflow_run_id = $1
ORDER BY position`;

export interface ListWorkflowStepsByRunIDArgs {
    runId: string;
}

export interface ListWorkflowStepsByRunIDRow {
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

export async function listWorkflowStepsByRunID(sql: Sql, args: ListWorkflowStepsByRunIDArgs): Promise<ListWorkflowStepsByRunIDRow[]> {
    return (await sql.unsafe(listWorkflowStepsByRunIDQuery, [args.runId]).values()).map(row => ({
        id: row[0],
        workflowRunId: row[1],
        name: row[2],
        position: row[3],
        status: row[4],
        startedAt: row[5],
        completedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const listWorkflowLogsSinceQuery = `-- name: ListWorkflowLogsSince :many
SELECT id, workflow_run_id, workflow_step_id, sequence, stream, entry, created_at
FROM workflow_logs
WHERE workflow_run_id = $1
  AND id > $2
ORDER BY id ASC
LIMIT $3`;

export interface ListWorkflowLogsSinceArgs {
    runId: string;
    afterId: string;
    pageSize: string;
}

export interface ListWorkflowLogsSinceRow {
    id: string;
    workflowRunId: string;
    workflowStepId: string;
    sequence: string;
    stream: string;
    entry: string;
    createdAt: Date;
}

export async function listWorkflowLogsSince(sql: Sql, args: ListWorkflowLogsSinceArgs): Promise<ListWorkflowLogsSinceRow[]> {
    return (await sql.unsafe(listWorkflowLogsSinceQuery, [args.runId, args.afterId, args.pageSize]).values()).map(row => ({
        id: row[0],
        workflowRunId: row[1],
        workflowStepId: row[2],
        sequence: row[3],
        stream: row[4],
        entry: row[5],
        createdAt: row[6]
    }));
}

