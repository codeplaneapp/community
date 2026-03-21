import { Sql } from "postgres";

export const updateWorkflowRunAgentTokenQuery = `-- name: UpdateWorkflowRunAgentToken :one
UPDATE workflow_runs
SET agent_token_hash = $1,
    agent_token_expires_at = $2,
    updated_at = NOW()
WHERE id = $3
RETURNING id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at`;

export interface UpdateWorkflowRunAgentTokenArgs {
    agentTokenHash: string | null;
    agentTokenExpiresAt: Date | null;
    id: string;
}

export interface UpdateWorkflowRunAgentTokenRow {
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

export async function updateWorkflowRunAgentToken(sql: Sql, args: UpdateWorkflowRunAgentTokenArgs): Promise<UpdateWorkflowRunAgentTokenRow | null> {
    const rows = await sql.unsafe(updateWorkflowRunAgentTokenQuery, [args.agentTokenHash, args.agentTokenExpiresAt, args.id]).values();
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

export const getWorkflowRunByAgentTokenQuery = `-- name: GetWorkflowRunByAgentToken :one
SELECT id, repository_id, workflow_definition_id, status, trigger_event, trigger_ref, trigger_commit_sha, dispatch_inputs, agent_token_hash, agent_token_expires_at, started_at, completed_at, created_at, updated_at
FROM workflow_runs
WHERE agent_token_hash = $1`;

export interface GetWorkflowRunByAgentTokenArgs {
    agentTokenHash: string | null;
}

export interface GetWorkflowRunByAgentTokenRow {
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

export async function getWorkflowRunByAgentToken(sql: Sql, args: GetWorkflowRunByAgentTokenArgs): Promise<GetWorkflowRunByAgentTokenRow | null> {
    const rows = await sql.unsafe(getWorkflowRunByAgentTokenQuery, [args.agentTokenHash]).values();
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

