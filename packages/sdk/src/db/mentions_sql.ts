import { Sql } from "postgres";

export const createMentionQuery = `-- name: CreateMention :one
INSERT INTO mentions (repository_id, issue_id, landing_request_id, comment_type, comment_id, user_id, mentioned_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, repository_id, issue_id, landing_request_id, comment_type, comment_id, user_id, mentioned_user_id, created_at`;

export interface CreateMentionArgs {
    repositoryId: string;
    issueId: string | null;
    landingRequestId: string | null;
    commentType: string;
    commentId: string | null;
    userId: string | null;
    mentionedUserId: string;
}

export interface CreateMentionRow {
    id: string;
    repositoryId: string;
    issueId: string | null;
    landingRequestId: string | null;
    commentType: string;
    commentId: string | null;
    userId: string | null;
    mentionedUserId: string;
    createdAt: Date;
}

export async function createMention(sql: Sql, args: CreateMentionArgs): Promise<CreateMentionRow | null> {
    const rows = await sql.unsafe(createMentionQuery, [args.repositoryId, args.issueId, args.landingRequestId, args.commentType, args.commentId, args.userId, args.mentionedUserId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        landingRequestId: row[3],
        commentType: row[4],
        commentId: row[5],
        userId: row[6],
        mentionedUserId: row[7],
        createdAt: row[8]
    };
}

export const listMentionsForUserQuery = `-- name: ListMentionsForUser :many
SELECT id, repository_id, issue_id, landing_request_id, comment_type, comment_id, user_id, mentioned_user_id, created_at
FROM mentions
WHERE mentioned_user_id = $1
ORDER BY created_at DESC
LIMIT $3
OFFSET $2`;

export interface ListMentionsForUserArgs {
    mentionedUserId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListMentionsForUserRow {
    id: string;
    repositoryId: string;
    issueId: string | null;
    landingRequestId: string | null;
    commentType: string;
    commentId: string | null;
    userId: string | null;
    mentionedUserId: string;
    createdAt: Date;
}

export async function listMentionsForUser(sql: Sql, args: ListMentionsForUserArgs): Promise<ListMentionsForUserRow[]> {
    return (await sql.unsafe(listMentionsForUserQuery, [args.mentionedUserId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        issueId: row[2],
        landingRequestId: row[3],
        commentType: row[4],
        commentId: row[5],
        userId: row[6],
        mentionedUserId: row[7],
        createdAt: row[8]
    }));
}

export const countMentionsForUserQuery = `-- name: CountMentionsForUser :one
SELECT COUNT(*)
FROM mentions
WHERE mentioned_user_id = $1`;

export interface CountMentionsForUserArgs {
    mentionedUserId: string;
}

export interface CountMentionsForUserRow {
    count: string;
}

export async function countMentionsForUser(sql: Sql, args: CountMentionsForUserArgs): Promise<CountMentionsForUserRow | null> {
    const rows = await sql.unsafe(countMentionsForUserQuery, [args.mentionedUserId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const deleteMentionsForCommentQuery = `-- name: DeleteMentionsForComment :exec
DELETE FROM mentions
WHERE comment_type = $1
  AND comment_id = $2`;

export interface DeleteMentionsForCommentArgs {
    commentType: string;
    commentId: string | null;
}

export async function deleteMentionsForComment(sql: Sql, args: DeleteMentionsForCommentArgs): Promise<void> {
    await sql.unsafe(deleteMentionsForCommentQuery, [args.commentType, args.commentId]);
}

