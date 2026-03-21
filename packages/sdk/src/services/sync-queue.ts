/**
 * SyncQueue — manages the _sync_queue table for local-first daemon mode.
 *
 * When the daemon is offline, writes go to local PGLite AND the sync queue.
 * On reconnect, the queue is flushed by replaying API calls to the remote
 * JJHub server. Handles ID remapping (local UUID -> server-assigned ID) and
 * conflict detection (server 409 -> mark as conflict).
 */

import type { Sql } from "postgres";

import { IdRemapService } from "./id-remap";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncQueueStatus = "pending" | "synced" | "conflict" | "failed";

export interface SyncQueueItem {
  id: string;
  method: string;
  path: string;
  body: unknown | null;
  localId: string | null;
  remoteId: string | null;
  status: SyncQueueStatus;
  errorMessage: string;
  createdAt: Date;
  syncedAt: Date | null;
}

export interface EnqueueOptions {
  /** Local UUID to track for ID remapping after server sync. */
  localId?: string;
}

export interface FlushResult {
  total: number;
  synced: number;
  conflicts: number;
  failed: number;
}

/** Function that performs the actual HTTP call to the remote. */
export type RemoteCaller = (
  method: string,
  path: string,
  body: unknown | null,
) => Promise<{ status: number; body: unknown }>;

// ---------------------------------------------------------------------------
// Schema bootstrap — ensures _sync_queue exists in the local PGLite
// ---------------------------------------------------------------------------

const SYNC_QUEUE_DDL = `
CREATE TABLE IF NOT EXISTS _sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method VARCHAR(8) NOT NULL,
    path TEXT NOT NULL,
    body JSONB,
    local_id TEXT,
    remote_id TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'conflict', 'failed')),
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON _sync_queue (status, created_at);
`;

// ---------------------------------------------------------------------------
// SyncQueue class
// ---------------------------------------------------------------------------

export class SyncQueue {
  private sql: Sql;
  private initialized = false;
  private remapper: IdRemapService;

  constructor(sql: Sql) {
    this.sql = sql;
    this.remapper = new IdRemapService(sql);
  }

  /**
   * Get the underlying IdRemapService for direct access.
   */
  getRemapper(): IdRemapService {
    return this.remapper;
  }

  /**
   * Ensure the _sync_queue table exists. Idempotent.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.sql.unsafe(SYNC_QUEUE_DDL);
    await this.remapper.init();
    this.initialized = true;
  }

  /**
   * Add an operation to the sync queue.
   */
  async enqueue(
    method: string,
    path: string,
    body: unknown | null,
    opts?: EnqueueOptions,
  ): Promise<SyncQueueItem> {
    await this.init();

    const bodyJson = body != null ? JSON.stringify(body) : null;
    const localId = opts?.localId ?? null;

    const rows = await this.sql.unsafe(
      `INSERT INTO _sync_queue (method, path, body, local_id, status)
       VALUES ($1, $2, $3::jsonb, $4, 'pending')
       RETURNING id, method, path, body, local_id, remote_id, status, error_message, created_at, synced_at`,
      [method, path, bodyJson, localId],
    );

    return rowToItem(rows[0]!);
  }

