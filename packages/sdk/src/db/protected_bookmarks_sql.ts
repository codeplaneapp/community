import { Sql } from "postgres";

export const upsertProtectedBookmarkQuery = `-- name: UpsertProtectedBookmark :one
INSERT INTO protected_bookmarks (
    repository_id,
    pattern,
    require_review,
    required_approvals,
    required_checks,
    require_status_checks,
    required_status_contexts,
    dismiss_stale_reviews,
    restrict_push_teams
)
VALUES (
    $1,
    $2,
    $3,
    $4,
    COALESCE($5::text[], '{}'::text[]),
    $6,
    COALESCE($7::text[], '{}'::text[]),
    $8,
    COALESCE($9::text[], '{}'::text[])
)
ON CONFLICT (repository_id, pattern)
DO UPDATE SET
    require_review = EXCLUDED.require_review,
    required_approvals = EXCLUDED.required_approvals,
    required_checks = EXCLUDED.required_checks,
    require_status_checks = EXCLUDED.require_status_checks,
    required_status_contexts = EXCLUDED.required_status_contexts,
    dismiss_stale_reviews = EXCLUDED.dismiss_stale_reviews,
    restrict_push_teams = EXCLUDED.restrict_push_teams,
    updated_at = NOW()
RETURNING id, repository_id, pattern, require_review, required_approvals, required_checks, require_status_checks, required_status_contexts, dismiss_stale_reviews, restrict_push_teams, created_at, updated_at`;

export interface UpsertProtectedBookmarkArgs {
    repositoryId: string;
    pattern: string;
    requireReview: boolean;
    requiredApprovals: string;
    requiredChecks: string[];
    requireStatusChecks: boolean;
    requiredStatusContexts: string[];
    dismissStaleReviews: boolean;
    restrictPushTeams: string[];
}

export interface UpsertProtectedBookmarkRow {
    id: string;
    repositoryId: string;
    pattern: string;
    requireReview: boolean;
    requiredApprovals: string;
    requiredChecks: string[];
    requireStatusChecks: boolean;
    requiredStatusContexts: string[];
    dismissStaleReviews: boolean;
    restrictPushTeams: string[];
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertProtectedBookmark(sql: Sql, args: UpsertProtectedBookmarkArgs): Promise<UpsertProtectedBookmarkRow | null> {
    const rows = await sql.unsafe(upsertProtectedBookmarkQuery, [args.repositoryId, args.pattern, args.requireReview, args.requiredApprovals, args.requiredChecks, args.requireStatusChecks, args.requiredStatusContexts, args.dismissStaleReviews, args.restrictPushTeams]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        pattern: row[2],
        requireReview: row[3],
        requiredApprovals: row[4],
        requiredChecks: row[5],
        requireStatusChecks: row[6],
        requiredStatusContexts: row[7],
        dismissStaleReviews: row[8],
        restrictPushTeams: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const listProtectedBookmarksByRepoQuery = `-- name: ListProtectedBookmarksByRepo :many
SELECT id, repository_id, pattern, require_review, required_approvals, required_checks, require_status_checks, required_status_contexts, dismiss_stale_reviews, restrict_push_teams, created_at, updated_at
FROM protected_bookmarks
WHERE repository_id = $1
ORDER BY pattern ASC
LIMIT $3
OFFSET $2`;

export interface ListProtectedBookmarksByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListProtectedBookmarksByRepoRow {
    id: string;
    repositoryId: string;
    pattern: string;
    requireReview: boolean;
    requiredApprovals: string;
    requiredChecks: string[];
    requireStatusChecks: boolean;
    requiredStatusContexts: string[];
    dismissStaleReviews: boolean;
    restrictPushTeams: string[];
    createdAt: Date;
    updatedAt: Date;
}

export async function listProtectedBookmarksByRepo(sql: Sql, args: ListProtectedBookmarksByRepoArgs): Promise<ListProtectedBookmarksByRepoRow[]> {
    return (await sql.unsafe(listProtectedBookmarksByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        pattern: row[2],
        requireReview: row[3],
        requiredApprovals: row[4],
        requiredChecks: row[5],
        requireStatusChecks: row[6],
        requiredStatusContexts: row[7],
        dismissStaleReviews: row[8],
        restrictPushTeams: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const listAllProtectedBookmarksByRepoQuery = `-- name: ListAllProtectedBookmarksByRepo :many
SELECT id, repository_id, pattern, require_review, required_approvals, required_checks, require_status_checks, required_status_contexts, dismiss_stale_reviews, restrict_push_teams, created_at, updated_at
FROM protected_bookmarks
WHERE repository_id = $1
ORDER BY pattern ASC`;

export interface ListAllProtectedBookmarksByRepoArgs {
    repositoryId: string;
}

export interface ListAllProtectedBookmarksByRepoRow {
    id: string;
    repositoryId: string;
    pattern: string;
    requireReview: boolean;
    requiredApprovals: string;
    requiredChecks: string[];
    requireStatusChecks: boolean;
    requiredStatusContexts: string[];
    dismissStaleReviews: boolean;
    restrictPushTeams: string[];
    createdAt: Date;
    updatedAt: Date;
}

export async function listAllProtectedBookmarksByRepo(sql: Sql, args: ListAllProtectedBookmarksByRepoArgs): Promise<ListAllProtectedBookmarksByRepoRow[]> {
    return (await sql.unsafe(listAllProtectedBookmarksByRepoQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        pattern: row[2],
        requireReview: row[3],
        requiredApprovals: row[4],
        requiredChecks: row[5],
        requireStatusChecks: row[6],
        requiredStatusContexts: row[7],
        dismissStaleReviews: row[8],
        restrictPushTeams: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const deleteProtectedBookmarkByPatternQuery = `-- name: DeleteProtectedBookmarkByPattern :execrows
DELETE FROM protected_bookmarks
WHERE repository_id = $1
  AND pattern = $2`;

export interface DeleteProtectedBookmarkByPatternArgs {
    repositoryId: string;
    pattern: string;
}

