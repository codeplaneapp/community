import { Sql } from "postgres";

export const addReactionQuery = `-- name: AddReaction :one
INSERT INTO reactions (user_id, target_type, target_id, emoji)
VALUES ($1, $2, $3, $4)
RETURNING id, user_id, target_type, target_id, emoji, created_at`;

export interface AddReactionArgs {
    userId: string;
    targetType: string;
    targetId: string;
    emoji: string;
}

export interface AddReactionRow {
    id: string;
    userId: string;
    targetType: string;
    targetId: string;
    emoji: string;
    createdAt: Date;
}

export async function addReaction(sql: Sql, args: AddReactionArgs): Promise<AddReactionRow | null> {
    const rows = await sql.unsafe(addReactionQuery, [args.userId, args.targetType, args.targetId, args.emoji]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        targetType: row[2],
        targetId: row[3],
        emoji: row[4],
        createdAt: row[5]
    };
}

export const listReactionsQuery = `-- name: ListReactions :many
SELECT id, user_id, target_type, target_id, emoji, created_at
FROM reactions
WHERE target_type = $1
  AND target_id = $2
ORDER BY created_at ASC`;

export interface ListReactionsArgs {
    targetType: string;
    targetId: string;
}

export interface ListReactionsRow {
    id: string;
    userId: string;
    targetType: string;
    targetId: string;
    emoji: string;
    createdAt: Date;
}

export async function listReactions(sql: Sql, args: ListReactionsArgs): Promise<ListReactionsRow[]> {
    return (await sql.unsafe(listReactionsQuery, [args.targetType, args.targetId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        targetType: row[2],
        targetId: row[3],
        emoji: row[4],
        createdAt: row[5]
    }));
}

export const countReactionsQuery = `-- name: CountReactions :one
SELECT COUNT(*)
FROM reactions
WHERE target_type = $1
  AND target_id = $2`;

export interface CountReactionsArgs {
    targetType: string;
    targetId: string;
}

export interface CountReactionsRow {
    count: string;
}

export async function countReactions(sql: Sql, args: CountReactionsArgs): Promise<CountReactionsRow | null> {
    const rows = await sql.unsafe(countReactionsQuery, [args.targetType, args.targetId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const deleteReactionQuery = `-- name: DeleteReaction :exec
DELETE FROM reactions
WHERE user_id = $1
  AND target_type = $2
  AND target_id = $3
  AND emoji = $4`;

export interface DeleteReactionArgs {
    userId: string;
    targetType: string;
    targetId: string;
    emoji: string;
}

export async function deleteReaction(sql: Sql, args: DeleteReactionArgs): Promise<void> {
    await sql.unsafe(deleteReactionQuery, [args.userId, args.targetType, args.targetId, args.emoji]);
}

export const deleteAllReactionsForTargetQuery = `-- name: DeleteAllReactionsForTarget :exec
DELETE FROM reactions
WHERE target_type = $1
  AND target_id = $2`;

export interface DeleteAllReactionsForTargetArgs {
    targetType: string;
    targetId: string;
}

export async function deleteAllReactionsForTarget(sql: Sql, args: DeleteAllReactionsForTargetArgs): Promise<void> {
    await sql.unsafe(deleteAllReactionsForTargetQuery, [args.targetType, args.targetId]);
}

