/**
 * SyncService — ElectricSQL sync layer for Codeplane's local-first daemon mode.
 *
 * Handles bidirectional sync between the local PGLite daemon and a remote
 * Codeplane server using ElectricSQL shape subscriptions for downstream sync
 * and a write queue for upstream sync.
 *
 * Downstream: ElectricSQL ShapeStream -> apply changes to local PGLite
 * Upstream:   Local writes -> _sync_queue -> flush to remote API
 */

import { ShapeStream, Shape } from "@electric-sql/client";
import type { Sql } from "postgres";

import { SyncQueue, type RemoteCaller, type FlushResult } from "./sync-queue";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = "offline" | "online" | "syncing" | "error";

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  conflictCount: number;
  lastSyncAt: Date | null;
  error: string | null;
}

export interface ShapeSubscription {
  table: string;
  where?: string;
  /** Column used as the primary key for upserts. Defaults to "id". */
  primaryKey?: string;
  stream: ShapeStream;
  shape: Shape;
  unsubscribe: () => void;
}

export interface SyncServiceConfig {
  /** Remote Codeplane server URL (e.g. "https://api.codeplane.app"). */
  remoteUrl: string;
  /** Auth token for the remote server. */
  token: string;
  /** Local PGLite database connection (postgres.js Sql interface). */
  sql: Sql;
  /** Interval in ms for checking connectivity and flushing the queue. */
  flushIntervalMs?: number;
  /** Interval in ms for polling jj operation log changes. */
  jjWatchIntervalMs?: number;
}

type SyncEventType =
  | "status-change"
  | "sync-complete"
  | "conflict"
  | "error";

type SyncEventListener = (event: {
  type: SyncEventType;
  data: unknown;
}) => void;

// ---------------------------------------------------------------------------
// SyncService
// ---------------------------------------------------------------------------

export class SyncService {
  private remoteUrl: string;
  private token: string;
  private sql: Sql;
  private queue: SyncQueue;
  private subscriptions: Map<string, ShapeSubscription> = new Map();
  private flushIntervalMs: number;
  private jjWatchIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private jjWatchTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<SyncEventType, Set<SyncEventListener>> = new Map();
  private _status: SyncStatus = "offline";
  private _lastSyncAt: Date | null = null;
  private _error: string | null = null;
  private syncCursors: Map<string, string> = new Map();

  constructor(config: SyncServiceConfig) {
    this.remoteUrl = config.remoteUrl.replace(/\/$/, "");
    this.token = config.token;
    this.sql = config.sql;
    this.queue = new SyncQueue(config.sql);
    this.flushIntervalMs = config.flushIntervalMs ?? 5000;
    this.jjWatchIntervalMs = config.jjWatchIntervalMs ?? 3000;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialize the sync service. Creates the _sync_queue table if needed
   * and loads persisted sync cursors.
   */
  async init(): Promise<void> {
    await this.queue.init();
    await this.ensureSyncMetaTable();
    await this.loadSyncCursors();
  }

  /**
   * Start the sync engine: subscribe to shapes, start flush timer,
   * start jj watch timer.
   */
  async start(): Promise<void> {
    await this.init();
    this.setStatus("syncing");

    // Initial flush of any pending items from previous session
    try {
      await this.flushQueue();
      this.setStatus("online");
    } catch {
      this.setStatus("error");
    }

    // Periodic flush timer
    this.flushTimer = setInterval(async () => {
      try {
        const pendingCount = await this.queue.getPendingCount();
        if (pendingCount > 0) {
          this.setStatus("syncing");
          await this.flushQueue();
          this.setStatus("online");
        }
      } catch (err) {
        this._error =
          err instanceof Error ? err.message : "flush failed";
        this.setStatus("error");
      }
    }, this.flushIntervalMs);
  }

  /**
   * Stop the sync engine: unsubscribe from all shapes, clear timers.
   */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.jjWatchTimer) {
      clearInterval(this.jjWatchTimer);
      this.jjWatchTimer = null;
    }

    for (const [key, sub] of this.subscriptions) {
      sub.unsubscribe();
      this.subscriptions.delete(key);
    }

