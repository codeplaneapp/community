import { Sql } from "postgres";

export const createAgentSessionQuery = `-- name: CreateAgentSession :one
INSERT INTO agent_sessions (id, repository_id, user_id, title, status)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at`;

export interface CreateAgentSessionArgs {
    id: string;
    repositoryId: string;
    userId: string;
    title: string;
    status: string;
}

export interface CreateAgentSessionRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createAgentSession(sql: Sql, args: CreateAgentSessionArgs): Promise<CreateAgentSessionRow | null> {
    const rows = await sql.unsafe(createAgentSessionQuery, [args.id, args.repositoryId, args.userId, args.title, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const getAgentSessionQuery = `-- name: GetAgentSession :one
SELECT id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at
FROM agent_sessions
WHERE id = $1`;

export interface GetAgentSessionArgs {
    id: string;
}

export interface GetAgentSessionRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getAgentSession(sql: Sql, args: GetAgentSessionArgs): Promise<GetAgentSessionRow | null> {
    const rows = await sql.unsafe(getAgentSessionQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const listAgentSessionsByRepoQuery = `-- name: ListAgentSessionsByRepo :many
SELECT id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at
FROM agent_sessions
WHERE repository_id = $1
ORDER BY created_at DESC
LIMIT $3
OFFSET $2`;

export interface ListAgentSessionsByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListAgentSessionsByRepoRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listAgentSessionsByRepo(sql: Sql, args: ListAgentSessionsByRepoArgs): Promise<ListAgentSessionsByRepoRow[]> {
    return (await sql.unsafe(listAgentSessionsByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const countAgentSessionsByRepoQuery = `-- name: CountAgentSessionsByRepo :one
SELECT COUNT(*) FROM agent_sessions WHERE repository_id = $1`;

export interface CountAgentSessionsByRepoArgs {
    repositoryId: string;
}

export interface CountAgentSessionsByRepoRow {
    count: string;
}

export async function countAgentSessionsByRepo(sql: Sql, args: CountAgentSessionsByRepoArgs): Promise<CountAgentSessionsByRepoRow | null> {
    const rows = await sql.unsafe(countAgentSessionsByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const updateAgentSessionStatusQuery = `-- name: UpdateAgentSessionStatus :one
UPDATE agent_sessions
SET status = $2, updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at`;

export interface UpdateAgentSessionStatusArgs {
    id: string;
    status: string;
}

export interface UpdateAgentSessionStatusRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateAgentSessionStatus(sql: Sql, args: UpdateAgentSessionStatusArgs): Promise<UpdateAgentSessionStatusRow | null> {
    const rows = await sql.unsafe(updateAgentSessionStatusQuery, [args.id, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const updateAgentSessionStartedAtQuery = `-- name: UpdateAgentSessionStartedAt :one
UPDATE agent_sessions
SET started_at = COALESCE(started_at, $2), updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at`;

export interface UpdateAgentSessionStartedAtArgs {
    id: string;
    startedAt: Date | null;
}

export interface UpdateAgentSessionStartedAtRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateAgentSessionStartedAt(sql: Sql, args: UpdateAgentSessionStartedAtArgs): Promise<UpdateAgentSessionStartedAtRow | null> {
    const rows = await sql.unsafe(updateAgentSessionStartedAtQuery, [args.id, args.startedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const updateAgentSessionTerminalStatusQuery = `-- name: UpdateAgentSessionTerminalStatus :one
UPDATE agent_sessions
SET status = $2, finished_at = $3, updated_at = NOW()
WHERE id = $1 AND status = 'active'
RETURNING id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at`;

export interface UpdateAgentSessionTerminalStatusArgs {
    id: string;
    status: string;
    finishedAt: Date | null;
}

export interface UpdateAgentSessionTerminalStatusRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateAgentSessionTerminalStatus(sql: Sql, args: UpdateAgentSessionTerminalStatusArgs): Promise<UpdateAgentSessionTerminalStatusRow | null> {
    const rows = await sql.unsafe(updateAgentSessionTerminalStatusQuery, [args.id, args.status, args.finishedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const updateAgentSessionTimedOutQuery = `-- name: UpdateAgentSessionTimedOut :one
UPDATE agent_sessions
SET status = 'timed_out', finished_at = $2, updated_at = NOW()
WHERE id = $1 AND status = 'active'
RETURNING id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at`;

export interface UpdateAgentSessionTimedOutArgs {
    id: string;
    finishedAt: Date | null;
}

export interface UpdateAgentSessionTimedOutRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateAgentSessionTimedOut(sql: Sql, args: UpdateAgentSessionTimedOutArgs): Promise<UpdateAgentSessionTimedOutRow | null> {
    const rows = await sql.unsafe(updateAgentSessionTimedOutQuery, [args.id, args.finishedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const lockAgentSessionForAppendQuery = `-- name: LockAgentSessionForAppend :one
SELECT id FROM agent_sessions WHERE id = $1 FOR UPDATE`;

export interface LockAgentSessionForAppendArgs {
    id: string;
}

export interface LockAgentSessionForAppendRow {
    id: string;
}

export async function lockAgentSessionForAppend(sql: Sql, args: LockAgentSessionForAppendArgs): Promise<LockAgentSessionForAppendRow | null> {
    const rows = await sql.unsafe(lockAgentSessionForAppendQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0]
    };
}

export const updateAgentSessionWorkflowRunQuery = `-- name: UpdateAgentSessionWorkflowRun :one
UPDATE agent_sessions
SET workflow_run_id = $1, updated_at = NOW()
WHERE id = $2
RETURNING id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at`;

export interface UpdateAgentSessionWorkflowRunArgs {
    workflowRunId: string | null;
    id: string;
}

export interface UpdateAgentSessionWorkflowRunRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateAgentSessionWorkflowRun(sql: Sql, args: UpdateAgentSessionWorkflowRunArgs): Promise<UpdateAgentSessionWorkflowRunRow | null> {
    const rows = await sql.unsafe(updateAgentSessionWorkflowRunQuery, [args.workflowRunId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const deleteAgentSessionQuery = `-- name: DeleteAgentSession :exec
DELETE FROM agent_sessions WHERE id = $1 AND user_id = $2`;

export interface DeleteAgentSessionArgs {
    id: string;
    userId: string;
}

export async function deleteAgentSession(sql: Sql, args: DeleteAgentSessionArgs): Promise<void> {
    await sql.unsafe(deleteAgentSessionQuery, [args.id, args.userId]);
}

export const createAgentMessageQuery = `-- name: CreateAgentMessage :one
INSERT INTO agent_messages (session_id, role, sequence)
VALUES ($1, $2, $3)
RETURNING id, session_id, role, sequence, created_at`;

export interface CreateAgentMessageArgs {
    sessionId: string;
    role: string;
    sequence: string;
}

export interface CreateAgentMessageRow {
    id: string;
    sessionId: string;
    role: string;
    sequence: string;
    createdAt: Date;
}

export async function createAgentMessage(sql: Sql, args: CreateAgentMessageArgs): Promise<CreateAgentMessageRow | null> {
    const rows = await sql.unsafe(createAgentMessageQuery, [args.sessionId, args.role, args.sequence]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        sessionId: row[1],
        role: row[2],
        sequence: row[3],
        createdAt: row[4]
    };
}

export const getNextAgentMessageSequenceQuery = `-- name: GetNextAgentMessageSequence :one
SELECT COALESCE(MAX(sequence), -1) + 1 AS next_seq
FROM agent_messages
WHERE session_id = $1`;

export interface GetNextAgentMessageSequenceArgs {
    sessionId: string;
}

export interface GetNextAgentMessageSequenceRow {
    nextSeq: string;
}

export async function getNextAgentMessageSequence(sql: Sql, args: GetNextAgentMessageSequenceArgs): Promise<GetNextAgentMessageSequenceRow | null> {
    const rows = await sql.unsafe(getNextAgentMessageSequenceQuery, [args.sessionId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        nextSeq: row[0]
    };
}

export const createAgentMessageWithNextSequenceQuery = `-- name: CreateAgentMessageWithNextSequence :one
WITH locked_session AS (
    SELECT agent_sessions.id
    FROM agent_sessions
    WHERE agent_sessions.id = $2
    FOR UPDATE
)
INSERT INTO agent_messages (session_id, role, sequence)
SELECT
    ls.id,
    $1,
    COALESCE((SELECT MAX(sequence) FROM agent_messages WHERE session_id = ls.id), -1) + 1
FROM locked_session ls
RETURNING id, session_id, role, sequence, created_at`;

export interface CreateAgentMessageWithNextSequenceArgs {
    role: string;
    sessionId: string;
}

export interface CreateAgentMessageWithNextSequenceRow {
    id: string;
    sessionId: string;
    role: string;
    sequence: string;
    createdAt: Date;
}

export async function createAgentMessageWithNextSequence(sql: Sql, args: CreateAgentMessageWithNextSequenceArgs): Promise<CreateAgentMessageWithNextSequenceRow | null> {
    const rows = await sql.unsafe(createAgentMessageWithNextSequenceQuery, [args.role, args.sessionId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        sessionId: row[1],
        role: row[2],
        sequence: row[3],
        createdAt: row[4]
    };
}

export const createAgentPartQuery = `-- name: CreateAgentPart :one
INSERT INTO agent_parts (message_id, part_index, part_type, content)
VALUES ($1, $2, $3, $4)
RETURNING id, message_id, part_index, part_type, content, created_at`;

export interface CreateAgentPartArgs {
    messageId: string;
    partIndex: string;
    partType: string;
    content: any;
}

export interface CreateAgentPartRow {
    id: string;
    messageId: string;
    partIndex: string;
    partType: string;
    content: any;
    createdAt: Date;
}

export async function createAgentPart(sql: Sql, args: CreateAgentPartArgs): Promise<CreateAgentPartRow | null> {
    const rows = await sql.unsafe(createAgentPartQuery, [args.messageId, args.partIndex, args.partType, args.content]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        messageId: row[1],
        partIndex: row[2],
        partType: row[3],
        content: row[4],
        createdAt: row[5]
    };
}

export const listAgentMessagePartsQuery = `-- name: ListAgentMessageParts :many
SELECT id, message_id, part_index, part_type, content, created_at
FROM agent_parts
WHERE message_id = $1
ORDER BY part_index ASC`;

export interface ListAgentMessagePartsArgs {
    messageId: string;
}

export interface ListAgentMessagePartsRow {
    id: string;
    messageId: string;
    partIndex: string;
    partType: string;
    content: any;
    createdAt: Date;
}

export async function listAgentMessageParts(sql: Sql, args: ListAgentMessagePartsArgs): Promise<ListAgentMessagePartsRow[]> {
    return (await sql.unsafe(listAgentMessagePartsQuery, [args.messageId]).values()).map(row => ({
        id: row[0],
        messageId: row[1],
        partIndex: row[2],
        partType: row[3],
        content: row[4],
        createdAt: row[5]
    }));
}

export const listAgentMessagesQuery = `-- name: ListAgentMessages :many
SELECT id, session_id, role, sequence, created_at
FROM agent_messages
WHERE session_id = $1
ORDER BY sequence ASC
LIMIT $3
OFFSET $2`;

export interface ListAgentMessagesArgs {
    sessionId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListAgentMessagesRow {
    id: string;
    sessionId: string;
    role: string;
    sequence: string;
    createdAt: Date;
}

export async function listAgentMessages(sql: Sql, args: ListAgentMessagesArgs): Promise<ListAgentMessagesRow[]> {
    return (await sql.unsafe(listAgentMessagesQuery, [args.sessionId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        sessionId: row[1],
        role: row[2],
        sequence: row[3],
        createdAt: row[4]
    }));
}

export const getAgentSessionWorkflowRunIDQuery = `-- name: GetAgentSessionWorkflowRunID :one
SELECT workflow_run_id FROM agent_sessions WHERE id = $1`;

export interface GetAgentSessionWorkflowRunIDArgs {
    id: string;
}

export interface GetAgentSessionWorkflowRunIDRow {
    workflowRunId: string | null;
}

export async function getAgentSessionWorkflowRunID(sql: Sql, args: GetAgentSessionWorkflowRunIDArgs): Promise<GetAgentSessionWorkflowRunIDRow | null> {
    const rows = await sql.unsafe(getAgentSessionWorkflowRunIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        workflowRunId: row[0]
    };
}

export const listStaleActiveSessionsQuery = `-- name: ListStaleActiveSessions :many
SELECT id, repository_id, user_id, workflow_run_id, title, status, started_at, finished_at, created_at, updated_at
FROM agent_sessions
WHERE status = 'active'
  AND started_at IS NOT NULL
  AND started_at < $1
ORDER BY started_at ASC`;

export interface ListStaleActiveSessionsArgs {
    startedAt: Date | null;
}

export interface ListStaleActiveSessionsRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listStaleActiveSessions(sql: Sql, args: ListStaleActiveSessionsArgs): Promise<ListStaleActiveSessionsRow[]> {
    return (await sql.unsafe(listStaleActiveSessionsQuery, [args.startedAt]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const notifyAgentMessageQuery = `-- name: NotifyAgentMessage :exec
SELECT pg_notify(
    'agent_session_' || replace($1::text, '-', ''),
    $2::text
)`;

export interface NotifyAgentMessageArgs {
    sessionId: string;
    payload: string;
}

export interface NotifyAgentMessageRow {
    pgNotify: string;
}

export async function notifyAgentMessage(sql: Sql, args: NotifyAgentMessageArgs): Promise<void> {
    await sql.unsafe(notifyAgentMessageQuery, [args.sessionId, args.payload]);
}

export const countAgentMessagesBySessionQuery = `-- name: CountAgentMessagesBySession :one
SELECT COUNT(*) FROM agent_messages WHERE session_id = $1`;

export interface CountAgentMessagesBySessionArgs {
    sessionId: string;
}

export interface CountAgentMessagesBySessionRow {
    count: string;
}

export async function countAgentMessagesBySession(sql: Sql, args: CountAgentMessagesBySessionArgs): Promise<CountAgentMessagesBySessionRow | null> {
    const rows = await sql.unsafe(countAgentMessagesBySessionQuery, [args.sessionId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listAgentSessionsByRepoWithMessageCountQuery = `-- name: ListAgentSessionsByRepoWithMessageCount :many
SELECT
    s.id,
    s.repository_id,
    s.user_id,
    s.workflow_run_id,
    s.title,
    s.status,
    s.started_at,
    s.finished_at,
    s.created_at,
    s.updated_at,
    COALESCE(mc.cnt, 0)::bigint AS message_count
FROM agent_sessions s
LEFT JOIN (
    SELECT session_id, COUNT(*) AS cnt
    FROM agent_messages
    GROUP BY session_id
) mc ON mc.session_id = s.id
WHERE s.repository_id = $1
ORDER BY s.created_at DESC
LIMIT $3
OFFSET $2`;

export interface ListAgentSessionsByRepoWithMessageCountArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListAgentSessionsByRepoWithMessageCountRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    messageCount: string;
}

export async function listAgentSessionsByRepoWithMessageCount(sql: Sql, args: ListAgentSessionsByRepoWithMessageCountArgs): Promise<ListAgentSessionsByRepoWithMessageCountRow[]> {
    return (await sql.unsafe(listAgentSessionsByRepoWithMessageCountQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9],
        messageCount: row[10]
    }));
}

export const getAgentSessionWithMessageCountQuery = `-- name: GetAgentSessionWithMessageCount :one
SELECT
    s.id,
    s.repository_id,
    s.user_id,
    s.workflow_run_id,
    s.title,
    s.status,
    s.started_at,
    s.finished_at,
    s.created_at,
    s.updated_at,
    COALESCE(mc.cnt, 0)::bigint AS message_count
FROM agent_sessions s
LEFT JOIN (
    SELECT session_id, COUNT(*) AS cnt
    FROM agent_messages
    GROUP BY session_id
) mc ON mc.session_id = s.id
WHERE s.id = $1`;

export interface GetAgentSessionWithMessageCountArgs {
    id: string;
}

export interface GetAgentSessionWithMessageCountRow {
    id: string;
    repositoryId: string;
    userId: string;
    workflowRunId: string | null;
    title: string;
    status: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    messageCount: string;
}

export async function getAgentSessionWithMessageCount(sql: Sql, args: GetAgentSessionWithMessageCountArgs): Promise<GetAgentSessionWithMessageCountRow | null> {
    const rows = await sql.unsafe(getAgentSessionWithMessageCountQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        workflowRunId: row[3],
        title: row[4],
        status: row[5],
        startedAt: row[6],
        finishedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9],
        messageCount: row[10]
    };
}

export const notifyAgentSessionQuery = `-- name: NotifyAgentSession :exec
SELECT pg_notify(
    'agent_session_' || $1::text,
    $2::text
)`;

export interface NotifyAgentSessionArgs {
    sessionId: string;
    payload: string;
}

export interface NotifyAgentSessionRow {
    pgNotify: string;
}

export async function notifyAgentSession(sql: Sql, args: NotifyAgentSessionArgs): Promise<void> {
    await sql.unsafe(notifyAgentSessionQuery, [args.sessionId, args.payload]);
}

export const listAgentMessagesAfterIDQuery = `-- name: ListAgentMessagesAfterID :many
SELECT id, session_id, role, sequence, created_at
FROM agent_messages
WHERE session_id = $1 AND id > $2
ORDER BY id ASC
LIMIT $3`;

export interface ListAgentMessagesAfterIDArgs {
    sessionId: string;
    afterId: string;
    maxResults: string;
}

export interface ListAgentMessagesAfterIDRow {
    id: string;
    sessionId: string;
    role: string;
    sequence: string;
    createdAt: Date;
}

export async function listAgentMessagesAfterID(sql: Sql, args: ListAgentMessagesAfterIDArgs): Promise<ListAgentMessagesAfterIDRow[]> {
    return (await sql.unsafe(listAgentMessagesAfterIDQuery, [args.sessionId, args.afterId, args.maxResults]).values()).map(row => ({
        id: row[0],
        sessionId: row[1],
        role: row[2],
        sequence: row[3],
        createdAt: row[4]
    }));
}

