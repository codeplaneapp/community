import { Sql } from "postgres";

export const upsertConflictQuery = `-- name: UpsertConflict :one
INSERT INTO conflicts (repository_id, change_id, file_path, conflict_type)
VALUES ($1, $2, $3, $4)
ON CONFLICT (repository_id, change_id, file_path)
DO UPDATE SET
    conflict_type = EXCLUDED.conflict_type,
    resolved = FALSE,
    resolved_by = NULL,
    resolution_method = '',
    resolved_at = NULL,
    updated_at = NOW()
RETURNING id, repository_id, change_id, file_path, conflict_type, resolved, resolved_by, resolution_method, resolved_at, created_at, updated_at`;

export interface UpsertConflictArgs {
    repositoryId: string;
    changeId: string;
    filePath: string;
    conflictType: string;
}

export interface UpsertConflictRow {
    id: string;
    repositoryId: string;
    changeId: string;
    filePath: string;
    conflictType: string;
    resolved: boolean;
    resolvedBy: string | null;
    resolutionMethod: string;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertConflict(sql: Sql, args: UpsertConflictArgs): Promise<UpsertConflictRow | null> {
    const rows = await sql.unsafe(upsertConflictQuery, [args.repositoryId, args.changeId, args.filePath, args.conflictType]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        filePath: row[3],
        conflictType: row[4],
        resolved: row[5],
        resolvedBy: row[6],
        resolutionMethod: row[7],
        resolvedAt: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    };
}

export const markConflictResolvedQuery = `-- name: MarkConflictResolved :execrows
UPDATE conflicts
SET resolved = TRUE,
    resolved_by = $4,
    resolution_method = $5,
    resolved_at = NOW(),
    updated_at = NOW()
WHERE repository_id = $1
  AND change_id = $2
  AND file_path = $3`;

export interface MarkConflictResolvedArgs {
    repositoryId: string;
    changeId: string;
    filePath: string;
    resolvedBy: string | null;
    resolutionMethod: string;
}

export const listConflictsByChangeIDQuery = `-- name: ListConflictsByChangeID :many
SELECT id, repository_id, change_id, file_path, conflict_type, resolved, resolved_by, resolution_method, resolved_at, created_at, updated_at
FROM conflicts
WHERE repository_id = $1
  AND change_id = $2
ORDER BY file_path ASC
LIMIT $4
OFFSET $3`;

export interface ListConflictsByChangeIDArgs {
    repositoryId: string;
    changeId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListConflictsByChangeIDRow {
    id: string;
    repositoryId: string;
    changeId: string;
    filePath: string;
    conflictType: string;
    resolved: boolean;
    resolvedBy: string | null;
    resolutionMethod: string;
    resolvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listConflictsByChangeID(sql: Sql, args: ListConflictsByChangeIDArgs): Promise<ListConflictsByChangeIDRow[]> {
    return (await sql.unsafe(listConflictsByChangeIDQuery, [args.repositoryId, args.changeId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        changeId: row[2],
        filePath: row[3],
        conflictType: row[4],
        resolved: row[5],
        resolvedBy: row[6],
        resolutionMethod: row[7],
        resolvedAt: row[8],
        createdAt: row[9],
        updatedAt: row[10]
    }));
}

export const deleteConflictsByChangeIDQuery = `-- name: DeleteConflictsByChangeID :execrows
DELETE FROM conflicts
WHERE repository_id = $1
  AND change_id = $2`;

export interface DeleteConflictsByChangeIDArgs {
    repositoryId: string;
    changeId: string;
}

