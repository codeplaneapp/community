/**
 * IdRemapService — temporary ID allocation and server ID remapping for
 * Codeplane's local-first sync engine.
 *
 * When a user creates resources offline (e.g. issues), they get local UUIDs
 * as temporary IDs. When synced, the server assigns real sequential IDs
 * (issue numbers, database bigints). This service:
 *
 *   1. Generates local UUIDs and tracks them in the _id_remap table.
 *   2. After sync, records the local_id → remote_id mapping.
 *   3. Cascades the remap across all local PGLite tables that reference the
 *      old local_id (issue_comments.issue_id, issue_labels.issue_id, etc.).
 *   4. Rewrites pending sync queue request bodies so later operations
 *      (e.g. adding a comment to a locally-created issue) use the
 *      server-assigned ID instead of the local UUID.
 */

import type { Sql } from "postgres";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RemapResourceType =
  | "issue"
  | "issue_comment"
  | "label"
  | "milestone"
  | "landing_request"
  | "repository";

export interface IdRemapEntry {
  localId: string;
  remoteId: string | null;
  resourceType: RemapResourceType;
  createdAt: Date;
  remappedAt: Date | null;
}

/**
 * Describes a column in a local table that references a remappable resource.
 * Used by the cascade remap to know which columns to update.
 */
interface RemapTarget {
  table: string;
  column: string;
}

// ---------------------------------------------------------------------------
// Schema bootstrap — ensures _id_remap exists in the local PGLite
// ---------------------------------------------------------------------------

const ID_REMAP_DDL = `
CREATE TABLE IF NOT EXISTS _id_remap (
    local_id TEXT PRIMARY KEY,
    remote_id TEXT,
    resource_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    remapped_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_id_remap_resource_type ON _id_remap (resource_type);
CREATE INDEX IF NOT EXISTS idx_id_remap_remote_id ON _id_remap (remote_id) WHERE remote_id IS NOT NULL;
`;

// ---------------------------------------------------------------------------
// Remap targets — tables and columns that need cascading updates
// ---------------------------------------------------------------------------

/**
 * Maps each resource type to the tables/columns that hold references to that
 * resource's ID. When a local UUID for that resource type is remapped to a
 * server ID, all these columns are updated.
 */
const REMAP_TARGETS: Record<RemapResourceType, RemapTarget[]> = {
  issue: [
    { table: "issues", column: "id" },
    { table: "issue_comments", column: "issue_id" },
    { table: "issue_labels", column: "issue_id" },
    { table: "issue_assignees", column: "issue_id" },
    { table: "issue_events", column: "issue_id" },
    { table: "issue_dependencies", column: "issue_id" },
    { table: "issue_dependencies", column: "depends_on_issue_id" },
    { table: "pinned_issues", column: "issue_id" },
    { table: "mentions", column: "issue_id" },
    { table: "issue_artifacts", column: "issue_id" },
  ],
  issue_comment: [
    { table: "issue_comments", column: "id" },
  ],
  label: [
    { table: "labels", column: "id" },
    { table: "issue_labels", column: "label_id" },
  ],
  milestone: [
    { table: "milestones", column: "id" },
    { table: "issues", column: "milestone_id" },
  ],
  landing_request: [
    { table: "landing_requests", column: "id" },
    { table: "landing_tasks", column: "landing_request_id" },
    { table: "mentions", column: "landing_request_id" },
  ],
  repository: [
    { table: "repositories", column: "id" },
  ],
};

// ---------------------------------------------------------------------------
// IdRemapService
// ---------------------------------------------------------------------------

export class IdRemapService {
  private sql: Sql;
  private initialized = false;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  /**
   * Ensure the _id_remap table exists. Idempotent.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    await this.sql.unsafe(ID_REMAP_DDL);
    this.initialized = true;
  }

  // -----------------------------------------------------------------------
  // Local ID generation
  // -----------------------------------------------------------------------

  /**
   * Generate a temporary local UUID for a new offline resource.
   * Stores the mapping in _id_remap so we know it needs remapping later.
   *
   * @returns The generated local UUID.
   */
  async allocateLocalId(resourceType: RemapResourceType): Promise<string> {
    await this.init();

    const rows = await this.sql.unsafe(
      `INSERT INTO _id_remap (local_id, resource_type)
       VALUES (gen_random_uuid()::text, $1)
       RETURNING local_id`,
      [resourceType],
    );

    return String(rows[0]!.local_id);
  }

  // -----------------------------------------------------------------------
  // Remap recording
  // -----------------------------------------------------------------------

