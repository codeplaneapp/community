import { Sql } from "postgres";

export const starRepoQuery = `-- name: StarRepo :one
INSERT INTO stars (user_id, repository_id)
VALUES ($1, $2)
RETURNING id, user_id, repository_id, created_at`;

export interface StarRepoArgs {
    userId: string;
    repositoryId: string;
}

export interface StarRepoRow {
    id: string;
    userId: string;
    repositoryId: string;
    createdAt: Date;
}

export async function starRepo(sql: Sql, args: StarRepoArgs): Promise<StarRepoRow | null> {
    const rows = await sql.unsafe(starRepoQuery, [args.userId, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        repositoryId: row[2],
        createdAt: row[3]
    };
}

export const unstarRepoQuery = `-- name: UnstarRepo :exec
DELETE FROM stars
WHERE user_id = $1
  AND repository_id = $2`;

export interface UnstarRepoArgs {
    userId: string;
    repositoryId: string;
}

export async function unstarRepo(sql: Sql, args: UnstarRepoArgs): Promise<void> {
    await sql.unsafe(unstarRepoQuery, [args.userId, args.repositoryId]);
}

export const watchRepoQuery = `-- name: WatchRepo :one
INSERT INTO watches (user_id, repository_id, mode)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, repository_id)
DO UPDATE SET mode = EXCLUDED.mode, updated_at = NOW()
RETURNING id, user_id, repository_id, mode, created_at, updated_at`;

export interface WatchRepoArgs {
    userId: string;
    repositoryId: string;
    mode: string;
}

export interface WatchRepoRow {
    id: string;
    userId: string;
    repositoryId: string;
    mode: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function watchRepo(sql: Sql, args: WatchRepoArgs): Promise<WatchRepoRow | null> {
    const rows = await sql.unsafe(watchRepoQuery, [args.userId, args.repositoryId, args.mode]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        repositoryId: row[2],
        mode: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const unwatchRepoQuery = `-- name: UnwatchRepo :exec
DELETE FROM watches
WHERE user_id = $1
  AND repository_id = $2`;

export interface UnwatchRepoArgs {
    userId: string;
    repositoryId: string;
}

export async function unwatchRepo(sql: Sql, args: UnwatchRepoArgs): Promise<void> {
    await sql.unsafe(unwatchRepoQuery, [args.userId, args.repositoryId]);
}

export const isRepoStarredQuery = `-- name: IsRepoStarred :one
SELECT EXISTS (
    SELECT 1
    FROM stars
    WHERE user_id = $1
      AND repository_id = $2
)`;

export interface IsRepoStarredArgs {
    userId: string;
    repositoryId: string;
}

export interface IsRepoStarredRow {
    exists: boolean;
}

export async function isRepoStarred(sql: Sql, args: IsRepoStarredArgs): Promise<IsRepoStarredRow | null> {
    const rows = await sql.unsafe(isRepoStarredQuery, [args.userId, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        exists: row[0]
    };
}

export const listUserStarredReposQuery = `-- name: ListUserStarredRepos :many
SELECT r.id, r.user_id, r.org_id, r.name, r.lower_name, r.description, r.shard_id, r.is_public, r.default_bookmark, r.topics, r.search_vector, r.next_issue_number, r.next_landing_number, r.is_fork, r.fork_id, r.is_template, r.template_id, r.is_archived, r.archived_at, r.is_mirror, r.mirror_destination, r.workspace_idle_timeout_secs, r.workspace_persistence, r.workspace_dependencies, r.landing_queue_mode, r.landing_queue_required_checks, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_closed_issues, r.created_at, r.updated_at
FROM stars s
JOIN repositories r ON r.id = s.repository_id
WHERE s.user_id = $1
ORDER BY s.created_at DESC, s.id DESC
LIMIT $3
OFFSET $2`;

export interface ListUserStarredReposArgs {
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListUserStarredReposRow {
    id: string;
    userId: string | null;
    orgId: string | null;
    name: string;
    lowerName: string;
    description: string;
    shardId: string;
    isPublic: boolean;
    defaultBookmark: string;
    topics: string[];
    searchVector: string | null;
    nextIssueNumber: string;
    nextLandingNumber: string;
    isFork: boolean;
    forkId: string | null;
    isTemplate: boolean;
    templateId: string | null;
    isArchived: boolean;
    archivedAt: Date | null;
    isMirror: boolean;
    mirrorDestination: string;
    workspaceIdleTimeoutSecs: number;
    workspacePersistence: string;
    workspaceDependencies: string[];
    landingQueueMode: string;
    landingQueueRequiredChecks: string[];
    numStars: string;
    numForks: string;
    numWatches: string;
    numIssues: string;
    numClosedIssues: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserStarredRepos(sql: Sql, args: ListUserStarredReposArgs): Promise<ListUserStarredReposRow[]> {
    return (await sql.unsafe(listUserStarredReposQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        name: row[3],
        lowerName: row[4],
        description: row[5],
        shardId: row[6],
        isPublic: row[7],
        defaultBookmark: row[8],
        topics: row[9],
        searchVector: row[10],
        nextIssueNumber: row[11],
        nextLandingNumber: row[12],
        isFork: row[13],
        forkId: row[14],
        isTemplate: row[15],
        templateId: row[16],
        isArchived: row[17],
        archivedAt: row[18],
        isMirror: row[19],
        mirrorDestination: row[20],
        workspaceIdleTimeoutSecs: row[21],
        workspacePersistence: row[22],
        workspaceDependencies: row[23],
        landingQueueMode: row[24],
        landingQueueRequiredChecks: row[25],
        numStars: row[26],
        numForks: row[27],
        numWatches: row[28],
        numIssues: row[29],
        numClosedIssues: row[30],
        createdAt: row[31],
        updatedAt: row[32]
    }));
}

export const countUserStarredReposQuery = `-- name: CountUserStarredRepos :one
SELECT COUNT(*)
FROM stars
WHERE user_id = $1`;

export interface CountUserStarredReposArgs {
    userId: string;
}

export interface CountUserStarredReposRow {
    count: string;
}

export async function countUserStarredRepos(sql: Sql, args: CountUserStarredReposArgs): Promise<CountUserStarredReposRow | null> {
    const rows = await sql.unsafe(countUserStarredReposQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listPublicUserStarredReposQuery = `-- name: ListPublicUserStarredRepos :many
SELECT r.id, r.user_id, r.org_id, r.name, r.lower_name, r.description, r.shard_id, r.is_public, r.default_bookmark, r.topics, r.search_vector, r.next_issue_number, r.next_landing_number, r.is_fork, r.fork_id, r.is_template, r.template_id, r.is_archived, r.archived_at, r.is_mirror, r.mirror_destination, r.workspace_idle_timeout_secs, r.workspace_persistence, r.workspace_dependencies, r.landing_queue_mode, r.landing_queue_required_checks, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_closed_issues, r.created_at, r.updated_at
FROM stars s
JOIN repositories r ON r.id = s.repository_id
WHERE s.user_id = $1
  AND r.is_public = TRUE
ORDER BY s.created_at DESC, s.id DESC
LIMIT $3
OFFSET $2`;

export interface ListPublicUserStarredReposArgs {
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListPublicUserStarredReposRow {
    id: string;
    userId: string | null;
    orgId: string | null;
    name: string;
    lowerName: string;
    description: string;
    shardId: string;
    isPublic: boolean;
    defaultBookmark: string;
    topics: string[];
    searchVector: string | null;
    nextIssueNumber: string;
    nextLandingNumber: string;
    isFork: boolean;
    forkId: string | null;
    isTemplate: boolean;
    templateId: string | null;
    isArchived: boolean;
    archivedAt: Date | null;
    isMirror: boolean;
    mirrorDestination: string;
    workspaceIdleTimeoutSecs: number;
    workspacePersistence: string;
    workspaceDependencies: string[];
    landingQueueMode: string;
    landingQueueRequiredChecks: string[];
    numStars: string;
    numForks: string;
    numWatches: string;
    numIssues: string;
    numClosedIssues: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listPublicUserStarredRepos(sql: Sql, args: ListPublicUserStarredReposArgs): Promise<ListPublicUserStarredReposRow[]> {
    return (await sql.unsafe(listPublicUserStarredReposQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        name: row[3],
        lowerName: row[4],
        description: row[5],
        shardId: row[6],
        isPublic: row[7],
        defaultBookmark: row[8],
        topics: row[9],
        searchVector: row[10],
        nextIssueNumber: row[11],
        nextLandingNumber: row[12],
        isFork: row[13],
        forkId: row[14],
        isTemplate: row[15],
        templateId: row[16],
        isArchived: row[17],
        archivedAt: row[18],
        isMirror: row[19],
        mirrorDestination: row[20],
        workspaceIdleTimeoutSecs: row[21],
        workspacePersistence: row[22],
        workspaceDependencies: row[23],
        landingQueueMode: row[24],
        landingQueueRequiredChecks: row[25],
        numStars: row[26],
        numForks: row[27],
        numWatches: row[28],
        numIssues: row[29],
        numClosedIssues: row[30],
        createdAt: row[31],
        updatedAt: row[32]
    }));
}

export const countPublicUserStarredReposQuery = `-- name: CountPublicUserStarredRepos :one
SELECT COUNT(*)
FROM stars s
JOIN repositories r ON r.id = s.repository_id
WHERE s.user_id = $1
  AND r.is_public = TRUE`;

export interface CountPublicUserStarredReposArgs {
    userId: string;
}

export interface CountPublicUserStarredReposRow {
    count: string;
}

export async function countPublicUserStarredRepos(sql: Sql, args: CountPublicUserStarredReposArgs): Promise<CountPublicUserStarredReposRow | null> {
    const rows = await sql.unsafe(countPublicUserStarredReposQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listRepoStargazersQuery = `-- name: ListRepoStargazers :many
SELECT u.id, u.username, u.lower_username, u.email, u.lower_email, u.display_name, u.bio, u.search_vector, u.avatar_url, u.wallet_address, u.user_type, u.is_active, u.is_admin, u.prohibit_login, u.email_notifications_enabled, u.last_login_at, u.created_at, u.updated_at
FROM stars s
JOIN users u ON u.id = s.user_id
WHERE s.repository_id = $1
ORDER BY u.id ASC
LIMIT $3
OFFSET $2`;

export interface ListRepoStargazersArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListRepoStargazersRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listRepoStargazers(sql: Sql, args: ListRepoStargazersArgs): Promise<ListRepoStargazersRow[]> {
    return (await sql.unsafe(listRepoStargazersQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17]
    }));
}

export const listRepoWatchersQuery = `-- name: ListRepoWatchers :many
SELECT
    u.id, u.username, u.lower_username, u.email, u.lower_email, u.display_name, u.bio, u.search_vector, u.avatar_url, u.wallet_address, u.user_type, u.is_active, u.is_admin, u.prohibit_login, u.email_notifications_enabled, u.last_login_at, u.created_at, u.updated_at,
    w.mode
FROM watches w
JOIN users u ON u.id = w.user_id
WHERE w.repository_id = $1
ORDER BY u.id ASC
LIMIT $3
OFFSET $2`;

export interface ListRepoWatchersArgs {
    repositoryId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListRepoWatchersRow {
    id: string;
    username: string;
    lowerUsername: string;
    email: string | null;
    lowerEmail: string | null;
    displayName: string;
    bio: string;
    searchVector: string | null;
    avatarUrl: string;
    walletAddress: string | null;
    userType: string;
    isActive: boolean;
    isAdmin: boolean;
    prohibitLogin: boolean;
    emailNotificationsEnabled: boolean;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    mode: string;
}

export async function listRepoWatchers(sql: Sql, args: ListRepoWatchersArgs): Promise<ListRepoWatchersRow[]> {
    return (await sql.unsafe(listRepoWatchersQuery, [args.repositoryId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        username: row[1],
        lowerUsername: row[2],
        email: row[3],
        lowerEmail: row[4],
        displayName: row[5],
        bio: row[6],
        searchVector: row[7],
        avatarUrl: row[8],
        walletAddress: row[9],
        userType: row[10],
        isActive: row[11],
        isAdmin: row[12],
        prohibitLogin: row[13],
        emailNotificationsEnabled: row[14],
        lastLoginAt: row[15],
        createdAt: row[16],
        updatedAt: row[17],
        mode: row[18]
    }));
}

export const getWatchStatusQuery = `-- name: GetWatchStatus :one
SELECT id, user_id, repository_id, mode, created_at, updated_at
FROM watches
WHERE user_id = $1
  AND repository_id = $2`;

export interface GetWatchStatusArgs {
    userId: string;
    repositoryId: string;
}

export interface GetWatchStatusRow {
    id: string;
    userId: string;
    repositoryId: string;
    mode: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWatchStatus(sql: Sql, args: GetWatchStatusArgs): Promise<GetWatchStatusRow | null> {
    const rows = await sql.unsafe(getWatchStatusQuery, [args.userId, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        repositoryId: row[2],
        mode: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const countRepoStarsQuery = `-- name: CountRepoStars :one
SELECT COUNT(*)
FROM stars
WHERE repository_id = $1`;

export interface CountRepoStarsArgs {
    repositoryId: string;
}

export interface CountRepoStarsRow {
    count: string;
}

export async function countRepoStars(sql: Sql, args: CountRepoStarsArgs): Promise<CountRepoStarsRow | null> {
    const rows = await sql.unsafe(countRepoStarsQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countRepoWatchersQuery = `-- name: CountRepoWatchers :one
SELECT COUNT(*)
FROM watches
WHERE repository_id = $1`;

export interface CountRepoWatchersArgs {
    repositoryId: string;
}

export interface CountRepoWatchersRow {
    count: string;
}

export async function countRepoWatchers(sql: Sql, args: CountRepoWatchersArgs): Promise<CountRepoWatchersRow | null> {
    const rows = await sql.unsafe(countRepoWatchersQuery, [args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listUserWatchedReposQuery = `-- name: ListUserWatchedRepos :many
SELECT
    r.id, r.user_id, r.org_id, r.name, r.lower_name, r.description, r.shard_id, r.is_public, r.default_bookmark, r.topics, r.search_vector, r.next_issue_number, r.next_landing_number, r.is_fork, r.fork_id, r.is_template, r.template_id, r.is_archived, r.archived_at, r.is_mirror, r.mirror_destination, r.workspace_idle_timeout_secs, r.workspace_persistence, r.workspace_dependencies, r.landing_queue_mode, r.landing_queue_required_checks, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_closed_issues, r.created_at, r.updated_at,
    w.mode AS watch_mode
FROM watches w
JOIN repositories r ON r.id = w.repository_id
WHERE w.user_id = $1
ORDER BY w.updated_at DESC
LIMIT $3
OFFSET $2`;

export interface ListUserWatchedReposArgs {
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListUserWatchedReposRow {
    id: string;
    userId: string | null;
    orgId: string | null;
    name: string;
    lowerName: string;
    description: string;
    shardId: string;
    isPublic: boolean;
    defaultBookmark: string;
    topics: string[];
    searchVector: string | null;
    nextIssueNumber: string;
    nextLandingNumber: string;
    isFork: boolean;
    forkId: string | null;
    isTemplate: boolean;
    templateId: string | null;
    isArchived: boolean;
    archivedAt: Date | null;
    isMirror: boolean;
    mirrorDestination: string;
    workspaceIdleTimeoutSecs: number;
    workspacePersistence: string;
    workspaceDependencies: string[];
    landingQueueMode: string;
    landingQueueRequiredChecks: string[];
    numStars: string;
    numForks: string;
    numWatches: string;
    numIssues: string;
    numClosedIssues: string;
    createdAt: Date;
    updatedAt: Date;
    watchMode: string;
}

export async function listUserWatchedRepos(sql: Sql, args: ListUserWatchedReposArgs): Promise<ListUserWatchedReposRow[]> {
    return (await sql.unsafe(listUserWatchedReposQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        name: row[3],
        lowerName: row[4],
        description: row[5],
        shardId: row[6],
        isPublic: row[7],
        defaultBookmark: row[8],
        topics: row[9],
        searchVector: row[10],
        nextIssueNumber: row[11],
        nextLandingNumber: row[12],
        isFork: row[13],
        forkId: row[14],
        isTemplate: row[15],
        templateId: row[16],
        isArchived: row[17],
        archivedAt: row[18],
        isMirror: row[19],
        mirrorDestination: row[20],
        workspaceIdleTimeoutSecs: row[21],
        workspacePersistence: row[22],
        workspaceDependencies: row[23],
        landingQueueMode: row[24],
        landingQueueRequiredChecks: row[25],
        numStars: row[26],
        numForks: row[27],
        numWatches: row[28],
        numIssues: row[29],
        numClosedIssues: row[30],
        createdAt: row[31],
        updatedAt: row[32],
        watchMode: row[33]
    }));
}

export const countUserWatchedReposQuery = `-- name: CountUserWatchedRepos :one
SELECT COUNT(*)
FROM watches
WHERE user_id = $1`;

export interface CountUserWatchedReposArgs {
    userId: string;
}

export interface CountUserWatchedReposRow {
    count: string;
}

export async function countUserWatchedRepos(sql: Sql, args: CountUserWatchedReposArgs): Promise<CountUserWatchedReposRow | null> {
    const rows = await sql.unsafe(countUserWatchedReposQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

