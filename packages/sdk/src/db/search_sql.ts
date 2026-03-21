import { Sql } from "postgres";

export const searchRepositoriesFTSQuery = `-- name: SearchRepositoriesFTS :many
WITH visible_repositories AS (
    SELECT r.id
    FROM repositories r
    WHERE r.is_public = TRUE

    UNION

    SELECT r.id
    FROM repositories r
    WHERE $4::bigint > 0
      AND r.user_id = $4::bigint

    UNION

    SELECT r.id
    FROM repositories r
    JOIN org_members om ON om.organization_id = r.org_id
    WHERE $4::bigint > 0
      AND om.user_id = $4::bigint
      AND om.role = 'owner'

    UNION

    SELECT tr.repository_id AS id
    FROM team_repos tr
    JOIN team_members tm ON tm.team_id = tr.team_id
    WHERE $4::bigint > 0
      AND tm.user_id = $4::bigint

    UNION

    SELECT c.repository_id AS id
    FROM collaborators c
    WHERE $4::bigint > 0
      AND c.user_id = $4::bigint
)
SELECT
    r.id,
    r.user_id,
    r.org_id,
    r.name,
    r.lower_name,
    r.description,
    r.is_public,
    r.default_bookmark,
    r.topics,
    r.num_stars,
    r.num_watches,
    r.num_issues,
    r.created_at,
    r.updated_at,
    COALESCE(u.username, o.name) AS owner_name,
    ts_rank(r.search_vector, plainto_tsquery('simple', $1::text)) AS rank
FROM repositories r
JOIN visible_repositories vr ON vr.id = r.id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE r.search_vector @@ plainto_tsquery('simple', $1::text)
ORDER BY rank DESC, r.id DESC
LIMIT $3::int
OFFSET $2::int`;

export interface SearchRepositoriesFTSArgs {
    query: string;
    pageOffset: number;
    pageSize: number;
    viewerId: string;
}

export interface SearchRepositoriesFTSRow {
    id: string;
    userId: string | null;
    orgId: string | null;
    name: string;
    lowerName: string;
    description: string;
    isPublic: boolean;
    defaultBookmark: string;
    topics: string[];
    numStars: string;
    numWatches: string;
    numIssues: string;
    createdAt: Date;
    updatedAt: Date;
    ownerName: string;
    rank: string;
}

export async function searchRepositoriesFTS(sql: Sql, args: SearchRepositoriesFTSArgs): Promise<SearchRepositoriesFTSRow[]> {
    return (await sql.unsafe(searchRepositoriesFTSQuery, [args.query, args.pageOffset, args.pageSize, args.viewerId]).values()).map(row => ({
        id: row[0],
        userId: row[1],
        orgId: row[2],
        name: row[3],
        lowerName: row[4],
        description: row[5],
        isPublic: row[6],
        defaultBookmark: row[7],
        topics: row[8],
        numStars: row[9],
        numWatches: row[10],
        numIssues: row[11],
        createdAt: row[12],
        updatedAt: row[13],
        ownerName: row[14],
        rank: row[15]
    }));
}

export const countSearchRepositoriesFTSQuery = `-- name: CountSearchRepositoriesFTS :one
WITH visible_repositories AS (
    SELECT r.id
    FROM repositories r
    WHERE r.is_public = TRUE

    UNION

    SELECT r.id
    FROM repositories r
    WHERE $2::bigint > 0
      AND r.user_id = $2::bigint

    UNION

    SELECT r.id
    FROM repositories r
    JOIN org_members om ON om.organization_id = r.org_id
    WHERE $2::bigint > 0
      AND om.user_id = $2::bigint
      AND om.role = 'owner'

    UNION

    SELECT tr.repository_id AS id
    FROM team_repos tr
    JOIN team_members tm ON tm.team_id = tr.team_id
    WHERE $2::bigint > 0
      AND tm.user_id = $2::bigint

    UNION

    SELECT c.repository_id AS id
    FROM collaborators c
    WHERE $2::bigint > 0
      AND c.user_id = $2::bigint
)
SELECT COUNT(*)
FROM repositories r
JOIN visible_repositories vr ON vr.id = r.id
WHERE r.search_vector @@ plainto_tsquery('simple', $1::text)`;

export interface CountSearchRepositoriesFTSArgs {
    query: string;
    viewerId: string;
}

export interface CountSearchRepositoriesFTSRow {
    count: string;
}

