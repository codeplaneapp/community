/**
 * Daemon management routes — internal endpoints for the local-first daemon.
 *
 * These are only active when the server is running in PGLite (daemon) mode.
 * They expose sync status, conflict management, and remote connection
 * configuration to the CLI's `codeplane daemon` subcommands.
 *
 * Routes:
 *   GET    /api/daemon/status               — full daemon status
 *   POST   /api/daemon/sync                 — force sync now
 *   GET    /api/daemon/conflicts            — list sync conflicts
 *   POST   /api/daemon/conflicts/:id/resolve — resolve (discard) a conflict
 *   POST   /api/daemon/conflicts/:id/retry   — retry a failed/conflict item
 *   POST   /api/daemon/connect              — configure remote sync target
 *   POST   /api/daemon/disconnect           — stop syncing with remote
 */

import { Hono } from "hono";
import {
  getDb,
  getDbMode,
  writeJSON,
  badRequest,
  notFound,
  writeError,
  writeRouteError,
} from "@codeplane/sdk";

// ---------------------------------------------------------------------------
// Module-level state — the SyncService is lazily created via /connect
// ---------------------------------------------------------------------------

import {
  SyncService,
  createSyncService,
  type SyncState,
  SyncQueue,
  type SyncQueueItem,
} from "@codeplane/sdk";

let syncService: SyncService | null = null;
let remoteUrl: string | null = null;
let remoteToken: string | null = null;

/** Server start time — set once on module load. */
const startedAt = Date.now();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uptime(): string {
  const ms = Date.now() - startedAt;
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${mins % 60}m`;
  if (hours > 0) return `${hours}h ${mins % 60}m ${secs % 60}s`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

async function getSyncState(): Promise<SyncState | null> {
  if (!syncService) return null;
  return syncService.getState();
}

async function getQueue(): Promise<SyncQueue> {
  if (syncService) return syncService.getQueue();
  // If no sync service, return a standalone queue for conflict inspection
  const db = getDb();
  const queue = new SyncQueue(db);
  await queue.init();
  return queue;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// ----------------------------- Status --------------------------------------

// GET /api/daemon/status
app.get("/api/daemon/status", async (c) => {
  const dbMode = getDbMode();
  const syncState = await getSyncState();

  const queue = await getQueue();
  const pendingCount = await queue.getPendingCount();
  const conflictCount = await queue.getConflictCount();

  return writeJSON(c, 200, {
    pid: process.pid,
    uptime: uptime(),
    uptime_ms: Date.now() - startedAt,
    port: process.env.CODEPLANE_PORT ?? "3000",
    db_mode: dbMode,
    sync_status: syncState?.status ?? "offline",
    pending_count: pendingCount,
    conflict_count: conflictCount,
    last_sync_at: syncState?.lastSyncAt?.toISOString() ?? null,
    error: syncState?.error ?? null,
    remote_url: remoteUrl,
  });
});

// ----------------------------- Sync ----------------------------------------

// POST /api/daemon/sync
app.post("/api/daemon/sync", async (c) => {
  if (!syncService) {
    return writeError(
      c,
      badRequest(
        "No remote configured. Use 'codeplane daemon connect <url>' first.",
      ),
    );
  }

  try {
    const result = await syncService.flushQueue();

    return writeJSON(c, 200, {
      total: result.total,
      synced: result.synced,
      conflicts: result.conflicts,
      failed: result.failed,
    });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Conflicts -----------------------------------

// GET /api/daemon/conflicts
app.get("/api/daemon/conflicts", async (c) => {
  try {
    const queue = await getQueue();
    const conflicts = await queue.getConflicts();

    return writeJSON(
      c,
      200,
      conflicts.map((item: SyncQueueItem) => ({
        id: item.id,
        method: item.method,
        path: item.path,
        body: item.body,
        local_id: item.localId,
        error_message: item.errorMessage,
        created_at: item.createdAt.toISOString(),
        status: item.status,
      })),
    );
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/daemon/conflicts/:id/resolve
app.post("/api/daemon/conflicts/:id/resolve", async (c) => {
  const { id } = c.req.param();
  if (!id || !id.trim()) {
    return writeError(c, badRequest("conflict id is required"));
  }

  try {
    const queue = await getQueue();

    // Verify the item exists and is a conflict
    const conflicts = await queue.getConflicts();
    const item = conflicts.find((ci: SyncQueueItem) => ci.id === id);
    if (!item) {
      return writeError(c, notFound("conflict not found"));
    }

    await queue.discardConflict(id);
    return writeJSON(c, 200, { resolved: true, id });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/daemon/conflicts/:id/retry
app.post("/api/daemon/conflicts/:id/retry", async (c) => {
  const { id } = c.req.param();
  if (!id || !id.trim()) {
    return writeError(c, badRequest("conflict id is required"));
  }

  try {
    const db = getDb();
    const queue = await getQueue();

    // Check that the item exists (could be conflict or failed)
    const conflicts = await queue.getConflicts();
    const item = conflicts.find((ci: SyncQueueItem) => ci.id === id);
    if (!item) {
      // Also check failed items via raw query
      const rows = await db.unsafe(
        `SELECT id, status FROM _sync_queue WHERE id = $1`,
        [id],
      );
      if (rows.length === 0) {
        return writeError(c, notFound("sync queue item not found"));
      }
    }

    // Reset the item to pending so the next flush picks it up
    await db.unsafe(
      `UPDATE _sync_queue SET status = 'pending', error_message = '' WHERE id = $1`,
      [id],
    );

    return writeJSON(c, 200, { retried: true, id });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Connect / Disconnect -------------------------

// POST /api/daemon/connect
app.post("/api/daemon/connect", async (c) => {
  let body: { url: string; token?: string };
  try {
    body = await c.req.json<{ url: string; token?: string }>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  const url = (body.url ?? "").trim().replace(/\/+$/, "");
  if (!url) {
    return writeError(c, badRequest("url is required"));
  }

  const token = (body.token ?? "").trim();

  // Test connectivity to the remote
  try {
    const healthUrl = `${url}/api/health`;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `token ${token}`;
    }
    const res = await fetch(healthUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return writeError(
        c,
        badRequest(`Remote health check failed: HTTP ${res.status}`),
      );
    }
  } catch (err) {
    return writeError(
      c,
      badRequest(
        `Cannot reach remote: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  // Stop existing sync service if any
  if (syncService) {
    await syncService.stop();
    syncService = null;
  }

  remoteUrl = url;
  remoteToken = token || null;

  // Create and start the sync service
  if (token) {
    const db = getDb();
    syncService = createSyncService({
      remoteUrl: url,
      token,
      sql: db,
    });

    try {
      await syncService.start();
    } catch (err) {
      return writeRouteError(c, err);
    }
  }

  return writeJSON(c, 200, {
    connected: true,
    remote_url: url,
    has_token: !!token,
    sync_started: !!token,
  });
});

// POST /api/daemon/disconnect
app.post("/api/daemon/disconnect", async (c) => {
  if (syncService) {
    await syncService.stop();
    syncService = null;
  }

  const wasConnected = !!remoteUrl;
  remoteUrl = null;
  remoteToken = null;

  return writeJSON(c, 200, {
    disconnected: true,
    was_connected: wasConnected,
  });
});

export default app;
