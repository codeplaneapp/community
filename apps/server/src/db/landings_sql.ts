import { Sql } from "postgres";

export const createLandingRequestQuery = `-- name: CreateLandingRequest :one
INSERT INTO landing_requests (repository_id, number, title, body, author_id, target_bookmark, source_bookmark, state, stack_size)
VALUES ($1, get_next_landing_number($1), $2, $3, $4, $5, $6, 'open', $7)
RETURNING id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at`;

export interface CreateLandingRequestArgs {
    repositoryId: string;
    title: string;
    body: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    stackSize: string;
}

export interface CreateLandingRequestRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLandingRequest(sql: Sql, args: CreateLandingRequestArgs): Promise<CreateLandingRequestRow | null> {
    const rows = await sql.unsafe(createLandingRequestQuery, [args.repositoryId, args.title, args.body, args.authorId, args.targetBookmark, args.sourceBookmark, args.stackSize]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLandingRequestByNumberQuery = `-- name: GetLandingRequestByNumber :one
SELECT id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at
FROM landing_requests
WHERE repository_id = $1
  AND number = $2`;

export interface GetLandingRequestByNumberArgs {
    repositoryId: string;
    number: string;
}

export interface GetLandingRequestByNumberRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLandingRequestByNumber(sql: Sql, args: GetLandingRequestByNumberArgs): Promise<GetLandingRequestByNumberRow | null> {
    const rows = await sql.unsafe(getLandingRequestByNumberQuery, [args.repositoryId, args.number]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLandingRequestWithChangeIDsByNumberQuery = `-- name: GetLandingRequestWithChangeIDsByNumber :one
SELECT
    lr.id, lr.repository_id, lr.number, lr.title, lr.body, lr.state, lr.author_id, lr.target_bookmark, lr.source_bookmark, lr.conflict_status, lr.stack_size, lr.queued_by, lr.queued_at, lr.landing_started_at, lr.closed_at, lr.merged_at, lr.created_at, lr.updated_at,
    ARRAY(
        SELECT lrc.change_id::text
        FROM landing_request_changes AS lrc
        WHERE lrc.landing_request_id = lr.id
        ORDER BY lrc.position_in_stack
    )::text[] AS change_ids
FROM landing_requests AS lr
WHERE lr.repository_id = $1
  AND lr.number = $2`;

export interface GetLandingRequestWithChangeIDsByNumberArgs {
    repositoryId: string;
    number: string;
}

export interface GetLandingRequestWithChangeIDsByNumberRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    changeIds: string[];
}

export async function getLandingRequestWithChangeIDsByNumber(sql: Sql, args: GetLandingRequestWithChangeIDsByNumberArgs): Promise<GetLandingRequestWithChangeIDsByNumberRow | null> {
    const rows = await sql.unsafe(getLandingRequestWithChangeIDsByNumberQuery, [args.repositoryId, args.number]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17],
        changeIds: row[18]
    };
}

export const addLandingRequestChangeQuery = `-- name: AddLandingRequestChange :one
INSERT INTO landing_request_changes (landing_request_id, change_id, position_in_stack)
VALUES ($1, $2, $3)
RETURNING id, landing_request_id, change_id, position_in_stack, created_at`;

export interface AddLandingRequestChangeArgs {
    landingRequestId: string;
    changeId: string;
    positionInStack: string;
}

export interface AddLandingRequestChangeRow {
    id: string;
    landingRequestId: string;
    changeId: string;
    positionInStack: string;
    createdAt: Date;
}

export async function addLandingRequestChange(sql: Sql, args: AddLandingRequestChangeArgs): Promise<AddLandingRequestChangeRow | null> {
    const rows = await sql.unsafe(addLandingRequestChangeQuery, [args.landingRequestId, args.changeId, args.positionInStack]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        changeId: row[2],
        positionInStack: row[3],
        createdAt: row[4]
    };
}

export const deleteLandingRequestChangesQuery = `-- name: DeleteLandingRequestChanges :exec
DELETE FROM landing_request_changes
WHERE landing_request_id = $1`;

export interface DeleteLandingRequestChangesArgs {
    landingRequestId: string;
}

export async function deleteLandingRequestChanges(sql: Sql, args: DeleteLandingRequestChangesArgs): Promise<void> {
    await sql.unsafe(deleteLandingRequestChangesQuery, [args.landingRequestId]);
}

export const listLandingRequestChangesQuery = `-- name: ListLandingRequestChanges :many
SELECT id, landing_request_id, change_id, position_in_stack, created_at
FROM landing_request_changes
WHERE landing_request_id = $1
ORDER BY position_in_stack ASC
LIMIT $3
OFFSET $2`;

export interface ListLandingRequestChangesArgs {
    landingRequestId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLandingRequestChangesRow {
    id: string;
    landingRequestId: string;
    changeId: string;
    positionInStack: string;
    createdAt: Date;
}

export async function listLandingRequestChanges(sql: Sql, args: ListLandingRequestChangesArgs): Promise<ListLandingRequestChangesRow[]> {
    return (await sql.unsafe(listLandingRequestChangesQuery, [args.landingRequestId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        landingRequestId: row[1],
        changeId: row[2],
        positionInStack: row[3],
        createdAt: row[4]
    }));
}

export const createLandingRequestReviewQuery = `-- name: CreateLandingRequestReview :one
INSERT INTO landing_request_reviews (landing_request_id, reviewer_id, type, body)
VALUES ($1, $2, $3, $4)
RETURNING id, landing_request_id, reviewer_id, type, body, state, created_at, updated_at`;

export interface CreateLandingRequestReviewArgs {
    landingRequestId: string;
    reviewerId: string;
    type: string;
    body: string;
}

export interface CreateLandingRequestReviewRow {
    id: string;
    landingRequestId: string;
    reviewerId: string;
    type: string;
    body: string;
    state: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLandingRequestReview(sql: Sql, args: CreateLandingRequestReviewArgs): Promise<CreateLandingRequestReviewRow | null> {
    const rows = await sql.unsafe(createLandingRequestReviewQuery, [args.landingRequestId, args.reviewerId, args.type, args.body]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        reviewerId: row[2],
        type: row[3],
        body: row[4],
        state: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const createLandingRequestCommentQuery = `-- name: CreateLandingRequestComment :one
INSERT INTO landing_request_comments (landing_request_id, user_id, path, line, side, body)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, landing_request_id, user_id, path, line, side, body, created_at, updated_at`;

export interface CreateLandingRequestCommentArgs {
    landingRequestId: string;
    userId: string;
    path: string;
    line: string;
    side: string;
    body: string;
}

export interface CreateLandingRequestCommentRow {
    id: string;
    landingRequestId: string;
    userId: string;
    path: string;
    line: string;
    side: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLandingRequestComment(sql: Sql, args: CreateLandingRequestCommentArgs): Promise<CreateLandingRequestCommentRow | null> {
    const rows = await sql.unsafe(createLandingRequestCommentQuery, [args.landingRequestId, args.userId, args.path, args.line, args.side, args.body]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        userId: row[2],
        path: row[3],
        line: row[4],
        side: row[5],
        body: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const countLandingRequestsByRepoFilteredQuery = `-- name: CountLandingRequestsByRepoFiltered :one
SELECT COUNT(*)
FROM landing_requests
WHERE repository_id = $1
  AND ($2::text = '' OR state = $2::text)`;

export interface CountLandingRequestsByRepoFilteredArgs {
    repositoryId: string;
    state: string;
}

export interface CountLandingRequestsByRepoFilteredRow {
    count: string;
}

export async function countLandingRequestsByRepoFiltered(sql: Sql, args: CountLandingRequestsByRepoFilteredArgs): Promise<CountLandingRequestsByRepoFilteredRow | null> {
    const rows = await sql.unsafe(countLandingRequestsByRepoFilteredQuery, [args.repositoryId, args.state]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listLandingRequestsWithChangeIDsByRepoFilteredQuery = `-- name: ListLandingRequestsWithChangeIDsByRepoFiltered :many
SELECT
    lr.id, lr.repository_id, lr.number, lr.title, lr.body, lr.state, lr.author_id, lr.target_bookmark, lr.source_bookmark, lr.conflict_status, lr.stack_size, lr.queued_by, lr.queued_at, lr.landing_started_at, lr.closed_at, lr.merged_at, lr.created_at, lr.updated_at,
    ARRAY(
        SELECT lrc.change_id::text
        FROM landing_request_changes AS lrc
        WHERE lrc.landing_request_id = lr.id
        ORDER BY lrc.position_in_stack
    )::text[] AS change_ids
FROM landing_requests AS lr
WHERE lr.repository_id = $1
  AND ($2::text = '' OR lr.state = $2::text)
ORDER BY lr.number DESC
LIMIT $4
OFFSET $3`;

export interface ListLandingRequestsWithChangeIDsByRepoFilteredArgs {
    repositoryId: string;
    state: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLandingRequestsWithChangeIDsByRepoFilteredRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    changeIds: string[];
}

export async function listLandingRequestsWithChangeIDsByRepoFiltered(sql: Sql, args: ListLandingRequestsWithChangeIDsByRepoFilteredArgs): Promise<ListLandingRequestsWithChangeIDsByRepoFilteredRow[]> {
    return (await sql.unsafe(listLandingRequestsWithChangeIDsByRepoFilteredQuery, [args.repositoryId, args.state, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17],
        changeIds: row[18]
    }));
}

export const updateLandingRequestQuery = `-- name: UpdateLandingRequest :one
UPDATE landing_requests
SET title = $1,
    body = $2,
    state = $3,
    target_bookmark = $4,
    source_bookmark = $5,
    conflict_status = $6,
    stack_size = $7,
    closed_at = $8,
    merged_at = $9,
    updated_at = NOW()
WHERE id = $10
RETURNING id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at`;

export interface UpdateLandingRequestArgs {
    title: string;
    body: string;
    state: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    closedAt: Date | null;
    mergedAt: Date | null;
    id: string;
}

export interface UpdateLandingRequestRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateLandingRequest(sql: Sql, args: UpdateLandingRequestArgs): Promise<UpdateLandingRequestRow | null> {
    const rows = await sql.unsafe(updateLandingRequestQuery, [args.title, args.body, args.state, args.targetBookmark, args.sourceBookmark, args.conflictStatus, args.stackSize, args.closedAt, args.mergedAt, args.id]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const mergeLandingRequestQuery = `-- name: MergeLandingRequest :one
UPDATE landing_requests
SET state = 'merged',
    merged_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at`;

export interface MergeLandingRequestArgs {
    id: string;
}

export interface MergeLandingRequestRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function mergeLandingRequest(sql: Sql, args: MergeLandingRequestArgs): Promise<MergeLandingRequestRow | null> {
    const rows = await sql.unsafe(mergeLandingRequestQuery, [args.id]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const listLandingRequestReviewsQuery = `-- name: ListLandingRequestReviews :many
SELECT id, landing_request_id, reviewer_id, type, body, state, created_at, updated_at
FROM landing_request_reviews
WHERE landing_request_id = $1
ORDER BY created_at ASC, id ASC
LIMIT $3
OFFSET $2`;

export interface ListLandingRequestReviewsArgs {
    landingRequestId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLandingRequestReviewsRow {
    id: string;
    landingRequestId: string;
    reviewerId: string;
    type: string;
    body: string;
    state: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLandingRequestReviews(sql: Sql, args: ListLandingRequestReviewsArgs): Promise<ListLandingRequestReviewsRow[]> {
    return (await sql.unsafe(listLandingRequestReviewsQuery, [args.landingRequestId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        landingRequestId: row[1],
        reviewerId: row[2],
        type: row[3],
        body: row[4],
        state: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const countLandingRequestReviewsQuery = `-- name: CountLandingRequestReviews :one
SELECT COUNT(*)
FROM landing_request_reviews
WHERE landing_request_id = $1`;

export interface CountLandingRequestReviewsArgs {
    landingRequestId: string;
}

export interface CountLandingRequestReviewsRow {
    count: string;
}

export async function countLandingRequestReviews(sql: Sql, args: CountLandingRequestReviewsArgs): Promise<CountLandingRequestReviewsRow | null> {
    const rows = await sql.unsafe(countLandingRequestReviewsQuery, [args.landingRequestId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countApprovedLandingRequestReviewsQuery = `-- name: CountApprovedLandingRequestReviews :one
SELECT COUNT(DISTINCT reviewer_id)
FROM landing_request_reviews
WHERE landing_request_id = $1
  AND type = 'approve'
  AND state = 'submitted'`;

export interface CountApprovedLandingRequestReviewsArgs {
    landingRequestId: string;
}

export interface CountApprovedLandingRequestReviewsRow {
    count: string;
}

export async function countApprovedLandingRequestReviews(sql: Sql, args: CountApprovedLandingRequestReviewsArgs): Promise<CountApprovedLandingRequestReviewsRow | null> {
    const rows = await sql.unsafe(countApprovedLandingRequestReviewsQuery, [args.landingRequestId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const getLandingRequestReviewByIDQuery = `-- name: GetLandingRequestReviewByID :one
SELECT id, landing_request_id, reviewer_id, type, body, state, created_at, updated_at
FROM landing_request_reviews
WHERE id = $1`;

export interface GetLandingRequestReviewByIDArgs {
    id: string;
}

export interface GetLandingRequestReviewByIDRow {
    id: string;
    landingRequestId: string;
    reviewerId: string;
    type: string;
    body: string;
    state: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLandingRequestReviewByID(sql: Sql, args: GetLandingRequestReviewByIDArgs): Promise<GetLandingRequestReviewByIDRow | null> {
    const rows = await sql.unsafe(getLandingRequestReviewByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        reviewerId: row[2],
        type: row[3],
        body: row[4],
        state: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const updateLandingRequestReviewStateQuery = `-- name: UpdateLandingRequestReviewState :one
UPDATE landing_request_reviews
SET state = $1,
    updated_at = NOW()
WHERE id = $2
RETURNING id, landing_request_id, reviewer_id, type, body, state, created_at, updated_at`;

export interface UpdateLandingRequestReviewStateArgs {
    state: string;
    id: string;
}

export interface UpdateLandingRequestReviewStateRow {
    id: string;
    landingRequestId: string;
    reviewerId: string;
    type: string;
    body: string;
    state: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateLandingRequestReviewState(sql: Sql, args: UpdateLandingRequestReviewStateArgs): Promise<UpdateLandingRequestReviewStateRow | null> {
    const rows = await sql.unsafe(updateLandingRequestReviewStateQuery, [args.state, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        reviewerId: row[2],
        type: row[3],
        body: row[4],
        state: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const listLandingRequestCommentsQuery = `-- name: ListLandingRequestComments :many
SELECT id, landing_request_id, user_id, path, line, side, body, created_at, updated_at
FROM landing_request_comments
WHERE landing_request_id = $1
ORDER BY created_at ASC, id ASC
LIMIT $3
OFFSET $2`;

export interface ListLandingRequestCommentsArgs {
    landingRequestId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListLandingRequestCommentsRow {
    id: string;
    landingRequestId: string;
    userId: string;
    path: string;
    line: string;
    side: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listLandingRequestComments(sql: Sql, args: ListLandingRequestCommentsArgs): Promise<ListLandingRequestCommentsRow[]> {
    return (await sql.unsafe(listLandingRequestCommentsQuery, [args.landingRequestId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        landingRequestId: row[1],
        userId: row[2],
        path: row[3],
        line: row[4],
        side: row[5],
        body: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const countLandingRequestCommentsQuery = `-- name: CountLandingRequestComments :one
SELECT COUNT(*)
FROM landing_request_comments
WHERE landing_request_id = $1`;

export interface CountLandingRequestCommentsArgs {
    landingRequestId: string;
}

export interface CountLandingRequestCommentsRow {
    count: string;
}

export async function countLandingRequestComments(sql: Sql, args: CountLandingRequestCommentsArgs): Promise<CountLandingRequestCommentsRow | null> {
    const rows = await sql.unsafe(countLandingRequestCommentsQuery, [args.landingRequestId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countLandingRequestChangesQuery = `-- name: CountLandingRequestChanges :one
SELECT COUNT(*)
FROM landing_request_changes
WHERE landing_request_id = $1`;

export interface CountLandingRequestChangesArgs {
    landingRequestId: string;
}

export interface CountLandingRequestChangesRow {
    count: string;
}

export async function countLandingRequestChanges(sql: Sql, args: CountLandingRequestChangesArgs): Promise<CountLandingRequestChangesRow | null> {
    const rows = await sql.unsafe(countLandingRequestChangesQuery, [args.landingRequestId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const enqueueLandingRequestQuery = `-- name: EnqueueLandingRequest :one

UPDATE landing_requests
SET state = 'queued',
    queued_by = $1,
    queued_at = NOW(),
    updated_at = NOW()
WHERE id = $2
  AND state = 'open'
RETURNING id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at`;

export interface EnqueueLandingRequestArgs {
    queuedBy: string | null;
    id: string;
}

export interface EnqueueLandingRequestRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function enqueueLandingRequest(sql: Sql, args: EnqueueLandingRequestArgs): Promise<EnqueueLandingRequestRow | null> {
    const rows = await sql.unsafe(enqueueLandingRequestQuery, [args.queuedBy, args.id]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const createLandingTaskQuery = `-- name: CreateLandingTask :one
INSERT INTO landing_tasks (landing_request_id, repository_id, priority)
VALUES ($1, $2, $3)
RETURNING id, landing_request_id, repository_id, status, priority, attempt, last_error, available_at, started_at, finished_at, created_at, updated_at`;

export interface CreateLandingTaskArgs {
    landingRequestId: string;
    repositoryId: string;
    priority: number;
}

export interface CreateLandingTaskRow {
    id: string;
    landingRequestId: string;
    repositoryId: string;
    status: string;
    priority: number;
    attempt: number;
    lastError: string | null;
    availableAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createLandingTask(sql: Sql, args: CreateLandingTaskArgs): Promise<CreateLandingTaskRow | null> {
    const rows = await sql.unsafe(createLandingTaskQuery, [args.landingRequestId, args.repositoryId, args.priority]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        repositoryId: row[2],
        status: row[3],
        priority: row[4],
        attempt: row[5],
        lastError: row[6],
        availableAt: row[7],
        startedAt: row[8],
        finishedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const claimPendingLandingTaskQuery = `-- name: ClaimPendingLandingTask :one
WITH claimable AS (
    SELECT lt.id
    FROM landing_tasks lt
    WHERE lt.status = 'pending'
      AND lt.available_at <= NOW()
      AND NOT EXISTS (
          SELECT 1 FROM landing_tasks lt2
          WHERE lt2.repository_id = lt.repository_id
            AND lt2.status = 'running'
      )
    ORDER BY lt.priority DESC, lt.created_at ASC, lt.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
UPDATE landing_tasks lt
SET status = 'running',
    attempt = lt.attempt + 1,
    started_at = NOW(),
    updated_at = NOW()
FROM claimable
WHERE lt.id = claimable.id
RETURNING lt.id, lt.landing_request_id, lt.repository_id, lt.status, lt.priority, lt.attempt, lt.last_error, lt.available_at, lt.started_at, lt.finished_at, lt.created_at, lt.updated_at`;

export interface ClaimPendingLandingTaskRow {
    id: string;
    landingRequestId: string;
    repositoryId: string;
    status: string;
    priority: number;
    attempt: number;
    lastError: string | null;
    availableAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function claimPendingLandingTask(sql: Sql): Promise<ClaimPendingLandingTaskRow | null> {
    const rows = await sql.unsafe(claimPendingLandingTaskQuery, []).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        repositoryId: row[2],
        status: row[3],
        priority: row[4],
        attempt: row[5],
        lastError: row[6],
        availableAt: row[7],
        startedAt: row[8],
        finishedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const markLandingTaskDoneQuery = `-- name: MarkLandingTaskDone :one
UPDATE landing_tasks
SET status = 'done',
    finished_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING id, landing_request_id, repository_id, status, priority, attempt, last_error, available_at, started_at, finished_at, created_at, updated_at`;

export interface MarkLandingTaskDoneArgs {
    id: string;
}

export interface MarkLandingTaskDoneRow {
    id: string;
    landingRequestId: string;
    repositoryId: string;
    status: string;
    priority: number;
    attempt: number;
    lastError: string | null;
    availableAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function markLandingTaskDone(sql: Sql, args: MarkLandingTaskDoneArgs): Promise<MarkLandingTaskDoneRow | null> {
    const rows = await sql.unsafe(markLandingTaskDoneQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        repositoryId: row[2],
        status: row[3],
        priority: row[4],
        attempt: row[5],
        lastError: row[6],
        availableAt: row[7],
        startedAt: row[8],
        finishedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const markLandingStartedQuery = `-- name: MarkLandingStarted :one
UPDATE landing_requests
SET state = 'landing',
    landing_started_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at`;

export interface MarkLandingStartedArgs {
    id: string;
}

export interface MarkLandingStartedRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function markLandingStarted(sql: Sql, args: MarkLandingStartedArgs): Promise<MarkLandingStartedRow | null> {
    const rows = await sql.unsafe(markLandingStartedQuery, [args.id]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const failLandingTaskQuery = `-- name: FailLandingTask :one
UPDATE landing_tasks
SET status = 'failed',
    last_error = $2,
    finished_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING id, landing_request_id, repository_id, status, priority, attempt, last_error, available_at, started_at, finished_at, created_at, updated_at`;

export interface FailLandingTaskArgs {
    id: string;
    lastError: string | null;
}

export interface FailLandingTaskRow {
    id: string;
    landingRequestId: string;
    repositoryId: string;
    status: string;
    priority: number;
    attempt: number;
    lastError: string | null;
    availableAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function failLandingTask(sql: Sql, args: FailLandingTaskArgs): Promise<FailLandingTaskRow | null> {
    const rows = await sql.unsafe(failLandingTaskQuery, [args.id, args.lastError]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        repositoryId: row[2],
        status: row[3],
        priority: row[4],
        attempt: row[5],
        lastError: row[6],
        availableAt: row[7],
        startedAt: row[8],
        finishedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const revertLandingRequestToOpenQuery = `-- name: RevertLandingRequestToOpen :one
UPDATE landing_requests
SET state = 'open',
    queued_by = NULL,
    queued_at = NULL,
    landing_started_at = NULL,
    updated_at = NOW()
WHERE id = $1
RETURNING id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at`;

export interface RevertLandingRequestToOpenArgs {
    id: string;
}

export interface RevertLandingRequestToOpenRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function revertLandingRequestToOpen(sql: Sql, args: RevertLandingRequestToOpenArgs): Promise<RevertLandingRequestToOpenRow | null> {
    const rows = await sql.unsafe(revertLandingRequestToOpenQuery, [args.id]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLandingTaskByLandingRequestIDQuery = `-- name: GetLandingTaskByLandingRequestID :one
SELECT id, landing_request_id, repository_id, status, priority, attempt, last_error, available_at, started_at, finished_at, created_at, updated_at
FROM landing_tasks
WHERE landing_request_id = $1`;

export interface GetLandingTaskByLandingRequestIDArgs {
    landingRequestId: string;
}

export interface GetLandingTaskByLandingRequestIDRow {
    id: string;
    landingRequestId: string;
    repositoryId: string;
    status: string;
    priority: number;
    attempt: number;
    lastError: string | null;
    availableAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLandingTaskByLandingRequestID(sql: Sql, args: GetLandingTaskByLandingRequestIDArgs): Promise<GetLandingTaskByLandingRequestIDRow | null> {
    const rows = await sql.unsafe(getLandingTaskByLandingRequestIDQuery, [args.landingRequestId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        landingRequestId: row[1],
        repositoryId: row[2],
        status: row[3],
        priority: row[4],
        attempt: row[5],
        lastError: row[6],
        availableAt: row[7],
        startedAt: row[8],
        finishedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const getLandingRequestByIDQuery = `-- name: GetLandingRequestByID :one
SELECT id, repository_id, number, title, body, state, author_id, target_bookmark, source_bookmark, conflict_status, stack_size, queued_by, queued_at, landing_started_at, closed_at, merged_at, created_at, updated_at
FROM landing_requests
WHERE id = $1`;

export interface GetLandingRequestByIDArgs {
    id: string;
}

export interface GetLandingRequestByIDRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    targetBookmark: string;
    sourceBookmark: string;
    conflictStatus: string;
    stackSize: string;
    queuedBy: string | null;
    queuedAt: Date | null;
    landingStartedAt: Date | null;
    closedAt: Date | null;
    mergedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getLandingRequestByID(sql: Sql, args: GetLandingRequestByIDArgs): Promise<GetLandingRequestByIDRow | null> {
    const rows = await sql.unsafe(getLandingRequestByIDQuery, [args.id]).values();
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
        state: row[5],
        authorId: row[6],
        targetBookmark: row[7],
        sourceBookmark: row[8],
        conflictStatus: row[9],
        stackSize: row[10],
        queuedBy: row[11],
        queuedAt: row[12],
        landingStartedAt: row[13],
        closedAt: row[14],
        mergedAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    };
}

export const getLandingQueuePositionByTaskIDQuery = `-- name: GetLandingQueuePositionByTaskID :one
SELECT COUNT(*) AS position
FROM landing_tasks AS t
WHERE t.status IN ('pending', 'running')
  AND t.repository_id = (SELECT lt.repository_id FROM landing_tasks AS lt WHERE lt.id = $1)
  AND t.created_at <= (SELECT lt2.created_at FROM landing_tasks AS lt2 WHERE lt2.id = $1)`;

export interface GetLandingQueuePositionByTaskIDArgs {
    id: string;
}

export interface GetLandingQueuePositionByTaskIDRow {
    position: string;
}

export async function getLandingQueuePositionByTaskID(sql: Sql, args: GetLandingQueuePositionByTaskIDArgs): Promise<GetLandingQueuePositionByTaskIDRow | null> {
    const rows = await sql.unsafe(getLandingQueuePositionByTaskIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        position: row[0]
    };
}

