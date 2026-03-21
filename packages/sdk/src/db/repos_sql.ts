import { Sql } from "postgres";

export const createRepoQuery = `-- name: CreateRepo :one
INSERT INTO repositories (user_id, name, lower_name, description, shard_id, is_public, default_bookmark)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface CreateRepoArgs {
    userId: string | null;
    name: string;
    lowerName: string;
    description: string;
    shardId: string;
    isPublic: boolean;
    defaultBookmark: string;
}

export interface CreateRepoRow {
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

export async function createRepo(sql: Sql, args: CreateRepoArgs): Promise<CreateRepoRow | null> {
    const rows = await sql.unsafe(createRepoQuery, [args.userId, args.name, args.lowerName, args.description, args.shardId, args.isPublic, args.defaultBookmark]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const createOrgRepoQuery = `-- name: CreateOrgRepo :one
INSERT INTO repositories (org_id, name, lower_name, description, shard_id, is_public, default_bookmark)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface CreateOrgRepoArgs {
    orgId: string | null;
    name: string;
    lowerName: string;
    description: string;
    shardId: string;
    isPublic: boolean;
    defaultBookmark: string;
}

export interface CreateOrgRepoRow {
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

export async function createOrgRepo(sql: Sql, args: CreateOrgRepoArgs): Promise<CreateOrgRepoRow | null> {
    const rows = await sql.unsafe(createOrgRepoQuery, [args.orgId, args.name, args.lowerName, args.description, args.shardId, args.isPublic, args.defaultBookmark]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const deleteRepoQuery = `-- name: DeleteRepo :exec
DELETE FROM repositories WHERE id = $1`;

export interface DeleteRepoArgs {
    id: string;
}

export async function deleteRepo(sql: Sql, args: DeleteRepoArgs): Promise<void> {
    await sql.unsafe(deleteRepoQuery, [args.id]);
}

export const getRepoByOwnerAndNameQuery = `-- name: GetRepoByOwnerAndName :one
SELECT r.id, r.user_id, r.org_id, r.name, r.lower_name, r.is_public, r.is_archived
FROM repositories r
LEFT JOIN users u ON r.user_id = u.id
LEFT JOIN organizations o ON r.org_id = o.id
WHERE r.lower_name = LOWER($1)
  AND (
    (r.user_id IS NOT NULL AND u.lower_username = LOWER($2))
    OR
    (r.org_id IS NOT NULL AND o.lower_name = LOWER($2))
  )
LIMIT 1`;

export interface GetRepoByOwnerAndNameArgs {
    name: string;
    owner: string;
}

export interface GetRepoByOwnerAndNameRow {
    id: string;
    userId: string | null;
    orgId: string | null;
    name: string;
    lowerName: string;
    isPublic: boolean;
    isArchived: boolean;
}

export async function getRepoByOwnerAndName(sql: Sql, args: GetRepoByOwnerAndNameArgs): Promise<GetRepoByOwnerAndNameRow | null> {
    const rows = await sql.unsafe(getRepoByOwnerAndNameQuery, [args.name, args.owner]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        userId: row[1],
        orgId: row[2],
        name: row[3],
        lowerName: row[4],
        isPublic: row[5],
        isArchived: row[6]
    };
}

export const isOrgOwnerForRepoUserQuery = `-- name: IsOrgOwnerForRepoUser :one
SELECT EXISTS (
  SELECT 1
  FROM repositories r
  JOIN org_members om ON om.organization_id = r.org_id
  WHERE r.id = $1
    AND om.user_id = $2
    AND om.role = 'owner'
)`;

export interface IsOrgOwnerForRepoUserArgs {
    repositoryId: string;
    userId: string;
}

export interface IsOrgOwnerForRepoUserRow {
    exists: boolean;
}

export async function isOrgOwnerForRepoUser(sql: Sql, args: IsOrgOwnerForRepoUserArgs): Promise<IsOrgOwnerForRepoUserRow | null> {
    const rows = await sql.unsafe(isOrgOwnerForRepoUserQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        exists: row[0]
    };
}

export const getHighestTeamPermissionForRepoUserQuery = `-- name: GetHighestTeamPermissionForRepoUser :one
SELECT COALESCE((
  SELECT t.permission
  FROM team_repos tr
  JOIN teams t ON t.id = tr.team_id
  JOIN team_members tm ON tm.team_id = t.id
  WHERE tr.repository_id = $1
    AND tm.user_id = $2
  ORDER BY CASE t.permission
    WHEN 'admin' THEN 3
    WHEN 'write' THEN 2
    WHEN 'read' THEN 1
    ELSE 0
  END DESC
  LIMIT 1
), '')::text`;

export interface GetHighestTeamPermissionForRepoUserArgs {
    repositoryId: string;
    userId: string;
}

export interface GetHighestTeamPermissionForRepoUserRow {
    value: string;
}

export async function getHighestTeamPermissionForRepoUser(sql: Sql, args: GetHighestTeamPermissionForRepoUserArgs): Promise<GetHighestTeamPermissionForRepoUserRow | null> {
    const rows = await sql.unsafe(getHighestTeamPermissionForRepoUserQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        value: row[0]
    };
}

export const getRepoByIDQuery = `-- name: GetRepoByID :one
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
WHERE id = $1`;

export interface GetRepoByIDArgs {
    id: string;
}

export interface GetRepoByIDRow {
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

export async function getRepoByID(sql: Sql, args: GetRepoByIDArgs): Promise<GetRepoByIDRow | null> {
    const rows = await sql.unsafe(getRepoByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const getRepoByOwnerAndLowerNameQuery = `-- name: GetRepoByOwnerAndLowerName :one
SELECT r.id, r.user_id, r.org_id, r.name, r.lower_name, r.description, r.shard_id, r.is_public, r.default_bookmark, r.topics, r.search_vector, r.next_issue_number, r.next_landing_number, r.is_fork, r.fork_id, r.is_template, r.template_id, r.is_archived, r.archived_at, r.is_mirror, r.mirror_destination, r.workspace_idle_timeout_secs, r.workspace_persistence, r.workspace_dependencies, r.landing_queue_mode, r.landing_queue_required_checks, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_closed_issues, r.created_at, r.updated_at
FROM repositories r
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE r.lower_name = $1
  AND (
    u.lower_username = $2
    OR o.lower_name = $2
  )
LIMIT 1`;

export interface GetRepoByOwnerAndLowerNameArgs {
    lowerName: string;
    owner: string;
}

export interface GetRepoByOwnerAndLowerNameRow {
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

export async function getRepoByOwnerAndLowerName(sql: Sql, args: GetRepoByOwnerAndLowerNameArgs): Promise<GetRepoByOwnerAndLowerNameRow | null> {
    const rows = await sql.unsafe(getRepoByOwnerAndLowerNameQuery, [args.lowerName, args.owner]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const listUserReposQuery = `-- name: ListUserRepos :many
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
WHERE user_id = $1
ORDER BY updated_at DESC, id DESC
LIMIT $3
OFFSET $2`;

export interface ListUserReposArgs {
    userId: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListUserReposRow {
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

export async function listUserRepos(sql: Sql, args: ListUserReposArgs): Promise<ListUserReposRow[]> {
    return (await sql.unsafe(listUserReposQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const listPublicUserReposQuery = `-- name: ListPublicUserRepos :many
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
WHERE user_id = $1
  AND is_public = TRUE
ORDER BY updated_at DESC, id DESC
LIMIT $3
OFFSET $2`;

export interface ListPublicUserReposArgs {
    userId: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListPublicUserReposRow {
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

export async function listPublicUserRepos(sql: Sql, args: ListPublicUserReposArgs): Promise<ListPublicUserReposRow[]> {
    return (await sql.unsafe(listPublicUserReposQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const listOrgReposQuery = `-- name: ListOrgRepos :many
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
WHERE org_id = $1
ORDER BY updated_at DESC, id DESC
LIMIT $3
OFFSET $2`;

export interface ListOrgReposArgs {
    orgId: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListOrgReposRow {
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

export async function listOrgRepos(sql: Sql, args: ListOrgReposArgs): Promise<ListOrgReposRow[]> {
    return (await sql.unsafe(listOrgReposQuery, [args.orgId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const listPublicOrgReposQuery = `-- name: ListPublicOrgRepos :many
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
WHERE org_id = $1
  AND is_public = TRUE
ORDER BY updated_at DESC, id DESC
LIMIT $3
OFFSET $2`;

export interface ListPublicOrgReposArgs {
    orgId: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListPublicOrgReposRow {
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

export async function listPublicOrgRepos(sql: Sql, args: ListPublicOrgReposArgs): Promise<ListPublicOrgReposRow[]> {
    return (await sql.unsafe(listPublicOrgReposQuery, [args.orgId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const updateRepoQuery = `-- name: UpdateRepo :one
UPDATE repositories
SET name = $1,
    lower_name = $2,
    description = $3,
    is_public = $4,
    default_bookmark = $5,
    topics = $6,
    updated_at = NOW()
WHERE id = $7
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface UpdateRepoArgs {
    name: string;
    lowerName: string;
    description: string;
    isPublic: boolean;
    defaultBookmark: string;
    topics: string[];
    id: string;
}

export interface UpdateRepoRow {
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

export async function updateRepo(sql: Sql, args: UpdateRepoArgs): Promise<UpdateRepoRow | null> {
    const rows = await sql.unsafe(updateRepoQuery, [args.name, args.lowerName, args.description, args.isPublic, args.defaultBookmark, args.topics, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const updateRepoTopicsQuery = `-- name: UpdateRepoTopics :one
UPDATE repositories
SET topics = $1,
    updated_at = NOW()
WHERE id = $2
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface UpdateRepoTopicsArgs {
    topics: string[];
    id: string;
}

export interface UpdateRepoTopicsRow {
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

export async function updateRepoTopics(sql: Sql, args: UpdateRepoTopicsArgs): Promise<UpdateRepoTopicsRow | null> {
    const rows = await sql.unsafe(updateRepoTopicsQuery, [args.topics, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const updateRepoConfigStateQuery = `-- name: UpdateRepoConfigState :one
UPDATE repositories
SET description = $1,
    is_public = $2,
    topics = COALESCE($3::text[], '{}'::text[]),
    is_mirror = $4,
    mirror_destination = $5,
    workspace_idle_timeout_secs = $6,
    workspace_persistence = $7,
    workspace_dependencies = COALESCE($8::text[], '{}'::text[]),
    landing_queue_mode = $9,
    landing_queue_required_checks = COALESCE($10::text[], '{}'::text[]),
    updated_at = NOW()
WHERE id = $11
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface UpdateRepoConfigStateArgs {
    description: string;
    isPublic: boolean;
    topics: string[];
    isMirror: boolean;
    mirrorDestination: string;
    workspaceIdleTimeoutSecs: number;
    workspacePersistence: string;
    workspaceDependencies: string[];
    landingQueueMode: string;
    landingQueueRequiredChecks: string[];
    id: string;
}

export interface UpdateRepoConfigStateRow {
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

export async function updateRepoConfigState(sql: Sql, args: UpdateRepoConfigStateArgs): Promise<UpdateRepoConfigStateRow | null> {
    const rows = await sql.unsafe(updateRepoConfigStateQuery, [args.description, args.isPublic, args.topics, args.isMirror, args.mirrorDestination, args.workspaceIdleTimeoutSecs, args.workspacePersistence, args.workspaceDependencies, args.landingQueueMode, args.landingQueueRequiredChecks, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const incrementRepoStarsQuery = `-- name: IncrementRepoStars :exec
UPDATE repositories
SET num_stars = num_stars + 1,
    updated_at = NOW()
WHERE id = $1`;

export interface IncrementRepoStarsArgs {
    id: string;
}

export async function incrementRepoStars(sql: Sql, args: IncrementRepoStarsArgs): Promise<void> {
    await sql.unsafe(incrementRepoStarsQuery, [args.id]);
}

export const decrementRepoStarsQuery = `-- name: DecrementRepoStars :exec
UPDATE repositories
SET num_stars = GREATEST(num_stars - 1, 0),
    updated_at = NOW()
WHERE id = $1`;

export interface DecrementRepoStarsArgs {
    id: string;
}

export async function decrementRepoStars(sql: Sql, args: DecrementRepoStarsArgs): Promise<void> {
    await sql.unsafe(decrementRepoStarsQuery, [args.id]);
}

export const incrementRepoForksQuery = `-- name: IncrementRepoForks :exec
UPDATE repositories
SET num_forks = num_forks + 1,
    updated_at = NOW()
WHERE id = $1`;

export interface IncrementRepoForksArgs {
    id: string;
}

export async function incrementRepoForks(sql: Sql, args: IncrementRepoForksArgs): Promise<void> {
    await sql.unsafe(incrementRepoForksQuery, [args.id]);
}

export const countUserReposQuery = `-- name: CountUserRepos :one
SELECT COUNT(*)
FROM repositories
WHERE user_id = $1`;

export interface CountUserReposArgs {
    userId: string | null;
}

export interface CountUserReposRow {
    count: string;
}

export async function countUserRepos(sql: Sql, args: CountUserReposArgs): Promise<CountUserReposRow | null> {
    const rows = await sql.unsafe(countUserReposQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countPublicUserReposQuery = `-- name: CountPublicUserRepos :one
SELECT COUNT(*)
FROM repositories
WHERE user_id = $1
  AND is_public = TRUE`;

export interface CountPublicUserReposArgs {
    userId: string | null;
}

export interface CountPublicUserReposRow {
    count: string;
}

export async function countPublicUserRepos(sql: Sql, args: CountPublicUserReposArgs): Promise<CountPublicUserReposRow | null> {
    const rows = await sql.unsafe(countPublicUserReposQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countOrgReposQuery = `-- name: CountOrgRepos :one
SELECT COUNT(*)
FROM repositories
WHERE org_id = $1`;

export interface CountOrgReposArgs {
    orgId: string | null;
}

export interface CountOrgReposRow {
    count: string;
}

export async function countOrgRepos(sql: Sql, args: CountOrgReposArgs): Promise<CountOrgReposRow | null> {
    const rows = await sql.unsafe(countOrgReposQuery, [args.orgId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countPublicOrgReposQuery = `-- name: CountPublicOrgRepos :one
SELECT COUNT(*)
FROM repositories
WHERE org_id = $1
  AND is_public = TRUE`;

export interface CountPublicOrgReposArgs {
    orgId: string | null;
}

export interface CountPublicOrgReposRow {
    count: string;
}

export async function countPublicOrgRepos(sql: Sql, args: CountPublicOrgReposArgs): Promise<CountPublicOrgReposRow | null> {
    const rows = await sql.unsafe(countPublicOrgReposQuery, [args.orgId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listAllReposQuery = `-- name: ListAllRepos :many
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
ORDER BY updated_at DESC, id DESC
LIMIT $2
OFFSET $1`;

export interface ListAllReposArgs {
    pageOffset: string;
    pageSize: string;
}

export interface ListAllReposRow {
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

export async function listAllRepos(sql: Sql, args: ListAllReposArgs): Promise<ListAllReposRow[]> {
    return (await sql.unsafe(listAllReposQuery, [args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const countAllReposQuery = `-- name: CountAllRepos :one
SELECT COUNT(*)
FROM repositories`;

export interface CountAllReposRow {
    count: string;
}

export async function countAllRepos(sql: Sql): Promise<CountAllReposRow | null> {
    const rows = await sql.unsafe(countAllReposQuery, []).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const archiveRepoQuery = `-- name: ArchiveRepo :one
UPDATE repositories
SET is_archived = TRUE,
    archived_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface ArchiveRepoArgs {
    id: string;
}

export interface ArchiveRepoRow {
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

export async function archiveRepo(sql: Sql, args: ArchiveRepoArgs): Promise<ArchiveRepoRow | null> {
    const rows = await sql.unsafe(archiveRepoQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const unarchiveRepoQuery = `-- name: UnarchiveRepo :one
UPDATE repositories
SET is_archived = FALSE,
    archived_at = NULL,
    updated_at = NOW()
WHERE id = $1
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface UnarchiveRepoArgs {
    id: string;
}

export interface UnarchiveRepoRow {
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

export async function unarchiveRepo(sql: Sql, args: UnarchiveRepoArgs): Promise<UnarchiveRepoRow | null> {
    const rows = await sql.unsafe(unarchiveRepoQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const transferRepoToUserQuery = `-- name: TransferRepoToUser :one
UPDATE repositories
SET user_id = $1,
    org_id = NULL,
    updated_at = NOW()
WHERE id = $2
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface TransferRepoToUserArgs {
    newUserId: string | null;
    id: string;
}

export interface TransferRepoToUserRow {
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

export async function transferRepoToUser(sql: Sql, args: TransferRepoToUserArgs): Promise<TransferRepoToUserRow | null> {
    const rows = await sql.unsafe(transferRepoToUserQuery, [args.newUserId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const transferRepoToOrgQuery = `-- name: TransferRepoToOrg :one
UPDATE repositories
SET org_id = $1,
    user_id = NULL,
    updated_at = NOW()
WHERE id = $2
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface TransferRepoToOrgArgs {
    newOrgId: string | null;
    id: string;
}

export interface TransferRepoToOrgRow {
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

export async function transferRepoToOrg(sql: Sql, args: TransferRepoToOrgArgs): Promise<TransferRepoToOrgRow | null> {
    const rows = await sql.unsafe(transferRepoToOrgQuery, [args.newOrgId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const deleteCollaboratorsByRepoQuery = `-- name: DeleteCollaboratorsByRepo :exec
DELETE FROM collaborators
WHERE repository_id = $1`;

export interface DeleteCollaboratorsByRepoArgs {
    repositoryId: string;
}

export async function deleteCollaboratorsByRepo(sql: Sql, args: DeleteCollaboratorsByRepoArgs): Promise<void> {
    await sql.unsafe(deleteCollaboratorsByRepoQuery, [args.repositoryId]);
}

export const deleteTeamReposByRepoQuery = `-- name: DeleteTeamReposByRepo :exec
DELETE FROM team_repos
WHERE repository_id = $1`;

export interface DeleteTeamReposByRepoArgs {
    repositoryId: string;
}

export async function deleteTeamReposByRepo(sql: Sql, args: DeleteTeamReposByRepoArgs): Promise<void> {
    await sql.unsafe(deleteTeamReposByRepoQuery, [args.repositoryId]);
}

export const createForkRepoQuery = `-- name: CreateForkRepo :one
INSERT INTO repositories (user_id, name, lower_name, description, shard_id, is_public, default_bookmark, is_fork, fork_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
RETURNING id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at`;

export interface CreateForkRepoArgs {
    userId: string | null;
    name: string;
    lowerName: string;
    description: string;
    shardId: string;
    isPublic: boolean;
    defaultBookmark: string;
    forkId: string | null;
}

export interface CreateForkRepoRow {
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

export async function createForkRepo(sql: Sql, args: CreateForkRepoArgs): Promise<CreateForkRepoRow | null> {
    const rows = await sql.unsafe(createForkRepoQuery, [args.userId, args.name, args.lowerName, args.description, args.shardId, args.isPublic, args.defaultBookmark, args.forkId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
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
    };
}

export const countRepoForksQuery = `-- name: CountRepoForks :one
SELECT COUNT(*)
FROM repositories
WHERE fork_id = $1`;

export interface CountRepoForksArgs {
    forkId: string | null;
}

export interface CountRepoForksRow {
    count: string;
}

export async function countRepoForks(sql: Sql, args: CountRepoForksArgs): Promise<CountRepoForksRow | null> {
    const rows = await sql.unsafe(countRepoForksQuery, [args.forkId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listRepoForksQuery = `-- name: ListRepoForks :many
SELECT id, user_id, org_id, name, lower_name, description, shard_id, is_public, default_bookmark, topics, search_vector, next_issue_number, next_landing_number, is_fork, fork_id, is_template, template_id, is_archived, archived_at, is_mirror, mirror_destination, workspace_idle_timeout_secs, workspace_persistence, workspace_dependencies, landing_queue_mode, landing_queue_required_checks, num_stars, num_forks, num_watches, num_issues, num_closed_issues, created_at, updated_at
FROM repositories
WHERE fork_id = $1
ORDER BY created_at DESC, id DESC
LIMIT $3
OFFSET $2`;

export interface ListRepoForksArgs {
    forkId: string | null;
    pageOffset: string;
    pageSize: string;
}

export interface ListRepoForksRow {
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

export async function listRepoForks(sql: Sql, args: ListRepoForksArgs): Promise<ListRepoForksRow[]> {
    return (await sql.unsafe(listRepoForksQuery, [args.forkId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const addCollaboratorQuery = `-- name: AddCollaborator :one
INSERT INTO collaborators (repository_id, user_id, permission)
VALUES ($1, $2, $3)
RETURNING id, repository_id, user_id, permission, created_at`;

export interface AddCollaboratorArgs {
    repositoryId: string;
    userId: string;
    permission: string;
}

export interface AddCollaboratorRow {
    id: string;
    repositoryId: string;
    userId: string;
    permission: string;
    createdAt: Date;
}

export async function addCollaborator(sql: Sql, args: AddCollaboratorArgs): Promise<AddCollaboratorRow | null> {
    const rows = await sql.unsafe(addCollaboratorQuery, [args.repositoryId, args.userId, args.permission]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        userId: row[2],
        permission: row[3],
        createdAt: row[4]
    };
}

export const getCollaboratorPermissionForRepoUserQuery = `-- name: GetCollaboratorPermissionForRepoUser :one
SELECT COALESCE(
    (SELECT permission FROM collaborators WHERE repository_id = $1 AND user_id = $2),
    ''
)::text AS permission`;

export interface GetCollaboratorPermissionForRepoUserArgs {
    repositoryId: string;
    userId: string;
}

export interface GetCollaboratorPermissionForRepoUserRow {
    permission: string;
}

export async function getCollaboratorPermissionForRepoUser(sql: Sql, args: GetCollaboratorPermissionForRepoUserArgs): Promise<GetCollaboratorPermissionForRepoUserRow | null> {
    const rows = await sql.unsafe(getCollaboratorPermissionForRepoUserQuery, [args.repositoryId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        permission: row[0]
    };
}

