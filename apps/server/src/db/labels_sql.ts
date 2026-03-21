import { Sql } from "postgres";

export const createLabelQuery = `-- name: CreateLabel :one
INSERT INTO labels (repository_id, name, color, description)
VALUES ($1, $2, $3, $4)
RETURNING id, repository_id, name, color, description, created_at, updated_at`;

export interface CreateLabelArgs {
    repositoryId: string;
    name: string;
    color: string;
    description: string;
}

export interface CreateLabelRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLabel(sql: Sql, args: CreateLabelArgs): Promise<CreateLabelRow | null> {
    const rows = await sql.unsafe(createLabelQuery, [args.repositoryId, args.name, args.color, args.description]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const listLabelsByRepoQuery = `-- name: ListLabelsByRepo :many
SELECT id, repository_id, name, color, description, created_at, updated_at
FROM labels
WHERE repository_id = $1
ORDER BY id ASC
LIMIT $3
OFFSET $2`;

export interface ListLabelsByRepoArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLabelsByRepoRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLabelsByRepo(sql: Sql, args: ListLabelsByRepoArgs): Promise<ListLabelsByRepoRow[]> {
    return (await sql.unsafe(listLabelsByRepoQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const listAllLabelsByRepoQuery = `-- name: ListAllLabelsByRepo :many
SELECT id, repository_id, name, color, description, created_at, updated_at
FROM labels
WHERE repository_id = $1
ORDER BY id ASC`;

export interface ListAllLabelsByRepoArgs {
    repositoryId: string;
}

export interface ListAllLabelsByRepoRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listAllLabelsByRepo(sql: Sql, args: ListAllLabelsByRepoArgs): Promise<ListAllLabelsByRepoRow[]> {
    return (await sql.unsafe(listAllLabelsByRepoQuery, [args.repositoryId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const countLabelsByRepoQuery = `-- name: CountLabelsByRepo :one
SELECT COUNT(*)
FROM labels
WHERE repository_id = $1`;

export interface CountLabelsByRepoArgs {
    repositoryId: string;
}

export interface CountLabelsByRepoRow {
    count: string;
}

export async function countLabelsByRepo(sql: Sql, args: CountLabelsByRepoArgs): Promise<CountLabelsByRepoRow | null> {
    const rows = await sql.unsafe(countLabelsByRepoQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const getLabelByIDQuery = `-- name: GetLabelByID :one
SELECT id, repository_id, name, color, description, created_at, updated_at
FROM labels
WHERE repository_id = $1
  AND id = $2`;

export interface GetLabelByIDArgs {
    repositoryId: string;
    id: string;
}

export interface GetLabelByIDRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLabelByID(sql: Sql, args: GetLabelByIDArgs): Promise<GetLabelByIDRow | null> {
    const rows = await sql.unsafe(getLabelByIDQuery, [args.repositoryId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const getLabelByNameQuery = `-- name: GetLabelByName :one
SELECT id, repository_id, name, color, description, created_at, updated_at
FROM labels
WHERE repository_id = $1
  AND name = $2`;

export interface GetLabelByNameArgs {
    repositoryId: string;
    name: string;
}

export interface GetLabelByNameRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLabelByName(sql: Sql, args: GetLabelByNameArgs): Promise<GetLabelByNameRow | null> {
    const rows = await sql.unsafe(getLabelByNameQuery, [args.repositoryId, args.name]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const listLabelsByNamesQuery = `-- name: ListLabelsByNames :many
SELECT id, repository_id, name, color, description, created_at, updated_at
FROM labels
WHERE repository_id = $1
  AND name = ANY($2::text[])
ORDER BY id ASC`;

export interface ListLabelsByNamesArgs {
    repositoryId: string;
    names: string[];
}

export interface ListLabelsByNamesRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLabelsByNames(sql: Sql, args: ListLabelsByNamesArgs): Promise<ListLabelsByNamesRow[]> {
    return (await sql.unsafe(listLabelsByNamesQuery, [args.repositoryId, args.names]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const updateLabelQuery = `-- name: UpdateLabel :one
UPDATE labels
SET name = $3,
    color = $4,
    description = $5,
    updated_at = NOW()
WHERE repository_id = $1
  AND id = $2
RETURNING id, repository_id, name, color, description, created_at, updated_at`;

export interface UpdateLabelArgs {
    repositoryId: string;
    id: string;
    name: string;
    color: string;
    description: string;
}

export interface UpdateLabelRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateLabel(sql: Sql, args: UpdateLabelArgs): Promise<UpdateLabelRow | null> {
    const rows = await sql.unsafe(updateLabelQuery, [args.repositoryId, args.id, args.name, args.color, args.description]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const deleteLabelQuery = `-- name: DeleteLabel :exec
DELETE FROM labels
WHERE repository_id = $1
  AND id = $2`;

export interface DeleteLabelArgs {
    repositoryId: string;
    id: string;
}

export async function deleteLabel(sql: Sql, args: DeleteLabelArgs): Promise<void> {
    await sql.unsafe(deleteLabelQuery, [args.repositoryId, args.id]);
}

export const addIssueLabelQuery = `-- name: AddIssueLabel :one
INSERT INTO issue_labels (issue_id, label_id)
VALUES ($1, $2)
RETURNING issue_id, label_id, created_at`;

export interface AddIssueLabelArgs {
    issueId: string;
    labelId: string;
}

export interface AddIssueLabelRow {
    issueId: string;
    labelId: string;
    createdAt: Date;
}

export async function addIssueLabel(sql: Sql, args: AddIssueLabelArgs): Promise<AddIssueLabelRow | null> {
    const rows = await sql.unsafe(addIssueLabelQuery, [args.issueId, args.labelId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        issueId: row[0],
        labelId: row[1],
        createdAt: row[2]
    };
}

export const addIssueLabelsQuery = `-- name: AddIssueLabels :exec
INSERT INTO issue_labels (issue_id, label_id)
SELECT $1, UNNEST($2::bigint[])`;

export interface AddIssueLabelsArgs {
    issueId: string;
    labelIds: string[];
}

export async function addIssueLabels(sql: Sql, args: AddIssueLabelsArgs): Promise<void> {
    await sql.unsafe(addIssueLabelsQuery, [args.issueId, args.labelIds]);
}

export const removeIssueLabelQuery = `-- name: RemoveIssueLabel :exec
DELETE FROM issue_labels
WHERE issue_id = $1
  AND label_id = $2`;

export interface RemoveIssueLabelArgs {
    issueId: string;
    labelId: string;
}

export async function removeIssueLabel(sql: Sql, args: RemoveIssueLabelArgs): Promise<void> {
    await sql.unsafe(removeIssueLabelQuery, [args.issueId, args.labelId]);
}

export const removeIssueLabelByNameQuery = `-- name: RemoveIssueLabelByName :one
WITH removed AS (
	DELETE FROM issue_labels il
	USING issues i, labels l
	WHERE il.issue_id = i.id
	  AND il.label_id = l.id
	  AND i.repository_id = $1
	  AND i.number = $2
	  AND l.repository_id = $1
	  AND l.name = $3
	RETURNING 1
)
SELECT COUNT(*)
FROM removed`;

export interface RemoveIssueLabelByNameArgs {
    repositoryId: string;
    issueNumber: string;
    labelName: string;
}

export interface RemoveIssueLabelByNameRow {
    count: string;
}

export async function removeIssueLabelByName(sql: Sql, args: RemoveIssueLabelByNameArgs): Promise<RemoveIssueLabelByNameRow | null> {
    const rows = await sql.unsafe(removeIssueLabelByNameQuery, [args.repositoryId, args.issueNumber, args.labelName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listLabelsForIssueQuery = `-- name: ListLabelsForIssue :many
SELECT l.id, l.repository_id, l.name, l.color, l.description, l.created_at, l.updated_at
FROM labels l
JOIN issue_labels il ON il.label_id = l.id
WHERE il.issue_id = $1
ORDER BY l.id ASC
LIMIT $3
OFFSET $2`;

export interface ListLabelsForIssueArgs {
    issueId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLabelsForIssueRow {
    id: string;
    repositoryId: string;
    name: string;
    color: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLabelsForIssue(sql: Sql, args: ListLabelsForIssueArgs): Promise<ListLabelsForIssueRow[]> {
    return (await sql.unsafe(listLabelsForIssueQuery, [args.issueId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        name: row[2],
        color: row[3],
        description: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const countLabelsForIssueQuery = `-- name: CountLabelsForIssue :one
SELECT COUNT(*)
FROM issue_labels
WHERE issue_id = $1`;

export interface CountLabelsForIssueArgs {
    issueId: string;
}

export interface CountLabelsForIssueRow {
    count: string;
}

export async function countLabelsForIssue(sql: Sql, args: CountLabelsForIssueArgs): Promise<CountLabelsForIssueRow | null> {
    const rows = await sql.unsafe(countLabelsForIssueQuery, [args.issueId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countIssueLabelsByLabelQuery = `-- name: CountIssueLabelsByLabel :one
SELECT COUNT(*)
FROM issue_labels
WHERE label_id = $1`;

export interface CountIssueLabelsByLabelArgs {
    labelId: string;
}

export interface CountIssueLabelsByLabelRow {
    count: string;
}

export async function countIssueLabelsByLabel(sql: Sql, args: CountIssueLabelsByLabelArgs): Promise<CountIssueLabelsByLabelRow | null> {
    const rows = await sql.unsafe(countIssueLabelsByLabelQuery, [args.labelId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

