import { Sql } from "postgres";

export const createReleaseAssetQuery = `-- name: CreateReleaseAsset :one
WITH next_asset AS (
    SELECT nextval(pg_get_serial_sequence('release_assets', 'id')) AS id
)
INSERT INTO release_assets (
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type
)
SELECT
    next_asset.id,
    $1,
    $2,
    $3,
    $4,
    0,
    'pending',
    format(
        'repos/%s/releases/%s/assets/%s/%s',
        $5::text,
        $1::text,
        next_asset.id::text,
        $3
    ),
    $6
FROM next_asset
RETURNING
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type,
    confirmed_at,
    created_at,
    updated_at`;

export interface CreateReleaseAssetArgs {
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    repositoryId: string;
    contentType: string;
}

export interface CreateReleaseAssetRow {
    id: string;
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    downloadCount: string;
    status: string;
    gcsKey: string;
    contentType: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function createReleaseAsset(sql: Sql, args: CreateReleaseAssetArgs): Promise<CreateReleaseAssetRow | null> {
    const rows = await sql.unsafe(createReleaseAssetQuery, [args.releaseId, args.uploaderId, args.name, args.size, args.repositoryId, args.contentType]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        releaseId: row[1],
        uploaderId: row[2],
        name: row[3],
        size: row[4],
        downloadCount: row[5],
        status: row[6],
        gcsKey: row[7],
        contentType: row[8],
        confirmedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const getReleaseAssetByIDQuery = `-- name: GetReleaseAssetByID :one
SELECT
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type,
    confirmed_at,
    created_at,
    updated_at
FROM release_assets
WHERE release_id = $1
  AND id = $2`;

export interface GetReleaseAssetByIDArgs {
    releaseId: string;
    id: string;
}

export interface GetReleaseAssetByIDRow {
    id: string;
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    downloadCount: string;
    status: string;
    gcsKey: string;
    contentType: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getReleaseAssetByID(sql: Sql, args: GetReleaseAssetByIDArgs): Promise<GetReleaseAssetByIDRow | null> {
    const rows = await sql.unsafe(getReleaseAssetByIDQuery, [args.releaseId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        releaseId: row[1],
        uploaderId: row[2],
        name: row[3],
        size: row[4],
        downloadCount: row[5],
        status: row[6],
        gcsKey: row[7],
        contentType: row[8],
        confirmedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const listReleaseAssetsQuery = `-- name: ListReleaseAssets :many
SELECT
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type,
    confirmed_at,
    created_at,
    updated_at
FROM release_assets
WHERE release_id = $1
ORDER BY created_at DESC, id DESC`;

export interface ListReleaseAssetsArgs {
    releaseId: string;
}

export interface ListReleaseAssetsRow {
    id: string;
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    downloadCount: string;
    status: string;
    gcsKey: string;
    contentType: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listReleaseAssets(sql: Sql, args: ListReleaseAssetsArgs): Promise<ListReleaseAssetsRow[]> {
    return (await sql.unsafe(listReleaseAssetsQuery, [args.releaseId]).values()).map(row => ({
        id: row[0],
        releaseId: row[1],
        uploaderId: row[2],
        name: row[3],
        size: row[4],
        downloadCount: row[5],
        status: row[6],
        gcsKey: row[7],
        contentType: row[8],
        confirmedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    }));
}

export const countReleaseAssetsQuery = `-- name: CountReleaseAssets :one
SELECT COUNT(*)
FROM release_assets
WHERE release_id = $1`;

export interface CountReleaseAssetsArgs {
    releaseId: string;
}

export interface CountReleaseAssetsRow {
    count: string;
}

export async function countReleaseAssets(sql: Sql, args: CountReleaseAssetsArgs): Promise<CountReleaseAssetsRow | null> {
    const rows = await sql.unsafe(countReleaseAssetsQuery, [args.releaseId]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const updateReleaseAssetQuery = `-- name: UpdateReleaseAsset :one
UPDATE release_assets
SET name = $1,
    updated_at = NOW()
WHERE release_id = $2
  AND id = $3
RETURNING
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type,
    confirmed_at,
    created_at,
    updated_at`;

export interface UpdateReleaseAssetArgs {
    name: string;
    releaseId: string;
    id: string;
}

export interface UpdateReleaseAssetRow {
    id: string;
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    downloadCount: string;
    status: string;
    gcsKey: string;
    contentType: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function updateReleaseAsset(sql: Sql, args: UpdateReleaseAssetArgs): Promise<UpdateReleaseAssetRow | null> {
    const rows = await sql.unsafe(updateReleaseAssetQuery, [args.name, args.releaseId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        releaseId: row[1],
        uploaderId: row[2],
        name: row[3],
        size: row[4],
        downloadCount: row[5],
        status: row[6],
        gcsKey: row[7],
        contentType: row[8],
        confirmedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const confirmReleaseAssetUploadQuery = `-- name: ConfirmReleaseAssetUpload :one
UPDATE release_assets
SET status = 'ready',
    confirmed_at = COALESCE(confirmed_at, NOW()),
    updated_at = NOW()
WHERE release_id = $1
  AND id = $2
RETURNING
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type,
    confirmed_at,
    created_at,
    updated_at`;

export interface ConfirmReleaseAssetUploadArgs {
    releaseId: string;
    id: string;
}

export interface ConfirmReleaseAssetUploadRow {
    id: string;
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    downloadCount: string;
    status: string;
    gcsKey: string;
    contentType: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function confirmReleaseAssetUpload(sql: Sql, args: ConfirmReleaseAssetUploadArgs): Promise<ConfirmReleaseAssetUploadRow | null> {
    const rows = await sql.unsafe(confirmReleaseAssetUploadQuery, [args.releaseId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        releaseId: row[1],
        uploaderId: row[2],
        name: row[3],
        size: row[4],
        downloadCount: row[5],
        status: row[6],
        gcsKey: row[7],
        contentType: row[8],
        confirmedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

export const incrementReleaseAssetDownloadCountQuery = `-- name: IncrementReleaseAssetDownloadCount :exec
UPDATE release_assets
SET download_count = download_count + 1,
    updated_at = NOW()
WHERE release_id = $1
  AND id = $2`;

export interface IncrementReleaseAssetDownloadCountArgs {
    releaseId: string;
    id: string;
}

export async function incrementReleaseAssetDownloadCount(sql: Sql, args: IncrementReleaseAssetDownloadCountArgs): Promise<void> {
    await sql.unsafe(incrementReleaseAssetDownloadCountQuery, [args.releaseId, args.id]);
}

export const deleteReleaseAssetQuery = `-- name: DeleteReleaseAsset :one
DELETE FROM release_assets
WHERE release_id = $1
  AND id = $2
RETURNING
    id,
    release_id,
    uploader_id,
    name,
    size,
    download_count,
    status,
    gcs_key,
    content_type,
    confirmed_at,
    created_at,
    updated_at`;

export interface DeleteReleaseAssetArgs {
    releaseId: string;
    id: string;
}

export interface DeleteReleaseAssetRow {
    id: string;
    releaseId: string;
    uploaderId: string;
    name: string;
    size: string;
    downloadCount: string;
    status: string;
    gcsKey: string;
    contentType: string;
    confirmedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function deleteReleaseAsset(sql: Sql, args: DeleteReleaseAssetArgs): Promise<DeleteReleaseAssetRow | null> {
    const rows = await sql.unsafe(deleteReleaseAssetQuery, [args.releaseId, args.id]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        releaseId: row[1],
        uploaderId: row[2],
        name: row[3],
        size: row[4],
        downloadCount: row[5],
        status: row[6],
        gcsKey: row[7],
        contentType: row[8],
        confirmedAt: row[9],
        createdAt: row[10],
        updatedAt: row[11]
    };
}

