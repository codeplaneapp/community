import { Sql } from "postgres";

export const pinIssueQuery = `-- name: PinIssue :one
INSERT INTO pinned_issues (repository_id, issue_id, pinned_by_id, position)
VALUES ($1, $2, $3, $4)
RETURNING repository_id, issue_id, pinned_by_id, position, pinned_at`;

export interface PinIssueArgs {
    repositoryId: string;
    issueId: string;
    pinnedById: string | null;
    position: number;
}

export interface PinIssueRow {
    repositoryId: string;
    issueId: string;
    pinnedById: string | null;
    position: number;
    pinnedAt: Date;
}

export async function pinIssue(sql: Sql, args: PinIssueArgs): Promise<PinIssueRow | null> {
    const rows = await sql.unsafe(pinIssueQuery, [args.repositoryId, args.issueId, args.pinnedById, args.position]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        repositoryId: row[0],
        issueId: row[1],
        pinnedById: row[2],
        position: row[3],
        pinnedAt: row[4]
    };
}

export const listPinnedIssuesQuery = `-- name: ListPinnedIssues :many
SELECT repository_id, issue_id, pinned_by_id, position, pinned_at
FROM pinned_issues
WHERE repository_id = $1
ORDER BY position ASC`;

export interface ListPinnedIssuesArgs {
    repositoryId: string;
}

export interface ListPinnedIssuesRow {
    repositoryId: string;
    issueId: string;
    pinnedById: string | null;
    position: number;
    pinnedAt: Date;
}

export async function listPinnedIssues(sql: Sql, args: ListPinnedIssuesArgs): Promise<ListPinnedIssuesRow[]> {
    return (await sql.unsafe(listPinnedIssuesQuery, [args.repositoryId]).values()).map(row => ({
        repositoryId: row[0],
        issueId: row[1],
        pinnedById: row[2],
        position: row[3],
        pinnedAt: row[4]
    }));
}

export const unpinIssueQuery = `-- name: UnpinIssue :exec
DELETE FROM pinned_issues
WHERE repository_id = $1
  AND issue_id = $2`;

export interface UnpinIssueArgs {
    repositoryId: string;
    issueId: string;
}

export async function unpinIssue(sql: Sql, args: UnpinIssueArgs): Promise<void> {
    await sql.unsafe(unpinIssueQuery, [args.repositoryId, args.issueId]);
}

export const updatePinnedIssuePositionQuery = `-- name: UpdatePinnedIssuePosition :one
UPDATE pinned_issues
SET position = $1
WHERE repository_id = $2
  AND issue_id = $3
RETURNING repository_id, issue_id, pinned_by_id, position, pinned_at`;

export interface UpdatePinnedIssuePositionArgs {
    position: number;
    repositoryId: string;
    issueId: string;
}

export interface UpdatePinnedIssuePositionRow {
    repositoryId: string;
    issueId: string;
    pinnedById: string | null;
    position: number;
    pinnedAt: Date;
}

export async function updatePinnedIssuePosition(sql: Sql, args: UpdatePinnedIssuePositionArgs): Promise<UpdatePinnedIssuePositionRow | null> {
    const rows = await sql.unsafe(updatePinnedIssuePositionQuery, [args.position, args.repositoryId, args.issueId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        repositoryId: row[0],
        issueId: row[1],
        pinnedById: row[2],
        position: row[3],
        pinnedAt: row[4]
    };
}

