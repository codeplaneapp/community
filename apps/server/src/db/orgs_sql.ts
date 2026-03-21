import { Sql } from "postgres";

export const createOrganizationQuery = `-- name: CreateOrganization :one
INSERT INTO organizations (name, lower_name, description, visibility)
VALUES ($1, $2, $3, $4)
RETURNING id, name, lower_name, description, visibility, website, location, created_at, updated_at`;

export interface CreateOrganizationArgs {
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
}

export interface CreateOrganizationRow {
    id: string;
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createOrganization(sql: Sql, args: CreateOrganizationArgs): Promise<CreateOrganizationRow | null> {
    const rows = await sql.unsafe(createOrganizationQuery, [args.name, args.lowerName, args.description, args.visibility]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        lowerName: row[2],
        description: row[3],
        visibility: row[4],
        website: row[5],
        location: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const addOrgMemberQuery = `-- name: AddOrgMember :one
INSERT INTO org_members (organization_id, user_id, role)
VALUES ($1, $2, $3)
RETURNING id, organization_id, user_id, role, created_at, updated_at`;

export interface AddOrgMemberArgs {
    organizationId: string;
    userId: string;
    role: string;
}

export interface AddOrgMemberRow {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function addOrgMember(sql: Sql, args: AddOrgMemberArgs): Promise<AddOrgMemberRow | null> {
    const rows = await sql.unsafe(addOrgMemberQuery, [args.organizationId, args.userId, args.role]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        organizationId: row[1],
        userId: row[2],
        role: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const createTeamQuery = `-- name: CreateTeam :one
INSERT INTO teams (organization_id, name, lower_name, description, permission)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, organization_id, name, lower_name, description, permission, created_at, updated_at`;

export interface CreateTeamArgs {
    organizationId: string;
    name: string;
    lowerName: string;
    description: string;
    permission: string;
}

export interface CreateTeamRow {
    id: string;
    organizationId: string;
    name: string;
    lowerName: string;
    description: string;
    permission: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function createTeam(sql: Sql, args: CreateTeamArgs): Promise<CreateTeamRow | null> {
    const rows = await sql.unsafe(createTeamQuery, [args.organizationId, args.name, args.lowerName, args.description, args.permission]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        organizationId: row[1],
        name: row[2],
        lowerName: row[3],
        description: row[4],
        permission: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const addTeamMemberQuery = `-- name: AddTeamMember :one
INSERT INTO team_members (team_id, user_id)
VALUES ($1, $2)
RETURNING id, team_id, user_id, created_at`;

export interface AddTeamMemberArgs {
    teamId: string;
    userId: string;
}

export interface AddTeamMemberRow {
    id: string;
    teamId: string;
    userId: string;
    createdAt: Date;
}

export async function addTeamMember(sql: Sql, args: AddTeamMemberArgs): Promise<AddTeamMemberRow | null> {
    const rows = await sql.unsafe(addTeamMemberQuery, [args.teamId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        teamId: row[1],
        userId: row[2],
        createdAt: row[3]
    };
}

export const addTeamMemberIfOrgMemberQuery = `-- name: AddTeamMemberIfOrgMember :one
INSERT INTO team_members (team_id, user_id)
SELECT $1, $2
WHERE EXISTS (
    SELECT 1
    FROM teams t
    JOIN org_members om ON om.organization_id = t.organization_id
    WHERE t.id = $1
      AND om.user_id = $2
)
RETURNING id, team_id, user_id, created_at`;

export interface AddTeamMemberIfOrgMemberArgs {
    teamId: string;
    userId: string;
}

export interface AddTeamMemberIfOrgMemberRow {
    id: string;
    teamId: string;
    userId: string;
    createdAt: Date;
}

export async function addTeamMemberIfOrgMember(sql: Sql, args: AddTeamMemberIfOrgMemberArgs): Promise<AddTeamMemberIfOrgMemberRow | null> {
    const rows = await sql.unsafe(addTeamMemberIfOrgMemberQuery, [args.teamId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        teamId: row[1],
        userId: row[2],
        createdAt: row[3]
    };
}

export const addTeamRepoQuery = `-- name: AddTeamRepo :one
INSERT INTO team_repos (team_id, repository_id)
VALUES ($1, $2)
RETURNING id, team_id, repository_id, created_at`;

export interface AddTeamRepoArgs {
    teamId: string;
    repositoryId: string;
}

export interface AddTeamRepoRow {
    id: string;
    teamId: string;
    repositoryId: string;
    createdAt: Date;
}

export async function addTeamRepo(sql: Sql, args: AddTeamRepoArgs): Promise<AddTeamRepoRow | null> {
    const rows = await sql.unsafe(addTeamRepoQuery, [args.teamId, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        teamId: row[1],
        repositoryId: row[2],
        createdAt: row[3]
    };
}

export const addTeamRepoIfOrgRepoQuery = `-- name: AddTeamRepoIfOrgRepo :one
INSERT INTO team_repos (team_id, repository_id)
SELECT $1, $2
WHERE EXISTS (
    SELECT 1
    FROM teams t
    JOIN repositories r ON r.id = $2
    WHERE t.id = $1
      AND r.org_id = t.organization_id
)
RETURNING id, team_id, repository_id, created_at`;

export interface AddTeamRepoIfOrgRepoArgs {
    teamId: string;
    repositoryId: string;
}

export interface AddTeamRepoIfOrgRepoRow {
    id: string;
    teamId: string;
    repositoryId: string;
    createdAt: Date;
}

export async function addTeamRepoIfOrgRepo(sql: Sql, args: AddTeamRepoIfOrgRepoArgs): Promise<AddTeamRepoIfOrgRepoRow | null> {
    const rows = await sql.unsafe(addTeamRepoIfOrgRepoQuery, [args.teamId, args.repositoryId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        teamId: row[1],
        repositoryId: row[2],
        createdAt: row[3]
    };
}

export const getOrgByIDQuery = `-- name: GetOrgByID :one
SELECT id, name, lower_name, description, visibility, website, location, created_at, updated_at
FROM organizations
WHERE id = $1`;

export interface GetOrgByIDArgs {
    id: string;
}

export interface GetOrgByIDRow {
    id: string;
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOrgByID(sql: Sql, args: GetOrgByIDArgs): Promise<GetOrgByIDRow | null> {
    const rows = await sql.unsafe(getOrgByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        lowerName: row[2],
        description: row[3],
        visibility: row[4],
        website: row[5],
        location: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const getOrgByLowerNameQuery = `-- name: GetOrgByLowerName :one
SELECT id, name, lower_name, description, visibility, website, location, created_at, updated_at
FROM organizations
WHERE lower_name = $1`;

export interface GetOrgByLowerNameArgs {
    lowerName: string;
}

export interface GetOrgByLowerNameRow {
    id: string;
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOrgByLowerName(sql: Sql, args: GetOrgByLowerNameArgs): Promise<GetOrgByLowerNameRow | null> {
    const rows = await sql.unsafe(getOrgByLowerNameQuery, [args.lowerName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        lowerName: row[2],
        description: row[3],
        visibility: row[4],
        website: row[5],
        location: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const updateOrganizationQuery = `-- name: UpdateOrganization :one
UPDATE organizations
SET name = $1,
    lower_name = $2,
    description = $3,
    visibility = $4,
    website = $5,
    location = $6,
    updated_at = NOW()
WHERE id = $7
RETURNING id, name, lower_name, description, visibility, website, location, created_at, updated_at`;

export interface UpdateOrganizationArgs {
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    id: string;
}

export interface UpdateOrganizationRow {
    id: string;
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateOrganization(sql: Sql, args: UpdateOrganizationArgs): Promise<UpdateOrganizationRow | null> {
    const rows = await sql.unsafe(updateOrganizationQuery, [args.name, args.lowerName, args.description, args.visibility, args.website, args.location, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        name: row[1],
        lowerName: row[2],
        description: row[3],
        visibility: row[4],
        website: row[5],
        location: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    };
}

export const deleteOrganizationQuery = `-- name: DeleteOrganization :exec
DELETE FROM organizations
WHERE id = $1`;

export interface DeleteOrganizationArgs {
    id: string;
}

export async function deleteOrganization(sql: Sql, args: DeleteOrganizationArgs): Promise<void> {
    await sql.unsafe(deleteOrganizationQuery, [args.id]);
}

export const listOrgMembersQuery = `-- name: ListOrgMembers :many
SELECT
    u.id, u.username, u.lower_username, u.email, u.lower_email, u.display_name, u.bio, u.search_vector, u.avatar_url, u.wallet_address, u.user_type, u.is_active, u.is_admin, u.prohibit_login, u.email_notifications_enabled, u.last_login_at, u.created_at, u.updated_at,
    om.role
FROM org_members om
JOIN users u ON u.id = om.user_id
WHERE om.organization_id = $1
ORDER BY u.id ASC
LIMIT $3
OFFSET $2`;

export interface ListOrgMembersArgs {
    organizationId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListOrgMembersRow {
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
    role: string;
}

export async function listOrgMembers(sql: Sql, args: ListOrgMembersArgs): Promise<ListOrgMembersRow[]> {
    return (await sql.unsafe(listOrgMembersQuery, [args.organizationId, args.pageOffset, args.pageSize]).values()).map(row => ({
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
        role: row[18]
    }));
}

export const getOrgMemberQuery = `-- name: GetOrgMember :one
SELECT id, organization_id, user_id, role, created_at, updated_at
FROM org_members
WHERE organization_id = $1
  AND user_id = $2`;

export interface GetOrgMemberArgs {
    organizationId: string;
    userId: string;
}

export interface GetOrgMemberRow {
    id: string;
    organizationId: string;
    userId: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getOrgMember(sql: Sql, args: GetOrgMemberArgs): Promise<GetOrgMemberRow | null> {
    const rows = await sql.unsafe(getOrgMemberQuery, [args.organizationId, args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        organizationId: row[1],
        userId: row[2],
        role: row[3],
        createdAt: row[4],
        updatedAt: row[5]
    };
}

export const removeOrgMemberQuery = `-- name: RemoveOrgMember :exec
DELETE FROM org_members
WHERE organization_id = $1
  AND user_id = $2`;

export interface RemoveOrgMemberArgs {
    organizationId: string;
    userId: string;
}

export async function removeOrgMember(sql: Sql, args: RemoveOrgMemberArgs): Promise<void> {
    await sql.unsafe(removeOrgMemberQuery, [args.organizationId, args.userId]);
}

export const updateOrgMemberRoleQuery = `-- name: UpdateOrgMemberRole :exec
UPDATE org_members
SET role = $1,
    updated_at = NOW()
WHERE organization_id = $2
  AND user_id = $3`;

export interface UpdateOrgMemberRoleArgs {
    role: string;
    organizationId: string;
    userId: string;
}

export async function updateOrgMemberRole(sql: Sql, args: UpdateOrgMemberRoleArgs): Promise<void> {
    await sql.unsafe(updateOrgMemberRoleQuery, [args.role, args.organizationId, args.userId]);
}

export const listUserOrgsQuery = `-- name: ListUserOrgs :many
SELECT o.id, o.name, o.lower_name, o.description, o.visibility, o.website, o.location, o.created_at, o.updated_at
FROM organizations o
JOIN org_members om ON om.organization_id = o.id
WHERE om.user_id = $1
ORDER BY o.id ASC
LIMIT $3
OFFSET $2`;

export interface ListUserOrgsArgs {
    userId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListUserOrgsRow {
    id: string;
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listUserOrgs(sql: Sql, args: ListUserOrgsArgs): Promise<ListUserOrgsRow[]> {
    return (await sql.unsafe(listUserOrgsQuery, [args.userId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        name: row[1],
        lowerName: row[2],
        description: row[3],
        visibility: row[4],
        website: row[5],
        location: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const countUserOrgsQuery = `-- name: CountUserOrgs :one
SELECT COUNT(*)
FROM org_members
WHERE user_id = $1`;

export interface CountUserOrgsArgs {
    userId: string;
}

export interface CountUserOrgsRow {
    count: string;
}

export async function countUserOrgs(sql: Sql, args: CountUserOrgsArgs): Promise<CountUserOrgsRow | null> {
    const rows = await sql.unsafe(countUserOrgsQuery, [args.userId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listOrgTeamsQuery = `-- name: ListOrgTeams :many
SELECT id, organization_id, name, lower_name, description, permission, created_at, updated_at
FROM teams
WHERE organization_id = $1
ORDER BY id ASC
LIMIT $3
OFFSET $2`;

export interface ListOrgTeamsArgs {
    organizationId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListOrgTeamsRow {
    id: string;
    organizationId: string;
    name: string;
    lowerName: string;
    description: string;
    permission: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listOrgTeams(sql: Sql, args: ListOrgTeamsArgs): Promise<ListOrgTeamsRow[]> {
    return (await sql.unsafe(listOrgTeamsQuery, [args.organizationId, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        organizationId: row[1],
        name: row[2],
        lowerName: row[3],
        description: row[4],
        permission: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    }));
}

export const getTeamByIDQuery = `-- name: GetTeamByID :one
SELECT id, organization_id, name, lower_name, description, permission, created_at, updated_at
FROM teams
WHERE id = $1`;

export interface GetTeamByIDArgs {
    id: string;
}

export interface GetTeamByIDRow {
    id: string;
    organizationId: string;
    name: string;
    lowerName: string;
    description: string;
    permission: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getTeamByID(sql: Sql, args: GetTeamByIDArgs): Promise<GetTeamByIDRow | null> {
    const rows = await sql.unsafe(getTeamByIDQuery, [args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        organizationId: row[1],
        name: row[2],
        lowerName: row[3],
        description: row[4],
        permission: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const getTeamByOrgAndLowerNameQuery = `-- name: GetTeamByOrgAndLowerName :one
SELECT id, organization_id, name, lower_name, description, permission, created_at, updated_at
FROM teams
WHERE organization_id = $1
  AND lower_name = $2`;

export interface GetTeamByOrgAndLowerNameArgs {
    organizationId: string;
    lowerName: string;
}

export interface GetTeamByOrgAndLowerNameRow {
    id: string;
    organizationId: string;
    name: string;
    lowerName: string;
    description: string;
    permission: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function getTeamByOrgAndLowerName(sql: Sql, args: GetTeamByOrgAndLowerNameArgs): Promise<GetTeamByOrgAndLowerNameRow | null> {
    const rows = await sql.unsafe(getTeamByOrgAndLowerNameQuery, [args.organizationId, args.lowerName]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        organizationId: row[1],
        name: row[2],
        lowerName: row[3],
        description: row[4],
        permission: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const updateTeamQuery = `-- name: UpdateTeam :one
UPDATE teams
SET name = $1,
    lower_name = $2,
    description = $3,
    permission = $4,
    updated_at = NOW()
WHERE id = $5
RETURNING id, organization_id, name, lower_name, description, permission, created_at, updated_at`;

export interface UpdateTeamArgs {
    name: string;
    lowerName: string;
    description: string;
    permission: string;
    id: string;
}

export interface UpdateTeamRow {
    id: string;
    organizationId: string;
    name: string;
    lowerName: string;
    description: string;
    permission: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateTeam(sql: Sql, args: UpdateTeamArgs): Promise<UpdateTeamRow | null> {
    const rows = await sql.unsafe(updateTeamQuery, [args.name, args.lowerName, args.description, args.permission, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        organizationId: row[1],
        name: row[2],
        lowerName: row[3],
        description: row[4],
        permission: row[5],
        createdAt: row[6],
        updatedAt: row[7]
    };
}

export const deleteTeamQuery = `-- name: DeleteTeam :exec
DELETE FROM teams
WHERE id = $1`;

export interface DeleteTeamArgs {
    id: string;
}

export async function deleteTeam(sql: Sql, args: DeleteTeamArgs): Promise<void> {
    await sql.unsafe(deleteTeamQuery, [args.id]);
}

export const listTeamMembersQuery = `-- name: ListTeamMembers :many
SELECT u.id, u.username, u.lower_username, u.email, u.lower_email, u.display_name, u.bio, u.search_vector, u.avatar_url, u.wallet_address, u.user_type, u.is_active, u.is_admin, u.prohibit_login, u.email_notifications_enabled, u.last_login_at, u.created_at, u.updated_at
FROM team_members tm
JOIN users u ON u.id = tm.user_id
WHERE tm.team_id = $1
ORDER BY u.id ASC
LIMIT $3
OFFSET $2`;

export interface ListTeamMembersArgs {
    teamId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListTeamMembersRow {
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

export async function listTeamMembers(sql: Sql, args: ListTeamMembersArgs): Promise<ListTeamMembersRow[]> {
    return (await sql.unsafe(listTeamMembersQuery, [args.teamId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const countTeamMembersQuery = `-- name: CountTeamMembers :one
SELECT COUNT(*)
FROM team_members
WHERE team_id = $1`;

export interface CountTeamMembersArgs {
    teamId: string;
}

export interface CountTeamMembersRow {
    count: string;
}

export async function countTeamMembers(sql: Sql, args: CountTeamMembersArgs): Promise<CountTeamMembersRow | null> {
    const rows = await sql.unsafe(countTeamMembersQuery, [args.teamId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const removeTeamMemberQuery = `-- name: RemoveTeamMember :exec
DELETE FROM team_members
WHERE team_id = $1
  AND user_id = $2`;

export interface RemoveTeamMemberArgs {
    teamId: string;
    userId: string;
}

export async function removeTeamMember(sql: Sql, args: RemoveTeamMemberArgs): Promise<void> {
    await sql.unsafe(removeTeamMemberQuery, [args.teamId, args.userId]);
}

export const listTeamReposQuery = `-- name: ListTeamRepos :many
SELECT r.id, r.user_id, r.org_id, r.name, r.lower_name, r.description, r.shard_id, r.is_public, r.default_bookmark, r.topics, r.search_vector, r.next_issue_number, r.next_landing_number, r.is_fork, r.fork_id, r.is_template, r.template_id, r.is_archived, r.archived_at, r.is_mirror, r.mirror_destination, r.workspace_idle_timeout_secs, r.workspace_persistence, r.workspace_dependencies, r.landing_queue_mode, r.landing_queue_required_checks, r.num_stars, r.num_forks, r.num_watches, r.num_issues, r.num_closed_issues, r.created_at, r.updated_at
FROM team_repos tr
JOIN repositories r ON r.id = tr.repository_id
WHERE tr.team_id = $1
ORDER BY r.id ASC
LIMIT $3
OFFSET $2`;

export interface ListTeamReposArgs {
    teamId: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListTeamReposRow {
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

export async function listTeamRepos(sql: Sql, args: ListTeamReposArgs): Promise<ListTeamReposRow[]> {
    return (await sql.unsafe(listTeamReposQuery, [args.teamId, args.pageOffset, args.pageSize]).values()).map(row => ({
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

export const countTeamReposQuery = `-- name: CountTeamRepos :one
SELECT COUNT(*)
FROM team_repos
WHERE team_id = $1`;

export interface CountTeamReposArgs {
    teamId: string;
}

export interface CountTeamReposRow {
    count: string;
}

export async function countTeamRepos(sql: Sql, args: CountTeamReposArgs): Promise<CountTeamReposRow | null> {
    const rows = await sql.unsafe(countTeamReposQuery, [args.teamId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const removeTeamRepoQuery = `-- name: RemoveTeamRepo :exec
DELETE FROM team_repos
WHERE team_id = $1
  AND repository_id = $2`;

export interface RemoveTeamRepoArgs {
    teamId: string;
    repositoryId: string;
}

export async function removeTeamRepo(sql: Sql, args: RemoveTeamRepoArgs): Promise<void> {
    await sql.unsafe(removeTeamRepoQuery, [args.teamId, args.repositoryId]);
}

export const countOrgMembersQuery = `-- name: CountOrgMembers :one
SELECT COUNT(*)
FROM org_members
WHERE organization_id = $1`;

export interface CountOrgMembersArgs {
    organizationId: string;
}

export interface CountOrgMembersRow {
    count: string;
}

export async function countOrgMembers(sql: Sql, args: CountOrgMembersArgs): Promise<CountOrgMembersRow | null> {
    const rows = await sql.unsafe(countOrgMembersQuery, [args.organizationId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countOrgTeamsQuery = `-- name: CountOrgTeams :one
SELECT COUNT(*)
FROM teams
WHERE organization_id = $1`;

export interface CountOrgTeamsArgs {
    organizationId: string;
}

export interface CountOrgTeamsRow {
    count: string;
}

export async function countOrgTeams(sql: Sql, args: CountOrgTeamsArgs): Promise<CountOrgTeamsRow | null> {
    const rows = await sql.unsafe(countOrgTeamsQuery, [args.organizationId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const countOrgOwnersQuery = `-- name: CountOrgOwners :one
SELECT COUNT(*)
FROM org_members
WHERE organization_id = $1 AND role = 'owner'`;

export interface CountOrgOwnersArgs {
    organizationId: string;
}

export interface CountOrgOwnersRow {
    count: string;
}

export async function countOrgOwners(sql: Sql, args: CountOrgOwnersArgs): Promise<CountOrgOwnersRow | null> {
    const rows = await sql.unsafe(countOrgOwnersQuery, [args.organizationId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const listAllOrgsQuery = `-- name: ListAllOrgs :many
SELECT id, name, lower_name, description, visibility, website, location, created_at, updated_at
FROM organizations
ORDER BY id ASC
LIMIT $2
OFFSET $1`;

export interface ListAllOrgsArgs {
    pageOffset: string;
    pageSize: string;
}

export interface ListAllOrgsRow {
    id: string;
    name: string;
    lowerName: string;
    description: string;
    visibility: string;
    website: string;
    location: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function listAllOrgs(sql: Sql, args: ListAllOrgsArgs): Promise<ListAllOrgsRow[]> {
    return (await sql.unsafe(listAllOrgsQuery, [args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        name: row[1],
        lowerName: row[2],
        description: row[3],
        visibility: row[4],
        website: row[5],
        location: row[6],
        createdAt: row[7],
        updatedAt: row[8]
    }));
}

export const countAllOrgsQuery = `-- name: CountAllOrgs :one
SELECT COUNT(*)
FROM organizations`;

export interface CountAllOrgsRow {
    count: string;
}

export async function countAllOrgs(sql: Sql): Promise<CountAllOrgsRow | null> {
    const rows = await sql.unsafe(countAllOrgsQuery, []).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

