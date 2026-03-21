import { Sql } from "postgres";

export const upsertWorkflowScheduleSpecQuery = `-- name: UpsertWorkflowScheduleSpec :exec
INSERT INTO workflow_schedule_specs (
    workflow_definition_id,
    repository_id,
    cron_expression,
    next_fire_at
)
VALUES ($1, $2, $3, $4)
ON CONFLICT (workflow_definition_id, cron_expression)
DO UPDATE SET
    repository_id = EXCLUDED.repository_id,
    next_fire_at = EXCLUDED.next_fire_at,
    updated_at = NOW()`;

export interface UpsertWorkflowScheduleSpecArgs {
    workflowDefinitionId: string;
    repositoryId: string;
    cronExpression: string;
    nextFireAt: Date;
}

export async function upsertWorkflowScheduleSpec(sql: Sql, args: UpsertWorkflowScheduleSpecArgs): Promise<void> {
    await sql.unsafe(upsertWorkflowScheduleSpecQuery, [args.workflowDefinitionId, args.repositoryId, args.cronExpression, args.nextFireAt]);
}

export const deleteWorkflowScheduleSpecsByDefinitionQuery = `-- name: DeleteWorkflowScheduleSpecsByDefinition :exec
DELETE FROM workflow_schedule_specs
WHERE workflow_definition_id = $1`;

export interface DeleteWorkflowScheduleSpecsByDefinitionArgs {
    workflowDefinitionId: string;
}

export async function deleteWorkflowScheduleSpecsByDefinition(sql: Sql, args: DeleteWorkflowScheduleSpecsByDefinitionArgs): Promise<void> {
    await sql.unsafe(deleteWorkflowScheduleSpecsByDefinitionQuery, [args.workflowDefinitionId]);
}

export const claimDueWorkflowScheduleSpecsQuery = `-- name: ClaimDueWorkflowScheduleSpecs :many
WITH claimable AS (
    SELECT id
    FROM workflow_schedule_specs
    WHERE next_fire_at <= NOW()
    ORDER BY next_fire_at ASC, id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT $1
)
UPDATE workflow_schedule_specs wss
SET prev_fire_at = NOW(),
    next_fire_at = '9999-12-31T23:59:59Z'::timestamptz,
    updated_at = NOW()
FROM claimable
WHERE wss.id = claimable.id
RETURNING wss.id, wss.workflow_definition_id, wss.repository_id, wss.cron_expression, wss.next_fire_at, wss.prev_fire_at, wss.created_at, wss.updated_at`;

export interface ClaimDueWorkflowScheduleSpecsArgs {
    limitCount: string;
}

export interface ClaimDueWorkflowScheduleSpecsRow {
    id: string;
    workflowDefinitionId: string;
    repositoryId: string;
    cronExpression: string;
    nextFireAt: Date;
    prevFireAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function claimDueWorkflowScheduleSpecs(sql: Sql, args: ClaimDueWorkflowScheduleSpecsArgs): Promise<ClaimDueWorkflowScheduleSpecsRow[]> {
    return (await sql.unsafe(claimDueWorkflowScheduleSpecsQuery, [args.limitCount]).values()).map(row => ({
        id: row[0],
        workflowDefinitionId: row[1],
        repositoryId: row[2],
        cronExpression: row[3],
        nextFireAt: row[4],
        prevFireAt: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const updateWorkflowScheduleFireTimesQuery = `-- name: UpdateWorkflowScheduleFireTimes :exec
UPDATE workflow_schedule_specs
SET prev_fire_at = $2,
    next_fire_at = $3,
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateWorkflowScheduleFireTimesArgs {
    id: string;
    prevFireAt: Date | null;
    nextFireAt: Date;
}

export async function updateWorkflowScheduleFireTimes(sql: Sql, args: UpdateWorkflowScheduleFireTimesArgs): Promise<void> {
    await sql.unsafe(updateWorkflowScheduleFireTimesQuery, [args.id, args.prevFireAt, args.nextFireAt]);
}

