import { Sql } from "postgres";

export const createSSETicketQuery = `-- name: CreateSSETicket :one
INSERT INTO sse_tickets (ticket_hash, user_id, expires_at)
VALUES ($1, $2, $3)
RETURNING ticket_hash, user_id, created_at, expires_at, used_at`;

export interface CreateSSETicketArgs {
    ticketHash: string;
    userId: string;
    expiresAt: Date;
}

export interface CreateSSETicketRow {
    ticketHash: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function createSSETicket(sql: Sql, args: CreateSSETicketArgs): Promise<CreateSSETicketRow | null> {
    const rows = await sql.unsafe(createSSETicketQuery, [args.ticketHash, args.userId, args.expiresAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        ticketHash: row[0],
        userId: row[1],
        createdAt: row[2],
        expiresAt: row[3],
        usedAt: row[4]
    };
}

export const consumeSSETicketQuery = `-- name: ConsumeSSETicket :one
UPDATE sse_tickets
SET used_at = NOW()
WHERE ticket_hash = $1
  AND used_at IS NULL
  AND expires_at > NOW()
RETURNING ticket_hash, user_id, created_at, expires_at, used_at`;

export interface ConsumeSSETicketArgs {
    ticketHash: string;
}

export interface ConsumeSSETicketRow {
    ticketHash: string;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
}

export async function consumeSSETicket(sql: Sql, args: ConsumeSSETicketArgs): Promise<ConsumeSSETicketRow | null> {
    const rows = await sql.unsafe(consumeSSETicketQuery, [args.ticketHash]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        ticketHash: row[0],
        userId: row[1],
        createdAt: row[2],
        expiresAt: row[3],
        usedAt: row[4]
    };
}

export const deleteExpiredSSETicketsQuery = `-- name: DeleteExpiredSSETickets :exec
DELETE FROM sse_tickets
WHERE expires_at < NOW()`;

export async function deleteExpiredSSETickets(sql: Sql): Promise<void> {
    await sql.unsafe(deleteExpiredSSETicketsQuery, []);
}