export async function countSearchRepositoriesFTS(sql: Sql, args: CountSearchRepositoriesFTSArgs): Promise<CountSearchRepositoriesFTSRow | null> {
    const rows = await sql.unsafe(countSearchRepositoriesFTSQuery, [args.query, args.viewerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const searchIssuesFTSQuery = `-- name: SearchIssuesFTS :many
WITH visible_repositories AS (
    SELECT r.id
    FROM repositories r
    WHERE r.is_public = TRUE

    UNION

    SELECT r.id
    FROM repositories r
    WHERE $8::bigint > 0
      AND r.user_id = $8::bigint

    UNION

    SELECT r.id
    FROM repositories r
    JOIN org_members om ON om.organization_id = r.org_id
    WHERE $8::bigint > 0
      AND om.user_id = $8::bigint
      AND om.role = 'owner'

    UNION

    SELECT tr.repository_id AS id
    FROM team_repos tr
    JOIN team_members tm ON tm.team_id = tr.team_id
    WHERE $8::bigint > 0
      AND tm.user_id = $8::bigint

    UNION

    SELECT c.repository_id AS id
    FROM collaborators c
    WHERE $8::bigint > 0
      AND c.user_id = $8::bigint
)
SELECT
    i.id,
    i.repository_id,
    i.number,
    i.title,
    i.body,
    i.state,
    i.author_id,
    i.comment_count,
    i.closed_at,
    i.created_at,
    i.updated_at,
    r.name AS repository_name,
    COALESCE(u.username, o.name) AS owner_name,
    ts_rank(i.search_vector, plainto_tsquery('simple', $1::text)) AS rank
FROM issues i
JOIN repositories r ON r.id = i.repository_id
JOIN visible_repositories vr ON vr.id = r.id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE i.search_vector @@ plainto_tsquery('simple', $1::text)
  AND (
    $2::text = ''
    OR i.state = $2::text
  )
  AND (
    $3::text = ''
    OR EXISTS (
      SELECT 1
      FROM issue_labels il
      JOIN labels l ON l.id = il.label_id
      WHERE il.issue_id = i.id
        AND l.repository_id = r.id
        AND LOWER(l.name) = LOWER($3::text)
    )
  )
  AND (
    $4::text = ''
    OR EXISTS (
      SELECT 1
      FROM issue_assignees ia
      JOIN users au ON au.id = ia.user_id
      WHERE ia.issue_id = i.id
        AND au.lower_username = LOWER($4::text)
    )
  )
  AND (
    $5::text = ''
    OR EXISTS (
      SELECT 1
      FROM milestones m
      WHERE m.id = i.milestone_id
        AND m.repository_id = r.id
        AND LOWER(m.title) = LOWER($5::text)
    )
  )
ORDER BY rank DESC, i.id DESC
LIMIT $7::int
OFFSET $6::int`;

export interface SearchIssuesFTSArgs {
    query: string;
    stateFilter: string;
    labelFilter: string;
    assigneeFilter: string;
    milestoneFilter: string;
    pageOffset: number;
    pageSize: number;
    viewerId: string;
}

export interface SearchIssuesFTSRow {
    id: string;
    repositoryId: string;
    number: string;
    title: string;
    body: string;
    state: string;
    authorId: string;
    commentCount: string;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    repositoryName: string;
    ownerName: string;
    rank: string;
}

export async function searchIssuesFTS(sql: Sql, args: SearchIssuesFTSArgs): Promise<SearchIssuesFTSRow[]> {
    return (await sql.unsafe(searchIssuesFTSQuery, [args.query, args.stateFilter, args.labelFilter, args.assigneeFilter, args.milestoneFilter, args.pageOffset, args.pageSize, args.viewerId]).values()).map(row => ({
        id: row[0],
        repositoryId: row[1],
        number: row[2],
        title: row[3],
        body: row[4],
        state: row[5],
        authorId: row[6],
        commentCount: row[7],
        closedAt: row[8],
        createdAt: row[9],
        updatedAt: row[10],
        repositoryName: row[11],
        ownerName: row[12],
        rank: row[13]
    }));
}

export const countSearchIssuesFTSQuery = `-- name: CountSearchIssuesFTS :one
WITH visible_repositories AS (
    SELECT r.id
    FROM repositories r
    WHERE r.is_public = TRUE

    UNION

    SELECT r.id
    FROM repositories r
    WHERE $6::bigint > 0
      AND r.user_id = $6::bigint

    UNION

    SELECT r.id
    FROM repositories r
    JOIN org_members om ON om.organization_id = r.org_id
    WHERE $6::bigint > 0
      AND om.user_id = $6::bigint
      AND om.role = 'owner'

    UNION

    SELECT tr.repository_id AS id
    FROM team_repos tr
    JOIN team_members tm ON tm.team_id = tr.team_id
    WHERE $6::bigint > 0
      AND tm.user_id = $6::bigint

    UNION

    SELECT c.repository_id AS id
    FROM collaborators c
    WHERE $6::bigint > 0
      AND c.user_id = $6::bigint
)
SELECT COUNT(*)
FROM issues i
JOIN repositories r ON r.id = i.repository_id
JOIN visible_repositories vr ON vr.id = r.id
WHERE i.search_vector @@ plainto_tsquery('simple', $1::text)
  AND (
    $2::text = ''
    OR i.state = $2::text
  )
  AND (
    $3::text = ''
    OR EXISTS (
      SELECT 1
      FROM issue_labels il
      JOIN labels l ON l.id = il.label_id
      WHERE il.issue_id = i.id
        AND l.repository_id = r.id
        AND LOWER(l.name) = LOWER($3::text)
    )
  )
  AND (
    $4::text = ''
    OR EXISTS (
      SELECT 1
      FROM issue_assignees ia
      JOIN users au ON au.id = ia.user_id
      WHERE ia.issue_id = i.id
        AND au.lower_username = LOWER($4::text)
    )
  )
  AND (
    $5::text = ''
    OR EXISTS (
      SELECT 1
      FROM milestones m
      WHERE m.id = i.milestone_id
        AND m.repository_id = r.id
        AND LOWER(m.title) = LOWER($5::text)
    )
  )`;

export interface CountSearchIssuesFTSArgs {
    query: string;
    stateFilter: string;
    labelFilter: string;
    assigneeFilter: string;
    milestoneFilter: string;
    viewerId: string;
}

export interface CountSearchIssuesFTSRow {
    count: string;
}

export async function countSearchIssuesFTS(sql: Sql, args: CountSearchIssuesFTSArgs): Promise<CountSearchIssuesFTSRow | null> {
    const rows = await sql.unsafe(countSearchIssuesFTSQuery, [args.query, args.stateFilter, args.labelFilter, args.assigneeFilter, args.milestoneFilter, args.viewerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const searchCodeFTSQuery = `-- name: SearchCodeFTS :many
WITH visible_repositories AS (
    SELECT r.id
    FROM repositories r
    WHERE r.is_public = TRUE

    UNION

    SELECT r.id
    FROM repositories r
    WHERE $4::bigint > 0
      AND r.user_id = $4::bigint

    UNION

    SELECT r.id
    FROM repositories r
    JOIN org_members om ON om.organization_id = r.org_id
    WHERE $4::bigint > 0
      AND om.user_id = $4::bigint
      AND om.role = 'owner'

    UNION

    SELECT tr.repository_id AS id
    FROM team_repos tr
    JOIN team_members tm ON tm.team_id = tr.team_id
    WHERE $4::bigint > 0
      AND tm.user_id = $4::bigint

    UNION

    SELECT c.repository_id AS id
    FROM collaborators c
    WHERE $4::bigint > 0
      AND c.user_id = $4::bigint
)
SELECT
    c.repository_id,
    r.name AS repository_name,
    COALESCE(u.username, o.name) AS owner_name,
    c.file_path,
    ts_headline(
      'simple',
      c.content,
      plainto_tsquery('simple', $1::text),
      'StartSel=<em>,StopSel=</em>,MaxFragments=1,MaxWords=20,MinWords=5'
    ) AS snippet,
    ts_rank(c.search_vector, plainto_tsquery('simple', $1::text)) AS rank
FROM code_search_documents c
JOIN repositories r ON r.id = c.repository_id
JOIN visible_repositories vr ON vr.id = r.id
LEFT JOIN users u ON u.id = r.user_id
LEFT JOIN organizations o ON o.id = r.org_id
WHERE c.search_vector @@ plainto_tsquery('simple', $1::text)
ORDER BY rank DESC, c.repository_id DESC, c.file_path ASC
LIMIT $3::int
OFFSET $2::int`;

export interface SearchCodeFTSArgs {
    query: string;
    pageOffset: number;
    pageSize: number;
    viewerId: string;
}

export interface SearchCodeFTSRow {
    repositoryId: string;
    repositoryName: string;
    ownerName: string;
    filePath: string;
    snippet: any;
    rank: string;
}

export async function searchCodeFTS(sql: Sql, args: SearchCodeFTSArgs): Promise<SearchCodeFTSRow[]> {
    return (await sql.unsafe(searchCodeFTSQuery, [args.query, args.pageOffset, args.pageSize, args.viewerId]).values()).map(row => ({
        repositoryId: row[0],
        repositoryName: row[1],
        ownerName: row[2],
        filePath: row[3],
        snippet: row[4],
        rank: row[5]
    }));
}

export const countSearchCodeFTSQuery = `-- name: CountSearchCodeFTS :one
WITH visible_repositories AS (
    SELECT r.id
    FROM repositories r
    WHERE r.is_public = TRUE

    UNION

    SELECT r.id
    FROM repositories r
    WHERE $2::bigint > 0
      AND r.user_id = $2::bigint

    UNION

    SELECT r.id
    FROM repositories r
    JOIN org_members om ON om.organization_id = r.org_id
    WHERE $2::bigint > 0
      AND om.user_id = $2::bigint
      AND om.role = 'owner'

    UNION

    SELECT tr.repository_id AS id
    FROM team_repos tr
    JOIN team_members tm ON tm.team_id = tr.team_id
    WHERE $2::bigint > 0
      AND tm.user_id = $2::bigint

    UNION

    SELECT c.repository_id AS id
    FROM collaborators c
    WHERE $2::bigint > 0
      AND c.user_id = $2::bigint
)
SELECT COUNT(*)
FROM code_search_documents c
JOIN repositories r ON r.id = c.repository_id
JOIN visible_repositories vr ON vr.id = r.id
WHERE c.search_vector @@ plainto_tsquery('simple', $1::text)`;

export interface CountSearchCodeFTSArgs {
    query: string;
    viewerId: string;
}

export interface CountSearchCodeFTSRow {
    count: string;
}

export async function countSearchCodeFTS(sql: Sql, args: CountSearchCodeFTSArgs): Promise<CountSearchCodeFTSRow | null> {
    const rows = await sql.unsafe(countSearchCodeFTSQuery, [args.query, args.viewerId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const upsertCodeSearchDocumentQuery = `-- name: UpsertCodeSearchDocument :one
INSERT INTO code_search_documents (
    repository_id,
    file_path,
    content
) VALUES (
    $1::bigint,
    $2::text,
    $3::text
)
ON CONFLICT (repository_id, file_path) DO UPDATE SET
    content = EXCLUDED.content,
    updated_at = NOW()
RETURNING
    id,
    repository_id,
    file_path,
    content,
    search_vector::text AS search_vector,
    created_at,
    updated_at`;

export interface UpsertCodeSearchDocumentArgs {
    repositoryId: string;
    filePath: string;
    content: string;
}

export interface UpsertCodeSearchDocumentRow {
    id: string;
    repositoryId: string;
    filePath: string;
    content: string;
    searchVector: string;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertCodeSearchDocument(sql: Sql, args: UpsertCodeSearchDocumentArgs): Promise<UpsertCodeSearchDocumentRow | null> {
    const rows = await sql.unsafe(upsertCodeSearchDocumentQuery, [args.repositoryId, args.filePath, args.content]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        repositoryId: row[1],
        filePath: row[2],
        content: row[3],
        searchVector: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const deleteCodeSearchDocumentsByRepoQuery = `-- name: DeleteCodeSearchDocumentsByRepo :execrows
DELETE FROM code_search_documents
WHERE repository_id = $1::bigint`;

export interface DeleteCodeSearchDocumentsByRepoArgs {
    repositoryId: string;
}

export const searchUsersFTSQuery = `-- name: SearchUsersFTS :many
SELECT
    u.id,
    u.username,
    u.display_name,
    u.avatar_url,
    u.bio,
    u.created_at,
    u.updated_at,
    ts_rank(u.search_vector, to_tsquery('simple', $1::text || ':*')) AS rank
FROM users u
WHERE u.is_active = TRUE
  AND u.search_vector @@ to_tsquery('simple', $1::text || ':*')
ORDER BY rank DESC, u.id ASC
LIMIT $3::int
OFFSET $2::int`;

export interface SearchUsersFTSArgs {
    query: string;
    pageOffset: number;
    pageSize: number;
}

export interface SearchUsersFTSRow {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    bio: string;
    createdAt: Date;
    updatedAt: Date;
    rank: string;
}

export async function searchUsersFTS(sql: Sql, args: SearchUsersFTSArgs): Promise<SearchUsersFTSRow[]> {
    return (await sql.unsafe(searchUsersFTSQuery, [args.query, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        username: row[1],
        displayName: row[2],
        avatarUrl: row[3],
        bio: row[4],
        createdAt: row[5],
        updatedAt: row[6],
        rank: row[7]
    }));
}

export const countSearchUsersFTSQuery = `-- name: CountSearchUsersFTS :one
SELECT COUNT(*)
FROM users
WHERE is_active = TRUE
  AND search_vector @@ to_tsquery('simple', $1::text || ':*')`;

export interface CountSearchUsersFTSArgs {
    query: string;
}

export interface CountSearchUsersFTSRow {
    count: string;
}

export async function countSearchUsersFTS(sql: Sql, args: CountSearchUsersFTSArgs): Promise<CountSearchUsersFTSRow | null> {
    const rows = await sql.unsafe(countSearchUsersFTSQuery, [args.query]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