    this.setStatus("offline");
  }

  // -----------------------------------------------------------------------
  // Shape subscriptions (downstream sync)
  // -----------------------------------------------------------------------

  /**
   * Subscribe to an ElectricSQL shape for a given table and filter.
   * Changes from the shape stream are applied to the local PGLite.
   */
  async subscribeToShape(
    table: string,
    where?: string,
    primaryKey: string = "id",
  ): Promise<ShapeSubscription> {
    const key = `${table}:${where ?? "*"}`;

    // Don't double-subscribe
    const existing = this.subscriptions.get(key);
    if (existing) return existing;

    const shapeUrl = `${this.remoteUrl}/v1/shape`;
    const params: Record<string, string> = { table };
    if (where) {
      params.where = where;
    }

    // Resume from last known cursor
    const cursor = this.syncCursors.get(key);

    const stream = new ShapeStream({
      url: shapeUrl,
      params,
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      ...(cursor ? { offset: cursor as `${number}_${number}` } : {}),
    });

    const shape = new Shape(stream);

    // Process incoming messages
    const unsubscribeStream = stream.subscribe(async (messages) => {
      for (const message of messages) {
        try {
          await this.applyShapeMessage(table, primaryKey, message);
        } catch (err) {
          this.emit("error", {
            table,
            message,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Persist the sync cursor
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && "offset" in lastMessage) {
          const offset = String(lastMessage.offset);
          this.syncCursors.set(key, offset);
          await this.persistSyncCursor(key, offset);
        }
      }
    });

    const subscription: ShapeSubscription = {
      table,
      where,
      primaryKey,
      stream,
      shape,
      unsubscribe: () => {
        unsubscribeStream();
        this.subscriptions.delete(key);
      },
    };

    this.subscriptions.set(key, subscription);
    return subscription;
  }

  /**
   * Subscribe to shapes for all repos the user has access to.
   * Subscribes to issues, landing_requests, and issue_comments.
   */
  async subscribeToRepos(repositoryIds: string[]): Promise<void> {
    if (repositoryIds.length === 0) return;

    const inClause = repositoryIds.map((id) => `'${id}'`).join(", ");
    const where = `repository_id IN (${inClause})`;

    await Promise.all([
      this.subscribeToShape("issues", where),
      this.subscribeToShape("issue_comments", where),
      this.subscribeToShape("landing_requests", where),
      this.subscribeToShape("labels", where),
      this.subscribeToShape("milestones", where),
    ]);
  }

  /**
   * Unsubscribe from a specific shape.
   */
  unsubscribeFromShape(table: string, where?: string): void {
    const key = `${table}:${where ?? "*"}`;
    const sub = this.subscriptions.get(key);
    if (sub) {
      sub.unsubscribe();
    }
  }

  // -----------------------------------------------------------------------
  // Downstream — apply remote changes to local PGLite
  // -----------------------------------------------------------------------

  /**
   * Apply a single shape stream message to the local database.
   */
  private async applyShapeMessage(
    table: string,
    primaryKey: string,
    message: Record<string, unknown>,
  ): Promise<void> {
    const headers = message.headers as Record<string, string> | undefined;
    if (!headers) return;

    const operation = headers.operation;
    const value = message.value as Record<string, unknown> | undefined;

    if (!value) return;

    switch (operation) {
      case "insert":
      case "update":
        await this.upsertRow(table, primaryKey, value);
        break;
      case "delete":
        await this.deleteRow(table, primaryKey, value);
        break;
    }
  }

  /**
   * Upsert a row into the local PGLite table.
   */
  private async upsertRow(
    table: string,
    primaryKey: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const columns = Object.keys(value);
    if (columns.length === 0) return;

    const placeholders = columns.map((_, i) => `$${i + 1}`);
    const values = columns.map((col) => {
      const v = value[col];
      // JSONB values need to be stringified
      if (v !== null && typeof v === "object") return JSON.stringify(v);
      return v;
    });

    const updateSet = columns
      .filter((col) => col !== primaryKey)
      .map((col, i) => {
        // Find the real index of this column in the full columns array
        const fullIndex = columns.indexOf(col);
        return `${col} = $${fullIndex + 1}`;
      })
      .join(", ");

    const sql = `
      INSERT INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (${primaryKey}) DO UPDATE SET ${updateSet}
    `;

    await this.sql.unsafe(sql, values);
  }

  /**
   * Delete a row from the local PGLite table.
   */
  private async deleteRow(
    table: string,
    primaryKey: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const pk = value[primaryKey];
    if (pk == null) return;

    await this.sql.unsafe(
      `DELETE FROM ${table} WHERE ${primaryKey} = $1`,
      [pk],
    );
  }

  // -----------------------------------------------------------------------
  // Upstream — queue local writes for sync
  // -----------------------------------------------------------------------

  /**
   * Enqueue a local write for upstream sync to the remote server.
   * The write should already have been applied to local PGLite.
   */
  async enqueueWrite(
    method: string,
    path: string,
    body: unknown | null,
    localId?: string,
  ): Promise<void> {
    await this.queue.enqueue(method, path, body, { localId });
    this.emit("status-change", await this.getState());
  }

  /**
   * Flush the sync queue by replaying pending items against the remote API.
   */
  async flushQueue(): Promise<FlushResult> {
    const caller: RemoteCaller = async (method, path, body) => {
      const url = `${this.remoteUrl}${path}`;
      const fetchOpts: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.token}`,
        },
      };
      if (body != null && method !== "GET" && method !== "DELETE") {
        fetchOpts.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOpts);
      let responseBody: unknown = null;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        responseBody = await response.json();
      }

      return { status: response.status, body: responseBody };
    };

    const result = await this.queue.flush(caller);
    this._lastSyncAt = new Date();

    if (result.conflicts > 0) {
      this.emit("conflict", { count: result.conflicts });
    }
    if (result.total > 0) {
      this.emit("sync-complete", result);
    }

    return result;
  }

  // -----------------------------------------------------------------------
  // Sync status
  // -----------------------------------------------------------------------

  /**
   * Get the current sync state.
   */
  async getState(): Promise<SyncState> {
    const [pendingCount, conflictCount] = await Promise.all([
      this.queue.getPendingCount(),
      this.queue.getConflictCount(),
    ]);

    return {
      status: this._status,
      pendingCount,
      conflictCount,
      lastSyncAt: this._lastSyncAt,
      error: this._error,
    };
  }

  /**
   * Get the underlying SyncQueue for direct access.
   */
  getQueue(): SyncQueue {
    return this.queue;
  }

  // -----------------------------------------------------------------------
  // Auto-push branches
  // -----------------------------------------------------------------------

  /**
   * Start watching for jj operation log changes and auto-push private
   * branches to the remote.
   *
   * @param repoPath - Path to the jj repository to watch.
   * @param user - Username for the private bookmark namespace.
   */
  startJJWatch(repoPath: string, user: string): void {
    if (this.jjWatchTimer) return;

    let lastOpId: string | null = null;

    this.jjWatchTimer = setInterval(async () => {
      try {
        const currentOpId = await this.getJJOperationId(repoPath);
        if (currentOpId && currentOpId !== lastOpId) {
          lastOpId = currentOpId;
          await this.pushPrivateBookmarks(repoPath, user);
        }
      } catch {
        // Silently ignore watch errors — they're non-fatal
      }
    }, this.jjWatchIntervalMs);
  }

  /**
   * Stop watching for jj operation log changes.
   */
  stopJJWatch(): void {
    if (this.jjWatchTimer) {
      clearInterval(this.jjWatchTimer);
      this.jjWatchTimer = null;
    }
  }

  /**
   * Get the current jj operation ID for change detection.
   */
  private async getJJOperationId(repoPath: string): Promise<string | null> {
    try {
      const proc = Bun.spawn(["jj", "operation", "log", "--limit=1", "--no-graph", "-T", "self.id()"], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      return output.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Push private bookmarks to the remote.
   */
  private async pushPrivateBookmarks(
    repoPath: string,
    user: string,
  ): Promise<void> {
    try {
      const proc = Bun.spawn(
        ["jj", "git", "push", "--bookmark", `glob:private/${user}/*`],
        {
          cwd: repoPath,
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      await proc.exited;
    } catch {
      // Non-fatal: push failures are retried on next interval
    }
  }

  // -----------------------------------------------------------------------
  // Sync metadata persistence
  // -----------------------------------------------------------------------

  /**
   * Ensure the _sync_meta table exists for persisting cursors.
   */
  private async ensureSyncMetaTable(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS _sync_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  /**
   * Load all persisted sync cursors.
   */
  private async loadSyncCursors(): Promise<void> {
    const rows = await this.sql.unsafe(
      `SELECT key, value FROM _sync_meta WHERE key LIKE 'cursor:%'`,
    );
    for (const row of rows) {
      const shapeKey = String(row.key).replace(/^cursor:/, "");
      this.syncCursors.set(shapeKey, String(row.value));
    }
  }

  /**
   * Persist a sync cursor for a shape subscription.
   */
  private async persistSyncCursor(
    shapeKey: string,
    cursor: string,
  ): Promise<void> {
    await this.sql.unsafe(
      `INSERT INTO _sync_meta (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [`cursor:${shapeKey}`, cursor],
    );
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  /**
   * Subscribe to sync events.
   */
  on(event: SyncEventType, listener: SyncEventListener): () => void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners!.delete(listener);
    };
  }

  private emit(type: SyncEventType, data: unknown): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener({ type, data });
        } catch {
          // Don't let listener errors crash the sync engine
        }
      }
    }
  }

  private setStatus(status: SyncStatus): void {
    if (this._status === status) return;
    this._status = status;
    if (status !== "error") {
      this._error = null;
    }
    this.emit("status-change", { status });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new SyncService instance.
 */
export function createSyncService(config: SyncServiceConfig): SyncService {
  return new SyncService(config);
}
