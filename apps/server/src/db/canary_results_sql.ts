import { Sql } from "postgres";

export const listCanaryResultsQuery = `-- name: ListCanaryResults :many
SELECT id, suite, test_name, status, duration_seconds, error_message, run_id, reported_at, created_at, updated_at
FROM canary_results
ORDER BY suite ASC, test_name ASC`;

export interface ListCanaryResultsRow {
    id: string;
    suite: string;
    testName: string;
    status: string;
    durationSeconds: number;
    errorMessage: string;
    runId: string;
    reportedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function listCanaryResults(sql: Sql): Promise<ListCanaryResultsRow[]> {
    return (await sql.unsafe(listCanaryResultsQuery, []).values()).map(row => ({
        id: row[0],
        suite: row[1],
        testName: row[2],
        status: row[3],
        durationSeconds: row[4],
        errorMessage: row[5],
        runId: row[6],
        reportedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    }));
}

export const upsertCanaryResultQuery = `-- name: UpsertCanaryResult :one
INSERT INTO canary_results (
    suite,
    test_name,
    status,
    duration_seconds,
    error_message,
    run_id,
    reported_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (suite, test_name)
DO UPDATE SET
    status = EXCLUDED.status,
    duration_seconds = EXCLUDED.duration_seconds,
    error_message = EXCLUDED.error_message,
    run_id = EXCLUDED.run_id,
    reported_at = EXCLUDED.reported_at,
    updated_at = NOW()
RETURNING id, suite, test_name, status, duration_seconds, error_message, run_id, reported_at, created_at, updated_at`;

export interface UpsertCanaryResultArgs {
    suite: string;
    testName: string;
    status: string;
    durationSeconds: number;
    errorMessage: string;
    runId: string;
    reportedAt: Date;
}

export interface UpsertCanaryResultRow {
    id: string;
    suite: string;
    testName: string;
    status: string;
    durationSeconds: number;
    errorMessage: string;
    runId: string;
    reportedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export async function upsertCanaryResult(sql: Sql, args: UpsertCanaryResultArgs): Promise<UpsertCanaryResultRow | null> {
    const rows = await sql.unsafe(upsertCanaryResultQuery, [args.suite, args.testName, args.status, args.durationSeconds, args.errorMessage, args.runId, args.reportedAt]).values();
    if (rows.length !== 1) {
        return null;
    }
    const row = rows[0];
    return {
        id: row[0],
        suite: row[1],
        testName: row[2],
        status: row[3],
        durationSeconds: row[4],
        errorMessage: row[5],
        runId: row[6],
        reportedAt: row[7],
        createdAt: row[8],
        updatedAt: row[9]
    };
}

