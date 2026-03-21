import { Sql } from "postgres";

export const createMilestoneQuery = `-- name: CreateMilestone :one
INSERT INTO milestones (repository_id, title, description, due_date)
VALUES ($1, $2, $3, $4)
RETURNING id, repository_id, title, description, state, due_date, closed_at, created_at, updated_at`;

export interface CreateMilestoneArgs {
    repositoryId: string;
    title: string;
    description: string;
    dueDate: Date | null;
}

export interface CreateMilestoneRow {
    id: string;
    repositoryId: string;
    title: string;
    description: string;
    state: string;
    dueDate: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createMilestone(sql: Sql, args: CreateMilestoneArgs): Promise<CreateMilestoneRow | null> {
    const rows = await sql.unsafe(createMilestoneQuery, [args.repositoryId, args.title, args.description, args.dueDate]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        description: row[3],
        state: row[4],
        dueDate: row[5],
        closedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const listMilestonesByRepoQuery = `-- name: ListMilestonesByRepo :many
SELECT id, repository_id, title, description, state, due_date, closed_at, created_at, updated_at
FROM milestones
WHERE repository_id = $1
  AND ($2::text = '' OR state = $2::text)
ORDER BY id ASC
LIMIT $4
OFFSET $3`;

export interface ListMilestonesByRepoArgs {
    repositoryId: string;
    state: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListMilestonesByRepoRow {
    id: string;
    repositoryId: string;
    title: string;
    description: string;
    state: string;
    dueDate: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listMilestonesByRepo(sql: Sql, args: ListMilestonesByRepoArgs): Promise<ListMilestonesByRepoRow[]> {
    return (await sql.unsafe(listMilestonesByRepoQuery, [args.repositoryId, args.state, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        description: row[3],
        state: row[4],
        dueDate: row[5],
        closedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const countMilestonesByRepoQuery = `-- name: CountMilestonesByRepo :one
SELECT COUNT(*)
FROM milestones
WHERE repository_id = $1
  AND ($2::text = '' OR state = $2::text)`;

export interface CountMilestonesByRepoArgs {
    repositoryId: string;
    state: string;
}

export interface CountMilestonesByRepoRow {
    count: string;
}

export async function countMilestonesByRepo(sql: Sql, args: CountMilestonesByRepoArgs): Promise<CountMilestonesByRepoRow | null> {
    const rows = await sql.unsafe(countMilestonesByRepoQuery, [args.repositoryId, args.state]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const getMilestoneByIDQuery = `-- name: GetMilestoneByID :one
SELECT id, repository_id, title, description, state, due_date, closed_at, created_at, updated_at
FROM milestones
WHERE repository_id = $1
  AND id = $2`;

export interface GetMilestoneByIDArgs {
    repositoryId: string;
    id: string;
}

export interface GetMilestoneByIDRow {
    id: string;
    repositoryId: string;
    title: string;
    description: string;
    state: string;
    dueDate: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getMilestoneByID(sql: Sql, args: GetMilestoneByIDArgs): Promise<GetMilestoneByIDRow | null> {
    const rows = await sql.unsafe(getMilestoneByIDQuery, [args.repositoryId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        description: row[3],
        state: row[4],
        dueDate: row[5],
        closedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const updateMilestoneQuery = `-- name: UpdateMilestone :one
UPDATE milestones
SET title = $3,
    description = $4,
    state = $5,
    due_date = $6,
    closed_at = $7,
    updated_at = NOW()
WHERE repository_id = $1
  AND id = $2
RETURNING id, repository_id, title, description, state, due_date, closed_at, created_at, updated_at`;

export interface UpdateMilestoneArgs {
    repositoryId: string;
    id: string;
    title: string;
    description: string;
    state: string;
    dueDate: Date | null;
    closedAt: Date | null;
}

export interface UpdateMilestoneRow {
    id: string;
    repositoryId: string;
    title: string;
    description: string;
    state: string;
    dueDate: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateMilestone(sql: Sql, args: UpdateMilestoneArgs): Promise<UpdateMilestoneRow | null> {
    const rows = await sql.unsafe(updateMilestoneQuery, [args.repositoryId, args.id, args.title, args.description, args.state, args.dueDate, args.closedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        title: row[2],
        description: row[3],
        state: row[4],
        dueDate: row[5],
        closedAt: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const deleteMilestoneQuery = `-- name: DeleteMilestone :exec
DELETE FROM milestones
WHERE repository_id = $1
  AND id = $2`;

export interface DeleteMilestoneArgs {
    repositoryId: string;
    id: string;
}

export async function deleteMilestone(sql: Sql, args: DeleteMilestoneArgs): Promise<void> {
    await sql.unsafe(deleteMilestoneQuery, [args.repositoryId, args.id]);
}