  /**
   * Flush all pending items by replaying them against the remote API.
   *
   * Items are processed in FIFO order (oldest first). Each item is attempted
   * once per flush call. On 409 Conflict the item is marked as conflict.
   * On other errors (network, 5xx) the item is marked as failed with the
   * error message preserved for debugging.
   */
  async flush(caller: RemoteCaller): Promise<FlushResult> {
    await this.init();

    const pending = await this.getPending();
    const result: FlushResult = {
      total: pending.length,
      synced: 0,
      conflicts: 0,
      failed: 0,
    };

    for (const item of pending) {
      try {
        // Resolve any local IDs in the path and body before sending.
        // This handles cross-references: e.g. a comment referencing a
        // locally-created issue whose server ID is now known.
        const resolved = await this.remapper.resolveBodyAndPath(
          item.path,
          item.body,
        );

        const response = await caller(
          item.method,
          resolved.path,
          resolved.body,
        );

        if (response.status >= 200 && response.status < 300) {
          // Extract server-assigned ID for remapping if the response has one
          let remoteId: string | null = null;
          if (
            response.body &&
            typeof response.body === "object" &&
            "id" in response.body
          ) {
            remoteId = String((response.body as Record<string, unknown>).id);
          }

          // If this queue item tracked a local ID and the server returned a
          // remote ID, cascade the remap across all local tables and rewrite
          // any remaining pending queue items that reference this local ID.
          if (item.localId && remoteId) {
            await this.remapper.remapAfterSync(item.localId, remoteId);
          }

          await this.markSynced(item.id, remoteId);
          result.synced++;
        } else if (response.status === 409) {
          const errorMsg =
            response.body &&
            typeof response.body === "object" &&
            "message" in response.body
              ? String((response.body as Record<string, unknown>).message)
              : "conflict";
          await this.markConflict(item.id, errorMsg);
          result.conflicts++;
        } else {
          const errorMsg =
            response.body &&
            typeof response.body === "object" &&
            "message" in response.body
              ? String((response.body as Record<string, unknown>).message)
              : `HTTP ${response.status}`;
          await this.markFailed(item.id, errorMsg);
          result.failed++;
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "unknown network error";
        await this.markFailed(item.id, errorMsg);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Mark an item as successfully synced.
   */
  async markSynced(id: string, remoteId?: string | null): Promise<void> {
    await this.init();
    await this.sql.unsafe(
      `UPDATE _sync_queue
       SET status = 'synced', remote_id = COALESCE($2, remote_id), synced_at = NOW()
       WHERE id = $1`,
      [id, remoteId ?? null],
    );
  }

  /**
   * Mark an item as a conflict (server returned 409).
   */
  async markConflict(id: string, errorMessage?: string): Promise<void> {
    await this.init();
    await this.sql.unsafe(
      `UPDATE _sync_queue
       SET status = 'conflict', error_message = $2
       WHERE id = $1`,
      [id, errorMessage ?? ""],
    );
  }

  /**
   * Mark an item as failed (network error, server 5xx, etc.).
   */
  async markFailed(id: string, errorMessage?: string): Promise<void> {
    await this.init();
    await this.sql.unsafe(
      `UPDATE _sync_queue
       SET status = 'failed', error_message = $2
       WHERE id = $1`,
      [id, errorMessage ?? ""],
    );
  }

  /**
   * Get all pending items in FIFO order.
   */
  async getPending(): Promise<SyncQueueItem[]> {
    await this.init();
    const rows = await this.sql.unsafe(
      `SELECT id, method, path, body, local_id, remote_id, status, error_message, created_at, synced_at
       FROM _sync_queue
       WHERE status = 'pending'
       ORDER BY created_at ASC`,
    );
    return rows.map(rowToItem);
  }

  /**
   * Get all conflict items.
   */
  async getConflicts(): Promise<SyncQueueItem[]> {
    await this.init();
    const rows = await this.sql.unsafe(
      `SELECT id, method, path, body, local_id, remote_id, status, error_message, created_at, synced_at
       FROM _sync_queue
       WHERE status = 'conflict'
       ORDER BY created_at ASC`,
    );
    return rows.map(rowToItem);
  }

  /**
   * Get the count of pending items.
   */
  async getPendingCount(): Promise<number> {
    await this.init();
    const rows = await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM _sync_queue WHERE status = 'pending'`,
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Get the count of conflict items.
   */
  async getConflictCount(): Promise<number> {
    await this.init();
    const rows = await this.sql.unsafe(
      `SELECT COUNT(*)::int AS count FROM _sync_queue WHERE status = 'conflict'`,
    );
    return rows[0]?.count ?? 0;
  }

  /**
   * Retry all failed items by resetting them to pending.
   */
  async retryFailed(): Promise<number> {
    await this.init();
    const rows = await this.sql.unsafe(
      `UPDATE _sync_queue
       SET status = 'pending', error_message = ''
       WHERE status = 'failed'
       RETURNING id`,
    );
    return rows.length;
  }

  /**
   * Resolve a conflict by discarding the local item.
   */
  async discardConflict(id: string): Promise<void> {
    await this.init();
    await this.sql.unsafe(`DELETE FROM _sync_queue WHERE id = $1`, [id]);
  }

  /**
   * Purge synced items older than the given age (in seconds).
   */
  async purgeSynced(olderThanSeconds: number = 86400): Promise<number> {
    await this.init();
    const rows = await this.sql.unsafe(
      `DELETE FROM _sync_queue
       WHERE status = 'synced' AND synced_at < NOW() - INTERVAL '1 second' * $1
       RETURNING id`,
      [olderThanSeconds],
    );
    return rows.length;
  }

  /**
   * Look up the remote ID for a local ID (after sync).
   * Used for ID remapping in the local database.
   */
  async getRemoteIdForLocalId(localId: string): Promise<string | null> {
    await this.init();
    const rows = await this.sql.unsafe(
      `SELECT remote_id FROM _sync_queue
       WHERE local_id = $1 AND status = 'synced' AND remote_id IS NOT NULL
       ORDER BY synced_at DESC
       LIMIT 1`,
      [localId],
    );
    return rows[0]?.remote_id ?? null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToItem(row: Record<string, unknown>): SyncQueueItem {
  return {
    id: String(row.id),
    method: String(row.method),
    path: String(row.path),
    body: row.body ?? null,
    localId: row.local_id != null ? String(row.local_id) : null,
    remoteId: row.remote_id != null ? String(row.remote_id) : null,
    status: String(row.status) as SyncQueueStatus,
    errorMessage: String(row.error_message ?? ""),
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at)),
    syncedAt:
      row.synced_at != null
        ? row.synced_at instanceof Date
          ? row.synced_at
          : new Date(String(row.synced_at))
        : null,
  };
}
