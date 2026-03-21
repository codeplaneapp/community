import { Sql } from "postgres";

export const addWhitelistEntryQuery = `-- name: AddWhitelistEntry :one
INSERT INTO alpha_whitelist_entries (
    identity_type,
    identity_value,
    lower_identity_value,
    created_by
)
VALUES (
    $1,
    $2,
    $3,
    $4
)
ON CONFLICT (identity_type, lower_identity_value)
DO UPDATE SET
    identity_value = EXCLUDED.identity_value,
    created_by = EXCLUDED.created_by,
    updated_at = NOW()
RETURNING id, identity_type, identity_value, lower_identity_value, created_by, created_at, updated_at`;

export interface AddWhitelistEntryArgs {
    identityType: string;
    identityValue: string;
    lowerIdentityValue: string;
    createdBy: string | null;
}

export interface AddWhitelistEntryRow {
    id: string;
    identityType: string;
    identityValue: string;
    lowerIdentityValue: string;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function addWhitelistEntry(sql: Sql, args: AddWhitelistEntryArgs): Promise<AddWhitelistEntryRow | null> {
    const rows = await sql.unsafe(addWhitelistEntryQuery, [args.identityType, args.identityValue, args.lowerIdentityValue, args.createdBy]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        identityType: row[1],
        identityValue: row[2],
        lowerIdentityValue: row[3],
        createdBy: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    };
}

export const removeWhitelistEntryQuery = `-- name: RemoveWhitelistEntry :execrows
DELETE FROM alpha_whitelist_entries
WHERE identity_type = $1
  AND lower_identity_value = $2`;

export interface RemoveWhitelistEntryArgs {
    identityType: string;
    lowerIdentityValue: string;
}

export const listWhitelistEntriesQuery = `-- name: ListWhitelistEntries :many
SELECT id, identity_type, identity_value, lower_identity_value, created_by, created_at, updated_at
FROM alpha_whitelist_entries
ORDER BY created_at DESC`;

export interface ListWhitelistEntriesRow {
    id: string;
    identityType: string;
    identityValue: string;
    lowerIdentityValue: string;
    createdBy: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWhitelistEntries(sql: Sql): Promise<ListWhitelistEntriesRow[]> {
    return (await sql.unsafe(listWhitelistEntriesQuery, []).values()).map(row => ({
        id: row[0],
        identityType: row[1],
        identityValue: row[2],
        lowerIdentityValue: row[3],
        createdBy: row[4],
        createdAt: row[5],
        updatedAt: row[6]
    }));
}

export const isWhitelistedIdentityQuery = `-- name: IsWhitelistedIdentity :one
SELECT EXISTS (
    SELECT 1
    FROM alpha_whitelist_entries
    WHERE identity_type = $1
      AND lower_identity_value = $2
)`;

export interface IsWhitelistedIdentityArgs {
    identityType: string;
    lowerIdentityValue: string;
}

export interface IsWhitelistedIdentityRow {
    exists: boolean;
}

export async function isWhitelistedIdentity(sql: Sql, args: IsWhitelistedIdentityArgs): Promise<IsWhitelistedIdentityRow | null> {
    const rows = await sql.unsafe(isWhitelistedIdentityQuery, [args.identityType, args.lowerIdentityValue]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        exists: row[0]
    };
}

export const upsertWaitlistEntryQuery = `-- name: UpsertWaitlistEntry :one
INSERT INTO alpha_waitlist_entries (email, lower_email, note, source)
VALUES (
    $1,
    $2,
    $3,
    $4
)
ON CONFLICT (lower_email)
DO UPDATE SET
    email = EXCLUDED.email,
    note = CASE
        WHEN EXCLUDED.note = '' THEN alpha_waitlist_entries.note
        ELSE EXCLUDED.note
    END,
    source = EXCLUDED.source,
    status = CASE
        WHEN alpha_waitlist_entries.status = 'approved' THEN alpha_waitlist_entries.status
        ELSE 'pending'
    END,
    approved_by = CASE
        WHEN alpha_waitlist_entries.status = 'approved' THEN alpha_waitlist_entries.approved_by
        ELSE NULL
    END,
    approved_at = CASE
        WHEN alpha_waitlist_entries.status = 'approved' THEN alpha_waitlist_entries.approved_at
        ELSE NULL
    END,
    updated_at = NOW()
RETURNING id, email, lower_email, note, status, source, approved_by, approved_at, created_at, updated_at`;

export interface UpsertWaitlistEntryArgs {
    email: string;
    lowerEmail: string;
    note: string;
    source: string;
}

export interface UpsertWaitlistEntryRow {
    id: string;
    email: string;
    lowerEmail: string;
    note: string;
    status: string;
    source: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertWaitlistEntry(sql: Sql, args: UpsertWaitlistEntryArgs): Promise<UpsertWaitlistEntryRow | null> {
    const rows = await sql.unsafe(upsertWaitlistEntryQuery, [args.email, args.lowerEmail, args.note, args.source]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        email: row[1],
        lowerEmail: row[2],
        note: row[3],
        status: row[4],
        source: row[5],
        approvedBy: row[6],
        approvedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const getWaitlistEntryByLowerEmailQuery = `-- name: GetWaitlistEntryByLowerEmail :one
SELECT id, email, lower_email, note, status, source, approved_by, approved_at, created_at, updated_at
FROM alpha_waitlist_entries
WHERE lower_email = $1`;

export interface GetWaitlistEntryByLowerEmailArgs {
    lowerEmail: string;
}

export interface GetWaitlistEntryByLowerEmailRow {
    id: string;
    email: string;
    lowerEmail: string;
    note: string;
    status: string;
    source: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function getWaitlistEntryByLowerEmail(sql: Sql, args: GetWaitlistEntryByLowerEmailArgs): Promise<GetWaitlistEntryByLowerEmailRow | null> {
    const rows = await sql.unsafe(getWaitlistEntryByLowerEmailQuery, [args.lowerEmail]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        email: row[1],
        lowerEmail: row[2],
        note: row[3],
        status: row[4],
        source: row[5],
        approvedBy: row[6],
        approvedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

export const listWaitlistEntriesQuery = `-- name: ListWaitlistEntries :many
SELECT id, email, lower_email, note, status, source, approved_by, approved_at, created_at, updated_at
FROM alpha_waitlist_entries
WHERE (
    $1::text = ''
    OR status = $1
)
ORDER BY created_at DESC
LIMIT $3
OFFSET $2`;

export interface ListWaitlistEntriesArgs {
    statusFilter: string;
    pageOffset: string;
    pageSize: string;
}

export interface ListWaitlistEntriesRow {
    id: string;
    email: string;
    lowerEmail: string;
    note: string;
    status: string;
    source: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function listWaitlistEntries(sql: Sql, args: ListWaitlistEntriesArgs): Promise<ListWaitlistEntriesRow[]> {
    return (await sql.unsafe(listWaitlistEntriesQuery, [args.statusFilter, args.pageOffset, args.pageSize]).values()).map(row => ({
        id: row[0],
        email: row[1],
        lowerEmail: row[2],
        note: row[3],
        status: row[4],
        source: row[5],
        approvedBy: row[6],
        approvedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const countWaitlistEntriesQuery = `-- name: CountWaitlistEntries :one
SELECT COUNT(*)
FROM alpha_waitlist_entries
WHERE (
    $1::text = ''
    OR status = $1
)`;

export interface CountWaitlistEntriesArgs {
    statusFilter: string;
}

export interface CountWaitlistEntriesRow {
    count: string;
}

export async function countWaitlistEntries(sql: Sql, args: CountWaitlistEntriesArgs): Promise<CountWaitlistEntriesRow | null> {
    const rows = await sql.unsafe(countWaitlistEntriesQuery, [args.statusFilter]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        count: row[0]
    };
}

export const approveWaitlistEntryByLowerEmailQuery = `-- name: ApproveWaitlistEntryByLowerEmail :one
UPDATE alpha_waitlist_entries
SET status = 'approved',
    approved_by = $1,
    approved_at = NOW(),
    updated_at = NOW()
WHERE lower_email = $2
RETURNING id, email, lower_email, note, status, source, approved_by, approved_at, created_at, updated_at`;

export interface ApproveWaitlistEntryByLowerEmailArgs {
    approvedBy: string | null;
    lowerEmail: string;
}

export interface ApproveWaitlistEntryByLowerEmailRow {
    id: string;
    email: string;
    lowerEmail: string;
    note: string;
    status: string;
    source: string;
    approvedBy: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export async function approveWaitlistEntryByLowerEmail(sql: Sql, args: ApproveWaitlistEntryByLowerEmailArgs): Promise<ApproveWaitlistEntryByLowerEmailRow | null> {
    const rows = await sql.unsafe(approveWaitlistEntryByLowerEmailQuery, [args.approvedBy, args.lowerEmail]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        email: row[1],
        lowerEmail: row[2],
        note: row[3],
        status: row[4],
        source: row[5],
        approvedBy: row[6],
        approvedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

