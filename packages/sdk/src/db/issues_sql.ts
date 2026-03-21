import { Sql } from "postgres";

export const createIssueQuery = `-- name: CreateIssue :one
INSERT INTO issues (repository_id, number, title, body, state, author_id, milestone_id)
VALUES ($1, get_next_issue_number($1), $2, $3, 'open', $4, $5)
RETURNING id, repository_id, number, title, body, search_vector, state, author_id, milestone_id, comment_count, closed_at, created_at, updated_at`;

export interface CreateIssueArgs {
    repositoryId: string;
    title: string;
    body: string;
    authorId: string;
    milestoneId: string | null;
}

export interface CreateIssueRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    searchVector: string | null;
    state: string;
    authorId: string;
    milestoneId: string | null;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createIssue(sql: Sql, args: CreateIssueArgs): Promise<CreateIssueRow | null> {
    const rows = await sql.unsafe(createIssueQuery, [args.repositoryId, args.title, args.body, args.authorId, args.milestoneId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        searchVector: row[5],
        state: row[6],
        authorId: row[7],
        milestoneId: row[8],
        commentCount: row[9],
        closedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const getIssueByNumberQuery = `-- name: GetIssueByNumber :one
SELECT id, repository_id, number, title, body, search_vector, state, author_id, milestone_id, comment_count, closed_at, created_at, updated_at
FROM issues
WHERE repository_id = $1
  AND number = $2`;

export interface GetIssueByNumberArgs {
    repositoryId: string;
    number: string;
}

export interface GetIssueByNumberRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    searchVector: string | null;
    state: string;
    authorId: string;
    milestoneId: string | null;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getIssueByNumber(sql: Sql, args: GetIssueByNumberArgs): Promise<GetIssueByNumberRow | null> {
    const rows = await sql.unsafe(getIssueByNumberQuery, [args.repositoryId, args.number]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        searchVector: row[5],
        state: row[6],
        authorId: row[7],
        milestoneId: row[8],
        commentCount: row[9],
        closedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const getIssueByIDQuery = `-- name: GetIssueByID :one
SELECT id, repository_id, number, title, body, search_vector, state, author_id, milestone_id, comment_count, closed_at, created_at, updated_at
FROM issues
WHERE id = $1`;

export interface GetIssueByIDArgs {
    id: string;
}

export interface GetIssueByIDRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    searchVector: string | null;
    state: string;
    authorId: string;
    milestoneId: string | null;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getIssueByID(sql: Sql, args: GetIssueByIDArgs): Promise<GetIssueByIDRow | null> {
    const rows = await sql.unsafe(getIssueByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        searchVector: row[5],
        state: row[6],
        authorId: row[7],
        milestoneId: row[8],
        commentCount: row[9],
        closedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const listIssuesByRepoFilteredQuery = `-- name: ListIssuesByRepoFiltered :many
SELECT id, repository_id, number, title, body, search_vector, state, author_id, milestone_id, comment_count, closed_at, created_at, updated_at
FROM issues
WHERE repository_id = $1
  AND ($2::text = '' OR state = $2::text)
ORDER BY number DESC
LIMIT $4
OFFSET $3`;

export interface ListIssuesByRepoFilteredArgs {
    repositoryId: string;
    state: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListIssuesByRepoFilteredRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    searchVector: string | null;
    state: string;
    authorId: string;
    milestoneId: string | null;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listIssuesByRepoFiltered(sql: Sql, args: ListIssuesByRepoFilteredArgs): Promise<ListIssuesByRepoFilteredRow[]> {
    return (await sql.unsafe(listIssuesByRepoFilteredQuery, [args.repositoryId, args.state, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        searchVector: row[5],
        state: row[6],
        authorId: row[7],
        milestoneId: row[8],
        commentCount: row[9],
        closedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    }));
}

export const countIssuesByRepoFilteredQuery = `-- name: CountIssuesByRepoFiltered :one
SELECT COUNT(*)
FROM issues
WHERE repository_id = $1
  AND ($2::text = '' OR state = $2::text)`;

export interface CountIssuesByRepoFilteredArgs {
    repositoryId: string;
    state: string;
}

export interface CountIssuesByRepoFilteredRow {
    count: string;
}

export async function countIssuesByRepoFiltered(sql: Sql, args: CountIssuesByRepoFilteredArgs): Promise<CountIssuesByRepoFilteredRow | null> {
    const rows = await sql.unsafe(countIssuesByRepoFilteredQuery, [args.repositoryId, args.state]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const updateIssueQuery = `-- name: UpdateIssue :one
UPDATE issues
SET title = $1,
    body = $2,
    state = $3,
    milestone_id = $4,
    closed_at = $5,
    updated_at = NOW()
WHERE id = $6
RETURNING id, repository_id, number, title, body, search_vector, state, author_id, milestone_id, comment_count, closed_at, created_at, updated_at`;

export interface UpdateIssueArgs {
    title: string;
    body: string;
    state: string;
    milestoneId: string | null;
    closedAt: Date | null;
    id: string;
}

export interface UpdateIssueRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    searchVector: string | null;
    state: string;
    authorId: string;
    milestoneId: string | null;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateIssue(sql: Sql, args: UpdateIssueArgs): Promise<UpdateIssueRow | null> {
    const rows = await sql.unsafe(updateIssueQuery, [args.title, args.body, args.state, args.milestoneId, args.closedAt, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        searchVector: row[5],
        state: row[6],
        authorId: row[7],
        milestoneId: row[8],
        commentCount: row[9],
        closedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const addIssueAssigneeQuery = `-- name: AddIssueAssignee :one
INSERT INTO issue_assignees (issue_id, user_id)
VALUES ($1, $2)
RETURNING issue_id, user_id, created_at`;

export interface AddIssueAssigneeArgs {
    issueId: string;
    userId: string;
}

export interface AddIssueAssigneeRow {
    issueId: string;
    userId: string;
    createdAt: Date;
}

export async function addIssueAssignee(sql: Sql, args: AddIssueAssigneeArgs): Promise<AddIssueAssigneeRow | null> {
    const rows = await sql.unsafe(addIssueAssigneeQuery, [args.issueId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        issueId: row[0],
        userId: row[1],
        createdAt: row[2]
    };
}

export const deleteIssueAssigneesQuery = `-- name: DeleteIssueAssignees :exec
DELETE FROM issue_assignees
WHERE issue_id = $1`;

export interface DeleteIssueAssigneesArgs {
    issueId: string;
}

export async function deleteIssueAssignees(sql: Sql, args: DeleteIssueAssigneesArgs): Promise<void> {
    await sql.unsafe(deleteIssueAssigneesQuery, [args.issueId]);
}

export const deleteIssueLabelsQuery = `-- name: DeleteIssueLabels :exec
DELETE FROM issue_labels
WHERE issue_id = $1`;

export interface DeleteIssueLabelsArgs {
    issueId: string;
}

export async function deleteIssueLabels(sql: Sql, args: DeleteIssueLabelsArgs): Promise<void> {
    await sql.unsafe(deleteIssueLabelsQuery, [args.issueId]);
}

export const listIssueAssigneesQuery = `-- name: ListIssueAssignees :many
SELECT u.id, u.username, u.display_name, u.avatar_url
FROM issue_assignees ia
JOIN users u ON u.id = ia.user_id
WHERE ia.issue_id = $1
ORDER BY u.username ASC`;

export interface ListIssueAssigneesArgs {
    issueId: string;
}

export interface ListIssueAssigneesRow {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
}

export async function listIssueAssignees(sql: Sql, args: ListIssueAssigneesArgs): Promise<ListIssueAssigneesRow[]> {
    return (await sql.unsafe(listIssueAssigneesQuery, [args.issueId]).values()).map(row => ({
        id: row[0],
        username: row[1],
        displayName: row[2],
        avatarUrl: row[3]
    }));
}

export const createIssueCommentQuery = `-- name: CreateIssueComment :one
INSERT INTO issue_comments (issue_id, user_id, body, commenter, type)
VALUES ($1, $2, $3, $4, 'comment')
RETURNING id, issue_id, user_id, commenter, body, type, created_at, updated_at`;

export interface CreateIssueCommentArgs {
    issueId: string;
    userId: string;
    body: string;
    commenter: string;
}

export interface CreateIssueCommentRow {
    id: string;
    issueId: string;
    userId: string;
    commenter: string;
    body: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createIssueComment(sql: Sql, args: CreateIssueCommentArgs): Promise<CreateIssueCommentRow | null> {
    const rows = await sql.unsafe(createIssueCommentQuery, [args.issueId, args.userId, args.body, args.commenter]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueId: row[1],
        userId: row[2],
        commenter: row[3],
        body: row[4],
        type: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const createIssueEventQuery = `-- name: CreateIssueEvent :one
INSERT INTO issue_events (issue_id, actor_id, event_type, payload)
VALUES (
    $1,
    $2,
    $3,
    $4
)
RETURNING id, issue_id, actor_id, event_type, payload, created_at`;

export interface CreateIssueEventArgs {
    issueId: string;
    actorId: string | null;
    eventType: string;
    payload: any;
}

export interface CreateIssueEventRow {
    id: string;
    issueId: string;
    actorId: string | null;
    eventType: string;
    payload: any;
    createdAt: Date;
}

export async function createIssueEvent(sql: Sql, args: CreateIssueEventArgs): Promise<CreateIssueEventRow | null> {
    const rows = await sql.unsafe(createIssueEventQuery, [args.issueId, args.actorId, args.eventType, args.payload]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueId: row[1],
        actorId: row[2],
        eventType: row[3],
        payload: row[4],
        createdAt: row[5]
    };
}

export const listIssueCommentsQuery = `-- name: ListIssueComments :many
SELECT id, issue_id, user_id, commenter, body, type, created_at, updated_at
FROM issue_comments
WHERE issue_id = $1
ORDER BY created_at ASC, id ASC
LIMIT $3
OFFSET $2`;

export interface ListIssueCommentsArgs {
    issueId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListIssueCommentsRow {
    id: string;
    issueId: string;
    userId: string;
    commenter: string;
    body: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listIssueComments(sql: Sql, args: ListIssueCommentsArgs): Promise<ListIssueCommentsRow[]> {
    return (await sql.unsafe(listIssueCommentsQuery, [args.issueId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        issueId: row[1],
        userId: row[2],
        commenter: row[3],
        body: row[4],
        type: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const listIssueEventsByIssueQuery = `-- name: ListIssueEventsByIssue :many
SELECT id, issue_id, actor_id, event_type, payload, created_at
FROM issue_events
WHERE issue_id = $1
ORDER BY created_at ASC, id ASC
LIMIT $3
OFFSET $2`;

export interface ListIssueEventsByIssueArgs {
    issueId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListIssueEventsByIssueRow {
    id: string;
    issueId: string;
    actorId: string | null;
    eventType: string;
    payload: any;
    createdAt: Date;
}

export async function listIssueEventsByIssue(sql: Sql, args: ListIssueEventsByIssueArgs): Promise<ListIssueEventsByIssueRow[]> {
    return (await sql.unsafe(listIssueEventsByIssueQuery, [args.issueId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        issueId: row[1],
        actorId: row[2],
        eventType: row[3],
        payload: row[4],
        createdAt: row[5]
    }));
}

export const countIssueCommentsByIssueQuery = `-- name: CountIssueCommentsByIssue :one
SELECT COUNT(*)
FROM issue_comments
WHERE issue_id = $1`;

export interface CountIssueCommentsByIssueArgs {
    issueId: string;
}

export interface CountIssueCommentsByIssueRow {
    count: string;
}

export async function countIssueCommentsByIssue(sql: Sql, args: CountIssueCommentsByIssueArgs): Promise<CountIssueCommentsByIssueRow | null> {
    const rows = await sql.unsafe(countIssueCommentsByIssueQuery, [args.issueId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const getIssueCommentByIDQuery = `-- name: GetIssueCommentByID :one
SELECT id, issue_id, user_id, commenter, body, type, created_at, updated_at
FROM issue_comments
WHERE id = $1`;

export interface GetIssueCommentByIDArgs {
    id: string;
}

export interface GetIssueCommentByIDRow {
    id: string;
    issueId: string;
    userId: string;
    commenter: string;
    body: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getIssueCommentByID(sql: Sql, args: GetIssueCommentByIDArgs): Promise<GetIssueCommentByIDRow | null> {
    const rows = await sql.unsafe(getIssueCommentByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueId: row[1],
        userId: row[2],
        commenter: row[3],
        body: row[4],
        type: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const updateIssueCommentQuery = `-- name: UpdateIssueComment :one
UPDATE issue_comments
SET body = $1,
    updated_at = NOW()
WHERE id = $2
RETURNING id, issue_id, user_id, commenter, body, type, created_at, updated_at`;

export interface UpdateIssueCommentArgs {
    body: string;
    id: string;
}

export interface UpdateIssueCommentRow {
    id: string;
    issueId: string;
    userId: string;
    commenter: string;
    body: string;
    type: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateIssueComment(sql: Sql, args: UpdateIssueCommentArgs): Promise<UpdateIssueCommentRow | null> {
    const rows = await sql.unsafe(updateIssueCommentQuery, [args.body, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        issueId: row[1],
        userId: row[2],
        commenter: row[3],
        body: row[4],
        type: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteIssueCommentQuery = `-- name: DeleteIssueComment :exec
DELETE FROM issue_comments
WHERE id = $1`;

export interface DeleteIssueCommentArgs {
    id: string;
}

export async function deleteIssueComment(sql: Sql, args: DeleteIssueCommentArgs): Promise<void> {
    await sql.unsafe(deleteIssueCommentQuery, [args.id]);
}

export const getIssueByCommentIDQuery = `-- name: GetIssueByCommentID :one
SELECT i.id, i.repository_id, i.number, i.title, i.body, i.search_vector, i.state, i.author_id, i.milestone_id, i.comment_count, i.closed_at, i.created_at, i.updated_at
FROM issues i
JOIN issue_comments ic ON ic.issue_id = i.id
WHERE ic.id = $1`;

export interface GetIssueByCommentIDArgs {
    id: string;
}

export interface GetIssueByCommentIDRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    searchVector: string | null;
    state: string;
    authorId: string;
    milestoneId: string | null;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getIssueByCommentID(sql: Sql, args: GetIssueByCommentIDArgs): Promise<GetIssueByCommentIDRow | null> {
    const rows = await sql.unsafe(getIssueByCommentIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        searchVector: row[5],
        state: row[6],
        authorId: row[7],
        milestoneId: row[8],
        commentCount: row[9],
        closedAt: row[10],
        createdAt: row[11],
        updatedAt: row[12]
    };
}

export const incrementIssueCommentCountQuery = `-- name: IncrementIssueCommentCount :exec
UPDATE issues
SET comment_count = comment_count + 1,
    updated_at = NOW()
WHERE id = $1`;

export interface IncrementIssueCommentCountArgs {
    id: string;
}

export async function incrementIssueCommentCount(sql: Sql, args: IncrementIssueCommentCountArgs): Promise<void> {
    await sql.unsafe(incrementIssueCommentCountQuery, [args.id]);
}

export const decrementIssueCommentCountQuery = `-- name: DecrementIssueCommentCount :exec
UPDATE issues
SET comment_count = GREATEST(comment_count - 1, 0),
    updated_at = NOW()
WHERE id = $1`;

export interface DecrementIssueCommentCountArgs {
    id: string;
}

export async function decrementIssueCommentCount(sql: Sql, args: DecrementIssueCommentCountArgs): Promise<void> {
    await sql.unsafe(decrementIssueCommentCountQuery, [args.id]);
}

export const incrementRepoIssueCountQuery = `-- name: IncrementRepoIssueCount :exec
UPDATE repositories
SET num_issues = num_issues + 1,
    updated_at = NOW()
WHERE id = $1`;

export interface IncrementRepoIssueCountArgs {
    id: string;
}

export async function incrementRepoIssueCount(sql: Sql, args: IncrementRepoIssueCountArgs): Promise<void> {
    await sql.unsafe(incrementRepoIssueCountQuery, [args.id]);
}

export const incrementRepoClosedIssueCountQuery = `-- name: IncrementRepoClosedIssueCount :exec
UPDATE repositories
SET num_closed_issues = num_closed_issues + 1,
    updated_at = NOW()
WHERE id = $1`;

export interface IncrementRepoClosedIssueCountArgs {
    id: string;
}

export async function incrementRepoClosedIssueCount(sql: Sql, args: IncrementRepoClosedIssueCountArgs): Promise<void> {
    await sql.unsafe(incrementRepoClosedIssueCountQuery, [args.id]);
}

export const decrementRepoClosedIssueCountQuery = `-- name: DecrementRepoClosedIssueCount :exec
UPDATE repositories
SET num_closed_issues = GREATEST(num_closed_issues - 1, 0),
    updated_at = NOW()
WHERE id = $1`;

export interface DecrementRepoClosedIssueCountArgs {
    id: string;
}

export async function decrementRepoClosedIssueCount(sql: Sql, args: DecrementRepoClosedIssueCountArgs): Promise<void> {
    await sql.unsafe(decrementRepoClosedIssueCountQuery, [args.id]);
}

