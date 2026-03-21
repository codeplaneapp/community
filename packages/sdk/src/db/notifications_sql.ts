import { Sql } from "postgres";

export const listNotificationsByUserQuery = `-- name: ListNotificationsByUser :many
SELECT id, user_id, source_type, source_id, subject, body, status, read_at, created_at, updated_at
FROM notifications
WHERE user_id = $1
ORDER BY created_at DESC
LIMIT $3
OFFSET $2`;

export interface ListNotificationsByUserArgs {
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListNotificationsByUserRow {
    id: string;
    userId: string;
    sourceType: string;
    sourceId: string | null;
    subject: string;
    body: string;
    status: string;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listNotificationsByUser(sql: Sql, args: ListNotificationsByUserArgs): Promise<ListNotificationsByUserRow[]> {
    return (await sql.unsafe(listNotificationsByUserQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        sourceType: row[2],
        sourceId: row[3],
        subject: row[4],
        body: row[5],
        status: row[6],
        readAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const createNotificationQuery = `-- name: CreateNotification :one
INSERT INTO notifications (user_id, source_type, source_id, subject, body)
VALUES (
    $1,
    $2,
    $3,
    $4,
    $5
)
RETURNING id, user_id, source_type, source_id, subject, body, status, read_at, created_at, updated_at`;

export interface CreateNotificationArgs {
    userId: string;
    sourceType: string;
    sourceId: string | null;
    subject: string;
    body: string;
}

export interface CreateNotificationRow {
    id: string;
    userId: string;
    sourceType: string;
    sourceId: string | null;
    subject: string;
    body: string;
    status: string;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createNotification(sql: Sql, args: CreateNotificationArgs): Promise<CreateNotificationRow | null> {
    const rows = await sql.unsafe(createNotificationQuery, [args.userId, args.sourceType, args.sourceId, args.subject, args.body]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        sourceType: row[2],
        sourceId: row[3],
        subject: row[4],
        body: row[5],
        status: row[6],
        readAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const countNotificationsByUserQuery = `-- name: CountNotificationsByUser :one
SELECT COUNT(*)
FROM notifications
WHERE user_id = $1`;

export interface CountNotificationsByUserArgs {
    userId: string;
}

export interface CountNotificationsByUserRow {
    count: string;
}

export async function countNotificationsByUser(sql: Sql, args: CountNotificationsByUserArgs): Promise<CountNotificationsByUserRow | null> {
    const rows = await sql.unsafe(countNotificationsByUserQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const notifyUserQuery = `-- name: NotifyUser :exec
SELECT pg_notify(
    'user_notifications_' || $1::bigint::text,
    $2::text
)`;

export interface NotifyUserArgs {
    userId: string;
    payload: string;
}

export interface NotifyUserRow {
    pgNotify: string;
}

export async function notifyUser(sql: Sql, args: NotifyUserArgs): Promise<void> {
    await sql.unsafe(notifyUserQuery, [args.userId, args.payload]);
}

export const markNotificationReadQuery = `-- name: MarkNotificationRead :exec
UPDATE notifications
SET status = 'read',
    read_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND user_id = $2`;

export interface MarkNotificationReadArgs {
    id: string;
    userId: string;
}

export async function markNotificationRead(sql: Sql, args: MarkNotificationReadArgs): Promise<void> {
    await sql.unsafe(markNotificationReadQuery, [args.id, args.userId]);
}

export const listNotificationsAfterIDQuery = `-- name: ListNotificationsAfterID :many
SELECT id, user_id, source_type, source_id, subject, body, status, read_at, created_at, updated_at
FROM notifications
WHERE user_id = $1
  AND id > $2
ORDER BY id ASC
LIMIT $3`;

export interface ListNotificationsAfterIDArgs {
    userId: string;
    afterId: string;
    maxResults: string;
}

export interface ListNotificationsAfterIDRow {
    id: string;
    userId: string;
    sourceType: string;
    sourceId: string | null;
    subject: string;
    body: string;
    status: string;
    readAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listNotificationsAfterID(sql: Sql, args: ListNotificationsAfterIDArgs): Promise<ListNotificationsAfterIDRow[]> {
    return (await sql.unsafe(listNotificationsAfterIDQuery, [args.userId, args.afterId, args.maxResults]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        sourceType: row[2],
        sourceId: row[3],
        subject: row[4],
        body: row[5],
        status: row[6],
        readAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const markAllNotificationsReadQuery = `-- name: MarkAllNotificationsRead :exec
UPDATE notifications
SET status = 'read',
    read_at = NOW(),
    updated_at = NOW()
WHERE user_id = $1
  AND status = 'unread'`;

export interface MarkAllNotificationsReadArgs {
    userId: string;
}

export async function markAllNotificationsRead(sql: Sql, args: MarkAllNotificationsReadArgs): Promise<void> {
    await sql.unsafe(markAllNotificationsReadQuery, [args.userId]);
}

