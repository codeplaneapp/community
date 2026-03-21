/**
 * CleanupScheduler — periodic background cleanup workers for Codeplane CE.
 *
 * Ported from the Go implementation in internal/cleanup/. Runs periodic
 * background jobs to clean up expired/stale data:
 *
 *   1. Idle workspace cleanup — suspend workspaces past their idle timeout
 *   2. Expired token cleanup — delete expired auth tokens, OAuth tokens, etc.
 *   3. Stale session cleanup — mark stuck workspace sessions as failed
 *   4. Stale workflow run cleanup — mark stuck workflow runs as failed
 *   5. Sync queue cleanup — purge old synced items from _sync_queue
 *   6. Artifact expiry — delete expired workflow and issue artifacts
 */

import type { Sql } from "postgres";
import type { BlobStore } from "../lib/blob";
import type { ContainerSandboxClient } from "./container-sandbox";

// DB query imports
import {
  listIdleWorkspaces,
  updateWorkspaceStatus,
  listStalePendingWorkspaces,
  listIdleWorkspaceSessions,
  updateWorkspaceSessionStatus,
} from "../db/workspace_sql";

import {
  deleteExpiredSessions,
  deleteExpiredNonces,
  deleteExpiredOAuthStates,
  deleteExpiredVerificationTokens,
} from "../db/auth_sql";

import { deleteExpiredSSETickets } from "../db/sse_tickets_sql";

import {
  deleteExpiredOAuth2AccessTokens,
  deleteExpiredOAuth2RefreshTokens,
  deleteExpiredOAuth2AuthorizationCodes,
} from "../db/oauth2_sql";

import { deleteExpiredLinearOAuthSetups } from "../db/linear_oauth_setups_sql";

import {
  pruneExpiredWorkflowArtifacts,
  type PruneExpiredWorkflowArtifactsRow,
} from "../db/workflow_artifacts_sql";

import {
  pruneExpiredIssueArtifacts,
  type PruneExpiredIssueArtifactsRow,
} from "../db/issue_artifacts_sql";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the cleanup scheduler. */
export interface CleanupSchedulerConfig {
  /** Interval (ms) for idle workspace cleanup. Default: 60_000 (1 min). */
  workspaceIntervalMs?: number;
  /** Interval (ms) for expired token cleanup. Default: 60_000 (1 min). */
  tokenIntervalMs?: number;
  /** Interval (ms) for stale session cleanup. Default: 60_000 (1 min). */
  staleSessionIntervalMs?: number;
  /** Interval (ms) for stale workflow run cleanup. Default: 60_000 (1 min). */
  staleWorkflowRunIntervalMs?: number;
  /** Interval (ms) for sync queue cleanup. Default: 60_000 (1 min). */
  syncQueueIntervalMs?: number;
  /** Interval (ms) for artifact expiry cleanup. Default: 300_000 (5 min). */
  artifactIntervalMs?: number;
  /** How many seconds before a pending workspace is considered stale. Default: 300 (5 min). */
  stalePendingWorkspaceSecs?: number;
  /** How many seconds before a running workflow run is considered stale. Default: 3600 (1 hr). */
  staleWorkflowRunSecs?: number;
  /** How many seconds synced queue items are retained. Default: 604800 (7 days). */
  syncQueueRetentionSecs?: number;
  /** Max artifacts to prune per sweep. Default: 100. */
  artifactBatchSize?: number;
  /** Container sandbox client for suspending idle workspaces. Optional. */
  containerClient?: ContainerSandboxClient | null;
  /** Blob store for deleting artifact blobs. Optional. */
  blobStore?: BlobStore | null;
}

