import { Sql } from "postgres";

export const insertAuditLogQuery = `-- name: InsertAuditLog :exec
INSERT INTO audit_log (event_type, actor_id, actor_name, target_type, target_id, target_name, action, metadata, ip_address)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;

export interface InsertAuditLogArgs {
    eventType: string;
    actorId: string | null;
    actorName: string;
    targetType: string;
    targetId: string | null;
    targetName: string;
    action: string;
    metadata: any;
    ipAddress: string;
}

export async function insertAuditLog(sql: Sql, args: InsertAuditLogArgs): Promise<void> {
    await sql.unsafe(insertAuditLogQuery, [args.eventType, args.actorId, args.actorName, args.targetType, args.targetId, args.targetName, args.action, args.metadata, args.ipAddress]);
}

export const listAuditLogsQuery = `-- name: ListAuditLogs :many
SELECT id, event_type, actor_id, actor_name, target_type, target_id, target_name, action, metadata, ip_address, created_at FROM audit_log
WHERE created_at >= $1
ORDER BY created_at DESC
LIMIT $3 OFFSET $2`;

export interface ListAuditLogsArgs {
    since: Date;
    pageOffset: string;
    pageLimit: string;
}

export interface ListAuditLogsRow {
    id: string;
    eventType: string;
    actorId: string | null;
    actorName: string;
    targetType: string;
    targetId: string | null;
    targetName: string;
    action: string;
    metadata: any;
    ipAddress: string;
    createdAt: Date;
}

export async function listAuditLogs(sql: Sql, args: ListAuditLogsArgs): Promise<ListAuditLogsRow[]> {
    return (await sql.unsafe(listAuditLogsQuery, [args.since, args.pageOffset, args.pageLimit]).values()).map(row => ({
        id: row[0],
        eventType: row[1],
        actorId: row[2],
        actorName: row[3],
        targetType: row[4],
        targetId: row[5],
        targetName: row[6],
        action: row[7],
        metadata: row[8],
        ipAddress: row[9],
        createdAt: row[10]
    }));
}

export const listAuditLogsByActorQuery = `-- name: ListAuditLogsByActor :many
SELECT id, event_type, actor_id, actor_name, target_type, target_id, target_name, action, metadata, ip_address, created_at FROM audit_log
WHERE actor_id = $1 AND created_at >= $2
ORDER BY created_at DESC
LIMIT $4 OFFSET $3`;

export interface ListAuditLogsByActorArgs {
    actorId: string | null;
    since: Date;
    pageOffset: string;
    pageLimit: string;
}

export interface ListAuditLogsByActorRow {
    id: string;
    eventType: string;
    actorId: string | null;
    actorName: string;
    targetType: string;
    targetId: string | null;
    targetName: string;
    action: string;
    metadata: any;
    ipAddress: string;
    createdAt: Date;
}

export async function listAuditLogsByActor(sql: Sql, args: ListAuditLogsByActorArgs): Promise<ListAuditLogsByActorRow[]> {
    return (await sql.unsafe(listAuditLogsByActorQuery, [args.actorId, args.since, args.pageOffset, args.pageLimit]).values()).map(row => ({
        id: row[0],
        eventType: row[1],
        actorId: row[2],
        actorName: row[3],
        targetType: row[4],
        targetId: row[5],
        targetName: row[6],
        action: row[7],
        metadata: row[8],
        ipAddress: row[9],
        createdAt: row[10]
    }));
}

export const listPublicAuditLogsByActorQuery = `-- name: ListPublicAuditLogsByActor :many
SELECT al.id, al.event_type, al.actor_id, al.actor_name, al.target_type, al.target_id, al.target_name, al.action, al.metadata, al.ip_address, al.created_at
FROM audit_log al
JOIN repositories r ON r.id = al.target_id
WHERE al.actor_id = $1
  AND al.created_at >= $2
  AND al.target_type = 'repository'
  AND al.event_type LIKE 'repo.%'
  AND r.is_public = TRUE
ORDER BY al.created_at DESC
LIMIT $4 OFFSET $3`;

export interface ListPublicAuditLogsByActorArgs {
    actorId: string | null;
    since: Date;
    pageOffset: string;
    pageLimit: string;
}

export interface ListPublicAuditLogsByActorRow {
    id: string;
    eventType: string;
    actorId: string | null;
    actorName: string;
    targetType: string;
    targetId: string | null;
    targetName: string;
    action: string;
    metadata: any;
    ipAddress: string;
    createdAt: Date;
}

export async function listPublicAuditLogsByActor(sql: Sql, args: ListPublicAuditLogsByActorArgs): Promise<ListPublicAuditLogsByActorRow[]> {
    return (await sql.unsafe(listPublicAuditLogsByActorQuery, [args.actorId, args.since, args.pageOffset, args.pageLimit]).values()).map(row => ({
        id: row[0],
        eventType: row[1],
        actorId: row[2],
        actorName: row[3],
        targetType: row[4],
        targetId: row[5],
        targetName: row[6],
        action: row[7],
        metadata: row[8],
        ipAddress: row[9],
        createdAt: row[10]
    }));
}

export const countPublicAuditLogsByActorQuery = `-- name: CountPublicAuditLogsByActor :one
SELECT COUNT(*)
FROM audit_log al
JOIN repositories r ON r.id = al.target_id
WHERE al.actor_id = $1
  AND al.created_at >= $2
  AND al.target_type = 'repository'
  AND al.event_type LIKE 'repo.%'
  AND r.is_public = TRUE`;

export interface CountPublicAuditLogsByActorArgs {
    actorId: string | null;
    since: Date;
}

export interface CountPublicAuditLogsByActorRow {
    count: string;
}

export async function countPublicAuditLogsByActor(sql: Sql, args: CountPublicAuditLogsByActorArgs): Promise<CountPublicAuditLogsByActorRow | null> {
    const rows = await sql.unsafe(countPublicAuditLogsByActorQuery, [args.actorId, args.since]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const deleteAuditLogsOlderThanQuery = `-- name: DeleteAuditLogsOlderThan :exec
DELETE FROM audit_log WHERE created_at < $1`;

export interface DeleteAuditLogsOlderThanArgs {
    createdAt: Date;
}

export async function deleteAuditLogsOlderThan(sql: Sql, args: DeleteAuditLogsOlderThanArgs): Promise<void> {
    await sql.unsafe(deleteAuditLogsOlderThanQuery, [args.createdAt]);
}

