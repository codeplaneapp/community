import { Sql } from "postgres";

export const createWebhookQuery = `-- name: CreateWebhook :one
INSERT INTO webhooks (repository_id, url, secret, events, is_active)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, repository_id, url, secret, events, is_active, last_delivery_at, created_at, updated_at`;

export interface CreateWebhookArgs {
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
}

export interface CreateWebhookRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWebhook(sql: Sql, args: CreateWebhookArgs): Promise<CreateWebhookRow | null> {
    const rows = await sql.unsafe(createWebhookQuery, [args.repositoryId, args.url, args.secret, args.events, args.isActive]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const getWebhookByIDQuery = `-- name: GetWebhookByID :one
SELECT id, repository_id, url, secret, events, is_active, last_delivery_at, created_at, updated_at FROM webhooks WHERE id = $1`;

export interface GetWebhookByIDArgs {
    id: string;
}

export interface GetWebhookByIDRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWebhookByID(sql: Sql, args: GetWebhookByIDArgs): Promise<GetWebhookByIDRow | null> {
    const rows = await sql.unsafe(getWebhookByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const listWebhooksByIDsQuery = `-- name: ListWebhooksByIDs :many
SELECT id, repository_id, url, secret, events, is_active, last_delivery_at, created_at, updated_at
FROM webhooks
WHERE id = ANY($1::bigint[])
ORDER BY id`;

export interface ListWebhooksByIDsArgs {
    ids: string[];
}

export interface ListWebhooksByIDsRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWebhooksByIDs(sql: Sql, args: ListWebhooksByIDsArgs): Promise<ListWebhooksByIDsRow[]> {
    return (await sql.unsafe(listWebhooksByIDsQuery, [args.ids]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const listActiveWebhooksByRepoQuery = `-- name: ListActiveWebhooksByRepo :many
SELECT id, repository_id, url, secret, events, is_active, last_delivery_at, created_at, updated_at
FROM webhooks
WHERE repository_id = $1
  AND is_active = TRUE
ORDER BY id`;

export interface ListActiveWebhooksByRepoArgs {
    repositoryId: string;
}

export interface ListActiveWebhooksByRepoRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listActiveWebhooksByRepo(sql: Sql, args: ListActiveWebhooksByRepoArgs): Promise<ListActiveWebhooksByRepoRow[]> {
    return (await sql.unsafe(listActiveWebhooksByRepoQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const listWebhooksByRepoQuery = `-- name: ListWebhooksByRepo :many
SELECT id, repository_id, url, secret, events, is_active, last_delivery_at, created_at, updated_at
FROM webhooks
WHERE repository_id = $1
ORDER BY id`;

export interface ListWebhooksByRepoArgs {
    repositoryId: string;
}

export interface ListWebhooksByRepoRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWebhooksByRepo(sql: Sql, args: ListWebhooksByRepoArgs): Promise<ListWebhooksByRepoRow[]> {
    return (await sql.unsafe(listWebhooksByRepoQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const countWebhooksByRepoQuery = `-- name: CountWebhooksByRepo :one
SELECT COUNT(*)
FROM webhooks
WHERE repository_id = $1`;

export interface CountWebhooksByRepoArgs {
    repositoryId: string;
}

export interface CountWebhooksByRepoRow {
    count: string;
}

export async function countWebhooksByRepo(sql: Sql, args: CountWebhooksByRepoArgs): Promise<CountWebhooksByRepoRow | null> {
    const rows = await sql.unsafe(countWebhooksByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listRepoWebhooksByOwnerAndRepoQuery = `-- name: ListRepoWebhooksByOwnerAndRepo :many
SELECT w.id, w.repository_id, w.url, w.secret, w.events, w.is_active, w.last_delivery_at, w.created_at, w.updated_at
FROM webhooks w
JOIN repositories r ON r.id = w.repository_id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE (LOWER(u.username) = LOWER($1) OR LOWER(o.name) = LOWER($1))
  AND r.lower_name = LOWER($2)
ORDER BY w.id`;

export interface ListRepoWebhooksByOwnerAndRepoArgs {
    owner: string;
    repo: string;
}

export interface ListRepoWebhooksByOwnerAndRepoRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listRepoWebhooksByOwnerAndRepo(sql: Sql, args: ListRepoWebhooksByOwnerAndRepoArgs): Promise<ListRepoWebhooksByOwnerAndRepoRow[]> {
    return (await sql.unsafe(listRepoWebhooksByOwnerAndRepoQuery, [args.owner, args.repo]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const deleteRepoWebhookByOwnerAndRepoQuery = `-- name: DeleteRepoWebhookByOwnerAndRepo :execrows
DELETE FROM webhooks w
WHERE w.id = $1
  AND w.repository_id IN (
    SELECT r.id
    FROM repositories r
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN organizations o ON o.id = r.org_id
    WHERE (LOWER(u.username) = LOWER($2) OR LOWER(o.name) = LOWER($2))
      AND r.lower_name = LOWER($3)
  )`;

export interface DeleteRepoWebhookByOwnerAndRepoArgs {
    webhookId: string;
    owner: string;
    repo: string;
}

export const createWebhookDeliveryQuery = `-- name: CreateWebhookDelivery :one
INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status)
VALUES ($1, $2, $3, $4)
RETURNING id, webhook_id, event_type, payload, status, response_status, response_body, attempts, delivered_at, next_retry_at, created_at, updated_at`;

export interface CreateWebhookDeliveryArgs {
    webhookId: string;
    eventType: string;
    payload: any;
    status: string;
}

export interface CreateWebhookDeliveryRow {
    id: string;
    webhookId: string;
    eventType: string;
    payload: any;
    status: string;
    responseStatus: number | null;
    responseBody: string;
    attempts: number;
    deliveredAt: Date | null;
    nextRetryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createWebhookDelivery(sql: Sql, args: CreateWebhookDeliveryArgs): Promise<CreateWebhookDeliveryRow | null> {
    const rows = await sql.unsafe(createWebhookDeliveryQuery, [args.webhookId, args.eventType, args.payload, args.status]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        webhookId: row[1],
        eventType: row[2],
        payload: row[3],
        status: row[4],
        responseStatus: row[5],
        responseBody: row[6],
        attempts: row[7],
        deliveredAt: row[8],
        nextRetryAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const updateWebhookDeliveryResultQuery = `-- name: UpdateWebhookDeliveryResult :exec
UPDATE webhook_deliveries
SET status = $2,
    response_status = $3,
    response_body = $4,
    delivered_at = NOW(),
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateWebhookDeliveryResultArgs {
    id: string;
    status: string;
    responseStatus: number | null;
    responseBody: string;
}

export async function updateWebhookDeliveryResult(sql: Sql, args: UpdateWebhookDeliveryResultArgs): Promise<void> {
    await sql.unsafe(updateWebhookDeliveryResultQuery, [args.id, args.status, args.responseStatus, args.responseBody]);
}

export const claimDueWebhookDeliveriesQuery = `-- name: ClaimDueWebhookDeliveries :many
UPDATE webhook_deliveries
SET attempts = attempts + 1,
    updated_at = NOW()
WHERE id IN (
    SELECT id
    FROM webhook_deliveries
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
    ORDER BY id
    LIMIT $1
    FOR UPDATE SKIP LOCKED
)
RETURNING id, webhook_id, event_type, payload, status, response_status, response_body, attempts, delivered_at, next_retry_at, created_at, updated_at`;

export interface ClaimDueWebhookDeliveriesArgs {
    claimLimit: string;
}

export interface ClaimDueWebhookDeliveriesRow {
    id: string;
    webhookId: string;
    eventType: string;
    payload: any;
    status: string;
    responseStatus: number | null;
    responseBody: string;
    attempts: number;
    deliveredAt: Date | null;
    nextRetryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function claimDueWebhookDeliveries(sql: Sql, args: ClaimDueWebhookDeliveriesArgs): Promise<ClaimDueWebhookDeliveriesRow[]> {
    return (await sql.unsafe(claimDueWebhookDeliveriesQuery, [args.claimLimit]).values()).map(row => ({
        id: row[0],
        webhookId: row[1],
        eventType: row[2],
        payload: row[3],
        status: row[4],
        responseStatus: row[5],
        responseBody: row[6],
        attempts: row[7],
        deliveredAt: row[8],
        nextRetryAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const updateWebhookDeliveryRetryQuery = `-- name: UpdateWebhookDeliveryRetry :exec
UPDATE webhook_deliveries
SET status = $2,
    response_status = $3,
    response_body = $4,
    next_retry_at = $5,
    delivered_at = NOW(),
    updated_at = NOW()
WHERE id = $1`;

export interface UpdateWebhookDeliveryRetryArgs {
    id: string;
    status: string;
    responseStatus: number | null;
    responseBody: string;
    nextRetryAt: Date | null;
}

export async function updateWebhookDeliveryRetry(sql: Sql, args: UpdateWebhookDeliveryRetryArgs): Promise<void> {
    await sql.unsafe(updateWebhookDeliveryRetryQuery, [args.id, args.status, args.responseStatus, args.responseBody, args.nextRetryAt]);
}

export const listRecentWebhookDeliveryStatusesQuery = `-- name: ListRecentWebhookDeliveryStatuses :many
SELECT status
FROM webhook_deliveries
WHERE webhook_id = $1
ORDER BY id DESC
LIMIT 10`;

export interface ListRecentWebhookDeliveryStatusesArgs {
    webhookId: string;
}

export interface ListRecentWebhookDeliveryStatusesRow {
    status: string;
}

export async function listRecentWebhookDeliveryStatuses(sql: Sql, args: ListRecentWebhookDeliveryStatusesArgs): Promise<ListRecentWebhookDeliveryStatusesRow[]> {
    return (await sql.unsafe(listRecentWebhookDeliveryStatusesQuery, [args.webhookId]).values()).map(row => ({
        status: row[0]
    }));
}

export const setWebhookActiveQuery = `-- name: SetWebhookActive :exec
UPDATE webhooks
SET is_active = $2,
    updated_at = NOW()
WHERE id = $1`;

export interface SetWebhookActiveArgs {
    id: string;
    isActive: boolean;
}

export async function setWebhookActive(sql: Sql, args: SetWebhookActiveArgs): Promise<void> {
    await sql.unsafe(setWebhookActiveQuery, [args.id, args.isActive]);
}

export const updateWebhookByIDQuery = `-- name: UpdateWebhookByID :one
UPDATE webhooks
SET url = $3,
    secret = $4,
    events = $5,
    is_active = $6,
    updated_at = NOW()
WHERE repository_id = $1
  AND id = $2
RETURNING id, repository_id, url, secret, events, is_active, last_delivery_at, created_at, updated_at`;

export interface UpdateWebhookByIDArgs {
    repositoryId: string;
    id: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
}

export interface UpdateWebhookByIDRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateWebhookByID(sql: Sql, args: UpdateWebhookByIDArgs): Promise<UpdateWebhookByIDRow | null> {
    const rows = await sql.unsafe(updateWebhookByIDQuery, [args.repositoryId, args.id, args.url, args.secret, args.events, args.isActive]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const deleteWebhookByIDQuery = `-- name: DeleteWebhookByID :exec
DELETE FROM webhooks
WHERE repository_id = $1
  AND id = $2`;

export interface DeleteWebhookByIDArgs {
    repositoryId: string;
    id: string;
}

export async function deleteWebhookByID(sql: Sql, args: DeleteWebhookByIDArgs): Promise<void> {
    await sql.unsafe(deleteWebhookByIDQuery, [args.repositoryId, args.id]);
}

export const getRepoWebhookByOwnerAndRepoQuery = `-- name: GetRepoWebhookByOwnerAndRepo :one
SELECT w.id, w.repository_id, w.url, w.secret, w.events, w.is_active, w.last_delivery_at, w.created_at, w.updated_at
FROM webhooks w
JOIN repositories r ON r.id = w.repository_id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE w.id = $1
  AND (LOWER(u.username) = LOWER($2) OR LOWER(o.name) = LOWER($2))
  AND r.lower_name = LOWER($3)`;

export interface GetRepoWebhookByOwnerAndRepoArgs {
    webhookId: string;
    owner: string;
    repo: string;
}

export interface GetRepoWebhookByOwnerAndRepoRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getRepoWebhookByOwnerAndRepo(sql: Sql, args: GetRepoWebhookByOwnerAndRepoArgs): Promise<GetRepoWebhookByOwnerAndRepoRow | null> {
    const rows = await sql.unsafe(getRepoWebhookByOwnerAndRepoQuery, [args.webhookId, args.owner, args.repo]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const updateRepoWebhookByOwnerAndRepoQuery = `-- name: UpdateRepoWebhookByOwnerAndRepo :one
UPDATE webhooks w
SET url = $1,
    secret = $2,
    events = $3,
    is_active = $4,
    updated_at = NOW()
FROM repositories r
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE w.id = $5
  AND w.repository_id = r.id
  AND (LOWER(u.username) = LOWER($6) OR LOWER(o.name) = LOWER($6))
  AND r.lower_name = LOWER($7)
RETURNING w.id, w.repository_id, w.url, w.secret, w.events, w.is_active, w.last_delivery_at, w.created_at, w.updated_at`;

export interface UpdateRepoWebhookByOwnerAndRepoArgs {
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    webhookId: string;
    owner: string;
    repo: string;
}

export interface UpdateRepoWebhookByOwnerAndRepoRow {
    id: string;
    repositoryId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastDeliveryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateRepoWebhookByOwnerAndRepo(sql: Sql, args: UpdateRepoWebhookByOwnerAndRepoArgs): Promise<UpdateRepoWebhookByOwnerAndRepoRow | null> {
    const rows = await sql.unsafe(updateRepoWebhookByOwnerAndRepoQuery, [args.url, args.secret, args.events, args.isActive, args.webhookId, args.owner, args.repo]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        url: row[2],
        secret: row[3],
        events: row[4],
        isActive: row[5],
        lastDeliveryAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const listWebhookDeliveriesForRepoQuery = `-- name: ListWebhookDeliveriesForRepo :many
SELECT wd.id, wd.webhook_id, wd.event_type, wd.payload, wd.status, wd.response_status, wd.response_body, wd.attempts, wd.delivered_at, wd.next_retry_at, wd.created_at, wd.updated_at
FROM webhook_deliveries wd
JOIN webhooks w ON w.id = wd.webhook_id
JOIN repositories r ON r.id = w.repository_id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE wd.webhook_id = $1
  AND w.id = $1
  AND (LOWER(u.username) = LOWER($2) OR LOWER(o.name) = LOWER($2))
  AND r.lower_name = LOWER($3)
ORDER BY wd.id DESC
LIMIT $5 OFFSET $4`;

export interface ListWebhookDeliveriesForRepoArgs {
    webhookId: string;
    owner: string;
    repo: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWebhookDeliveriesForRepoRow {
    id: string;
    webhookId: string;
    eventType: string;
    payload: any;
    status: string;
    responseStatus: number | null;
    responseBody: string;
    attempts: number;
    deliveredAt: Date | null;
    nextRetryAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWebhookDeliveriesForRepo(sql: Sql, args: ListWebhookDeliveriesForRepoArgs): Promise<ListWebhookDeliveriesForRepoRow[]> {
    return (await sql.unsafe(listWebhookDeliveriesForRepoQuery, [args.webhookId, args.owner, args.repo, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        webhookId: row[1],
        eventType: row[2],
        payload: row[3],
        status: row[4],
        responseStatus: row[5],
        responseBody: row[6],
        attempts: row[7],
        deliveredAt: row[8],
        nextRetryAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