/** Stats returned from a single sweep. */
export interface SweepResult {
  job: string;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Internal timer wrapper (matches Go ticker pattern for testability)
// ---------------------------------------------------------------------------

interface CleanupTimer {
  start(callback: () => void): void;
  stop(): void;
}

function createIntervalTimer(intervalMs: number): CleanupTimer {
  let handle: ReturnType<typeof setInterval> | null = null;
  return {
    start(callback: () => void) {
      handle = setInterval(callback, intervalMs);
    },
    stop() {
      if (handle !== null) {
        clearInterval(handle);
        handle = null;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// CleanupScheduler
// ---------------------------------------------------------------------------

export class CleanupScheduler {
  private readonly sql: Sql;
  private readonly config: Required<
    Omit<CleanupSchedulerConfig, "containerClient" | "blobStore">
  >;
  private readonly containerClient: ContainerSandboxClient | null;
  private readonly blobStore: BlobStore | null;
  private readonly timers: CleanupTimer[] = [];
  private running = false;

  constructor(sql: Sql, config: CleanupSchedulerConfig = {}) {
    this.sql = sql;
    this.containerClient = config.containerClient ?? null;
    this.blobStore = config.blobStore ?? null;
    this.config = {
      workspaceIntervalMs: config.workspaceIntervalMs ?? 60_000,
      tokenIntervalMs: config.tokenIntervalMs ?? 60_000,
      staleSessionIntervalMs: config.staleSessionIntervalMs ?? 60_000,
      staleWorkflowRunIntervalMs: config.staleWorkflowRunIntervalMs ?? 60_000,
      syncQueueIntervalMs: config.syncQueueIntervalMs ?? 60_000,
      artifactIntervalMs: config.artifactIntervalMs ?? 300_000,
      stalePendingWorkspaceSecs: config.stalePendingWorkspaceSecs ?? 300,
      staleWorkflowRunSecs: config.staleWorkflowRunSecs ?? 3600,
      syncQueueRetentionSecs: config.syncQueueRetentionSecs ?? 604_800,
      artifactBatchSize: config.artifactBatchSize ?? 100,
    };
  }

  /**
   * Start all cleanup workers. Idempotent — calling start() when already
   * running is a no-op.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    const jobs: Array<{ intervalMs: number; fn: () => Promise<void> }> = [
      { intervalMs: this.config.workspaceIntervalMs, fn: () => this.sweepIdleWorkspaces() },
      { intervalMs: this.config.tokenIntervalMs, fn: () => this.sweepExpiredTokens() },
      { intervalMs: this.config.staleSessionIntervalMs, fn: () => this.sweepStaleSessions() },
      { intervalMs: this.config.staleWorkflowRunIntervalMs, fn: () => this.sweepStaleWorkflowRuns() },
      { intervalMs: this.config.syncQueueIntervalMs, fn: () => this.sweepSyncQueue() },
      { intervalMs: this.config.artifactIntervalMs, fn: () => this.sweepExpiredArtifacts() },
    ];

    for (const job of jobs) {
      const timer = createIntervalTimer(job.intervalMs);
      timer.start(() => {
        job.fn().catch((err) => {
          console.error("[cleanup] unhandled error in sweep:", err);
        });
      });
      this.timers.push(timer);
    }

    console.log("[cleanup] scheduler started with 6 background workers");
  }

  /**
   * Stop all cleanup workers. Safe to call multiple times.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    for (const timer of this.timers) {
      timer.stop();
    }
    this.timers.length = 0;

    console.log("[cleanup] scheduler stopped");
  }

  // -------------------------------------------------------------------------
  // 1. Idle workspace cleanup
  // -------------------------------------------------------------------------

  async sweepIdleWorkspaces(): Promise<SweepResult> {
    const result: SweepResult = { job: "idle-workspaces", errors: [] };

    try {
      // Idle sessions — mark as closed
      const idleSessions = await listIdleWorkspaceSessions(this.sql);
      for (const session of idleSessions) {
        try {
          await updateWorkspaceSessionStatus(this.sql, {
            id: session.id,
            status: "closed",
          });
        } catch (err) {
          result.errors.push(
            `failed to close idle session ${session.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Idle workspaces — suspend VM + update status
      const idleWorkspaces = await listIdleWorkspaces(this.sql);
      for (const ws of idleWorkspaces) {
        try {
          // Attempt to suspend the VM if we have a container client and a VM ID
          if (this.containerClient && ws.freestyleVmId) {
            try {
              await this.containerClient.suspendVM(ws.freestyleVmId);
            } catch (vmErr) {
              // Non-fatal — still mark as suspended in DB
              result.errors.push(
                `failed to suspend VM for workspace ${ws.id}: ${vmErr instanceof Error ? vmErr.message : String(vmErr)}`
              );
            }
          }
          await updateWorkspaceStatus(this.sql, {
            id: ws.id,
            status: "suspended",
          });
        } catch (err) {
          result.errors.push(
            `failed to suspend workspace ${ws.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Stale pending workspaces — mark as failed
      const stale = await listStalePendingWorkspaces(this.sql, {
        staleAfterSecs: this.config.stalePendingWorkspaceSecs,
      });
      for (const ws of stale) {
        try {
          await updateWorkspaceStatus(this.sql, {
            id: ws.id,
            status: "failed",
          });
        } catch (err) {
          result.errors.push(
            `failed to mark stale workspace ${ws.id} as failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (idleSessions.length > 0 || idleWorkspaces.length > 0 || stale.length > 0) {
        console.log(
          `[cleanup] workspace sweep: ${idleSessions.length} idle sessions closed, ` +
          `${idleWorkspaces.length} workspaces suspended, ${stale.length} stale workspaces failed`
        );
      }
    } catch (err) {
      result.errors.push(
        `workspace sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // 2. Expired token cleanup
  // -------------------------------------------------------------------------

  async sweepExpiredTokens(): Promise<SweepResult> {
    const result: SweepResult = { job: "expired-tokens", errors: [] };

    const jobs: Array<{ name: string; fn: () => Promise<void> }> = [
      { name: "auth sessions", fn: () => deleteExpiredSessions(this.sql) },
      { name: "auth nonces", fn: () => deleteExpiredNonces(this.sql) },
      { name: "oauth states", fn: () => deleteExpiredOAuthStates(this.sql) },
      { name: "linear oauth setups", fn: () => deleteExpiredLinearOAuthSetups(this.sql) },
      { name: "verification tokens", fn: () => deleteExpiredVerificationTokens(this.sql) },
      { name: "sse tickets", fn: () => deleteExpiredSSETickets(this.sql) },
      { name: "oauth2 access tokens", fn: () => deleteExpiredOAuth2AccessTokens(this.sql) },
      { name: "oauth2 refresh tokens", fn: () => deleteExpiredOAuth2RefreshTokens(this.sql) },
      { name: "oauth2 authorization codes", fn: () => deleteExpiredOAuth2AuthorizationCodes(this.sql) },
    ];

    for (const job of jobs) {
      try {
        await job.fn();
      } catch (err) {
        result.errors.push(
          `delete expired ${job.name}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // 3. Stale session cleanup
  // -------------------------------------------------------------------------

  async sweepStaleSessions(): Promise<SweepResult> {
    const result: SweepResult = { job: "stale-sessions", errors: [] };

    try {
      // Query workspace sessions stuck in pending/starting for over 5 minutes
      const rows = await this.sql.unsafe(
        `SELECT id FROM workspace_sessions
         WHERE status IN ('pending', 'starting')
           AND created_at < NOW() - INTERVAL '5 minutes'`,
        []
      ).values();

      let count = 0;
      for (const row of rows) {
        try {
          await updateWorkspaceSessionStatus(this.sql, {
            id: row[0],
            status: "failed",
          });
          count++;
        } catch (err) {
          result.errors.push(
            `failed to mark stale session ${row[0]} as failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      if (count > 0) {
        console.log(`[cleanup] stale session sweep: ${count} sessions marked as failed`);
      }
    } catch (err) {
      result.errors.push(
        `stale session sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // 4. Stale workflow run cleanup
  // -------------------------------------------------------------------------

  async sweepStaleWorkflowRuns(): Promise<SweepResult> {
    const result: SweepResult = { job: "stale-workflow-runs", errors: [] };

    try {
      const updateResult = await this.sql.unsafe(
        `UPDATE workflow_runs
         SET status = 'failure',
             completed_at = NOW(),
             updated_at = NOW()
         WHERE status = 'running'
           AND updated_at < NOW() - make_interval(secs => $1::int)
         RETURNING id`,
        [this.config.staleWorkflowRunSecs]
      ).values();

      if (updateResult.length > 0) {
        console.log(
          `[cleanup] stale workflow run sweep: ${updateResult.length} runs marked as failure`
        );
      }
    } catch (err) {
      result.errors.push(
        `stale workflow run sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // 5. Sync queue cleanup
  // -------------------------------------------------------------------------

  async sweepSyncQueue(): Promise<SweepResult> {
    const result: SweepResult = { job: "sync-queue", errors: [] };

    try {
      const retentionSecs = this.config.syncQueueRetentionSecs;
      const deleteResult = await this.sql.unsafe(
        `DELETE FROM _sync_queue
         WHERE status = 'synced'
           AND synced_at < NOW() - INTERVAL '1 second' * $1
         RETURNING id`,
        [retentionSecs]
      ).values();

      if (deleteResult.length > 0) {
        console.log(
          `[cleanup] sync queue sweep: ${deleteResult.length} synced items purged`
        );
      }
    } catch (err) {
      // _sync_queue may not exist if sync mode is not used — this is expected
      if (
        err instanceof Error &&
        err.message.includes("does not exist")
      ) {
        // Silently ignore — sync queue table is only created on demand
      } else {
        result.errors.push(
          `sync queue sweep failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // 6. Artifact expiry cleanup
  // -------------------------------------------------------------------------

  async sweepExpiredArtifacts(): Promise<SweepResult> {
    const result: SweepResult = { job: "expired-artifacts", errors: [] };
    const now = new Date();
    const batchSize = String(this.config.artifactBatchSize);

    // Workflow artifacts
    try {
      const pruned = await pruneExpiredWorkflowArtifacts(this.sql, {
        expiresBefore: now,
        limitRows: batchSize,
      });

      // Delete blobs for pruned artifacts
      if (this.blobStore && pruned.length > 0) {
        await this.deleteBlobsForWorkflowArtifacts(pruned, result);
      }

      if (pruned.length > 0) {
        console.log(
          `[cleanup] workflow artifact sweep: ${pruned.length} expired artifacts deleted`
        );
      }
    } catch (err) {
      result.errors.push(
        `workflow artifact sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Issue artifacts
    try {
      const pruned = await pruneExpiredIssueArtifacts(this.sql, {
        expiresBefore: now,
        limitRows: batchSize,
      });

      // Delete blobs for pruned artifacts
      if (this.blobStore && pruned.length > 0) {
        await this.deleteBlobsForIssueArtifacts(pruned, result);
      }

      if (pruned.length > 0) {
        console.log(
          `[cleanup] issue artifact sweep: ${pruned.length} expired artifacts deleted`
        );
      }
    } catch (err) {
      result.errors.push(
        `issue artifact sweep failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Blob deletion helpers
  // -------------------------------------------------------------------------

  private async deleteBlobsForWorkflowArtifacts(
    artifacts: PruneExpiredWorkflowArtifactsRow[],
    result: SweepResult
  ): Promise<void> {
    if (!this.blobStore) return;

    for (const artifact of artifacts) {
      if (!artifact.gcsKey) continue;
      try {
        await this.blobStore.delete(artifact.gcsKey);
      } catch (err) {
        // Non-fatal — blob may already be gone
        result.errors.push(
          `failed to delete blob for workflow artifact ${artifact.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  private async deleteBlobsForIssueArtifacts(
    artifacts: PruneExpiredIssueArtifactsRow[],
    result: SweepResult
  ): Promise<void> {
    if (!this.blobStore) return;

    for (const artifact of artifacts) {
      if (!artifact.gcsKey) continue;
      try {
        await this.blobStore.delete(artifact.gcsKey);
      } catch (err) {
        // Non-fatal — blob may already be gone
        result.errors.push(
          `failed to delete blob for issue artifact ${artifact.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}
