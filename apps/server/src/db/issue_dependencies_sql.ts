import { Sql } from "postgres";

export const addIssueDependencyQuery = `-- name: AddIssueDependency :one
INSERT INTO issue_dependencies (issue_id, depends_on_issue_id)
VALUES ($1, $2)
RETURNING issue_id, depends_on_issue_id, created_at`;

export interface AddIssueDependencyArgs {
    issueId: string;
    dependsOnIssueId: string;
}

export interface AddIssueDependencyRow {
    issueId: string;
    dependsOnIssueId: string;
    createdAt: Date;
}

export async function addIssueDependency(sql: Sql, args: AddIssueDependencyArgs): Promise<AddIssueDependencyRow | null> {
    const rows = await sql.unsafe(addIssueDependencyQuery, [args.issueId, args.dependsOnIssueId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        issueId: row[0],
        dependsOnIssueId: row[1],
        createdAt: row[2]
    };
}

export const listIssueDependenciesQuery = `-- name: ListIssueDependencies :many
SELECT issue_id, depends_on_issue_id, created_at
FROM issue_dependencies
WHERE issue_id = $1
ORDER BY depends_on_issue_id ASC`;

export interface ListIssueDependenciesArgs {
    issueId: string;
}

export interface ListIssueDependenciesRow {
    issueId: string;
    dependsOnIssueId: string;
    createdAt: Date;
}

export async function listIssueDependencies(sql: Sql, args: ListIssueDependenciesArgs): Promise<ListIssueDependenciesRow[]> {
    return (await sql.unsafe(listIssueDependenciesQuery, [args.issueId]).values()).map(row => ({
        issueId: row[0],
        dependsOnIssueId: row[1],
        createdAt: row[2]
    }));
}

export const listIssueDependentsQuery = `-- name: ListIssueDependents :many
SELECT issue_id, depends_on_issue_id, created_at
FROM issue_dependencies
WHERE depends_on_issue_id = $1
ORDER BY issue_id ASC`;

export interface ListIssueDependentsArgs {
    dependsOnIssueId: string;
}

export interface ListIssueDependentsRow {
    issueId: string;
    dependsOnIssueId: string;
    createdAt: Date;
}

export async function listIssueDependents(sql: Sql, args: ListIssueDependentsArgs): Promise<ListIssueDependentsRow[]> {
    return (await sql.unsafe(listIssueDependentsQuery, [args.dependsOnIssueId]).values()).map(row => ({
        issueId: row[0],
        dependsOnIssueId: row[1],
        createdAt: row[2]
    }));
}

export const deleteIssueDependencyQuery = `-- name: DeleteIssueDependency :exec
DELETE FROM issue_dependencies
WHERE issue_id = $1
  AND depends_on_issue_id = $2`;

export interface DeleteIssueDependencyArgs {
    issueId: string;
    dependsOnIssueId: string;
}

export async function deleteIssueDependency(sql: Sql, args: DeleteIssueDependencyArgs): Promise<void> {
    await sql.unsafe(deleteIssueDependencyQuery, [args.issueId, args.dependsOnIssueId]);
}

export const deleteAllIssueDependenciesQuery = `-- name: DeleteAllIssueDependencies :exec
DELETE FROM issue_dependencies
WHERE issue_id = $1`;

export interface DeleteAllIssueDependenciesArgs {
    issueId: string;
}

export async function deleteAllIssueDependencies(sql: Sql, args: DeleteAllIssueDependenciesArgs): Promise<void> {
    await sql.unsafe(deleteAllIssueDependenciesQuery, [args.issueId]);
}