  /**
   * Record a server-assigned ID for a previously-allocated local ID.
   * This does NOT cascade — call `cascadeRemap` after recording.
   */
  async recordRemoteId(localId: string, remoteId: string): Promise<void> {
    await this.init();

    await this.sql.unsafe(
      `UPDATE _id_remap
       SET remote_id = $2, remapped_at = NOW()
       WHERE local_id = $1`,
      [localId, remoteId],
    );
  }

  /**
   * Full remap lifecycle: record the remote ID, cascade updates across
   * all local tables, and rewrite pending sync queue items.
   */
  async remapAfterSync(localId: string, remoteId: string): Promise<void> {
    await this.recordRemoteId(localId, remoteId);

    // Look up the resource type
    const entry = await this.getEntry(localId);
    if (!entry) return;

    await this.cascadeRemap(localId, remoteId, entry.resourceType);
    await this.rewritePendingQueueBodies(localId, remoteId);
  }

  // -----------------------------------------------------------------------
  // Cascade remap — update all local tables referencing the old ID
  // -----------------------------------------------------------------------

  /**
   * Update all local PGLite tables that reference the old local_id,
   * replacing it with the server-assigned remote_id.
   */
  async cascadeRemap(
    localId: string,
    remoteId: string,
    resourceType: RemapResourceType,
  ): Promise<void> {
    await this.init();

    const targets = REMAP_TARGETS[resourceType] ?? [];
    if (targets.length === 0) return;

    // Run all updates inside a transaction for consistency
    await this.sql.unsafe("BEGIN");
    try {
      for (const target of targets) {
        await this.sql.unsafe(
          `UPDATE ${target.table}
           SET ${target.column} = $2
           WHERE ${target.column}::text = $1`,
          [localId, remoteId],
        );
      }
      await this.sql.unsafe("COMMIT");
    } catch (err) {
      await this.sql.unsafe("ROLLBACK");
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Cross-reference resolution — rewrite pending queue items
  // -----------------------------------------------------------------------

  /**
   * Rewrite any pending sync queue items whose request body references
   * the old local_id, replacing it with the server-assigned remote_id.
   * This ensures that e.g. a comment referencing a locally-created issue
   * uses the server-assigned issue ID when it gets flushed.
   */
  async rewritePendingQueueBodies(
    localId: string,
    remoteId: string,
  ): Promise<void> {
    await this.init();

    // Also rewrite the path — local IDs can appear in URL paths
    // e.g. /v1/repos/owner/repo/issues/{localId}/comments
    await this.sql.unsafe(
      `UPDATE _sync_queue
       SET path = REPLACE(path, $1, $2)
       WHERE status = 'pending' AND path LIKE '%' || $1 || '%'`,
      [localId, remoteId],
    );

    // Rewrite body JSONB — replace any string value matching the local ID
    // We use jsonb_each to find matching fields and rebuild
    await this.sql.unsafe(
      `UPDATE _sync_queue
       SET body = (
         SELECT jsonb_object_agg(
           key,
           CASE
             WHEN value #>> '{}' = $1 THEN to_jsonb($2::text)
             ELSE value
           END
         )
         FROM jsonb_each(body)
       )
       WHERE status = 'pending'
         AND body IS NOT NULL
         AND body::text LIKE '%' || $1 || '%'`,
      [localId, remoteId],
    );

    // Also update the local_id column on pending queue items that reference
    // this local ID (so the queue knows the mapping)
    await this.sql.unsafe(
      `UPDATE _sync_queue
       SET local_id = $1
       WHERE status = 'pending' AND local_id = $1`,
      [localId],
    );
  }

  /**
   * Resolve all known remappings in a request body object before sending.
   * Replaces any field value that matches a known local_id with its
   * remote_id. Also replaces local IDs found in the URL path.
   *
   * @returns The body with all known local IDs replaced, and the
   *          rewritten path.
   */
  async resolveBodyAndPath(
    path: string,
    body: unknown | null,
  ): Promise<{ path: string; body: unknown | null }> {
    await this.init();

    // Get all completed remappings
    const mappings = await this.sql.unsafe(
      `SELECT local_id, remote_id FROM _id_remap
       WHERE remote_id IS NOT NULL`,
    );

    if (mappings.length === 0) {
      return { path, body };
    }

    let resolvedPath = path;
    let resolvedBody = body;

    for (const row of mappings) {
      const localId = String(row.local_id);
      const remoteId = String(row.remote_id);

      // Replace in path
      if (resolvedPath.includes(localId)) {
        resolvedPath = resolvedPath.replaceAll(localId, remoteId);
      }

      // Replace in body
      if (resolvedBody != null && typeof resolvedBody === "object") {
        resolvedBody = replaceIdsInObject(
          resolvedBody as Record<string, unknown>,
          localId,
          remoteId,
        );
      }
    }

    return { path: resolvedPath, body: resolvedBody };
  }

  // -----------------------------------------------------------------------
  // Lookups
  // -----------------------------------------------------------------------

  /**
   * Look up a single remap entry by local ID.
   */
  async getEntry(localId: string): Promise<IdRemapEntry | null> {
    await this.init();

    const rows = await this.sql.unsafe(
      `SELECT local_id, remote_id, resource_type, created_at, remapped_at
       FROM _id_remap
       WHERE local_id = $1`,
      [localId],
    );

    if (rows.length === 0) return null;
    return rowToEntry(rows[0]!);
  }

  /**
   * Look up the remote ID for a given local ID.
   * Returns null if not yet remapped or unknown.
   */
  async getRemoteId(localId: string): Promise<string | null> {
    await this.init();

    const rows = await this.sql.unsafe(
      `SELECT remote_id FROM _id_remap
       WHERE local_id = $1 AND remote_id IS NOT NULL`,
      [localId],
    );

    return rows[0]?.remote_id != null ? String(rows[0].remote_id) : null;
  }

  /**
   * Look up the local ID for a given remote ID (reverse lookup).
   */
  async getLocalId(remoteId: string): Promise<string | null> {
    await this.init();

    const rows = await this.sql.unsafe(
      `SELECT local_id FROM _id_remap
       WHERE remote_id = $1`,
      [remoteId],
    );

    return rows[0]?.local_id != null ? String(rows[0].local_id) : null;
  }

  /**
   * Check whether a given ID is a known local temporary ID.
   */
  async isLocalId(id: string): Promise<boolean> {
    await this.init();

    const rows = await this.sql.unsafe(
      `SELECT 1 FROM _id_remap WHERE local_id = $1 LIMIT 1`,
      [id],
    );

    return rows.length > 0;
  }

  /**
   * Get all pending (un-remapped) entries.
   */
  async getPendingRemaps(): Promise<IdRemapEntry[]> {
    await this.init();

    const rows = await this.sql.unsafe(
      `SELECT local_id, remote_id, resource_type, created_at, remapped_at
       FROM _id_remap
       WHERE remote_id IS NULL
       ORDER BY created_at ASC`,
    );

    return rows.map(rowToEntry);
  }

  /**
   * Get all completed remappings.
   */
  async getCompletedRemaps(): Promise<IdRemapEntry[]> {
    await this.init();

    const rows = await this.sql.unsafe(
      `SELECT local_id, remote_id, resource_type, created_at, remapped_at
       FROM _id_remap
       WHERE remote_id IS NOT NULL
       ORDER BY remapped_at DESC`,
    );

    return rows.map(rowToEntry);
  }

  /**
   * Purge completed remaps older than the given age (in seconds).
   * Old remaps are safe to purge once all sync queue items referencing
   * them have been flushed.
   */
  async purgeCompleted(olderThanSeconds: number = 86400): Promise<number> {
    await this.init();

    const rows = await this.sql.unsafe(
      `DELETE FROM _id_remap
       WHERE remote_id IS NOT NULL
         AND remapped_at < NOW() - INTERVAL '1 second' * $1
       RETURNING local_id`,
      [olderThanSeconds],
    );

    return rows.length;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToEntry(row: Record<string, unknown>): IdRemapEntry {
  return {
    localId: String(row.local_id),
    remoteId: row.remote_id != null ? String(row.remote_id) : null,
    resourceType: String(row.resource_type) as RemapResourceType,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(String(row.created_at)),
    remappedAt:
      row.remapped_at != null
        ? row.remapped_at instanceof Date
          ? row.remapped_at
          : new Date(String(row.remapped_at))
        : null,
  };
}

/**
 * Recursively replace all string values matching `localId` with `remoteId`
 * in a plain object or array.
 */
function replaceIdsInObject(
  obj: Record<string, unknown>,
  localId: string,
  remoteId: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string" && value === localId) {
      result[key] = remoteId;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === "string" && item === localId) return remoteId;
        if (item != null && typeof item === "object") {
          return replaceIdsInObject(
            item as Record<string, unknown>,
            localId,
            remoteId,
          );
        }
        return item;
      });
    } else if (value != null && typeof value === "object") {
      result[key] = replaceIdsInObject(
        value as Record<string, unknown>,
        localId,
        remoteId,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
