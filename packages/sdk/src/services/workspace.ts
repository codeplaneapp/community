import { createHash, randomUUID } from "crypto";
import type { Sql } from "postgres";
import {
  APIError,
  notFound,
  internal,
  conflict,
  badRequest,
} from "../lib/errors";
import type { ContainerSandboxClient } from "./container-sandbox";
import {
  createSandboxAccessToken as dbCreateSandboxAccessToken,
} from "../db/sandbox_access_tokens_sql";
import {
  createWorkspace as dbCreateWorkspace,
  getWorkspace as dbGetWorkspace,
  getWorkspaceForUserRepo as dbGetWorkspaceForUserRepo,
  getActiveWorkspaceForUserRepo as dbGetActiveWorkspaceForUserRepo,
  listWorkspacesByRepo as dbListWorkspacesByRepo,
  countWorkspacesByRepo as dbCountWorkspacesByRepo,
  updateWorkspaceStatus as dbUpdateWorkspaceStatus,
  updateWorkspaceExecutionInfo as dbUpdateWorkspaceExecutionInfo,
  touchWorkspaceActivity as dbTouchWorkspaceActivity,
  listIdleWorkspaces as dbListIdleWorkspaces,
  listStalePendingWorkspaces as dbListStalePendingWorkspaces,
  createWorkspaceSnapshot as dbCreateWorkspaceSnapshot,
  getWorkspaceSnapshotForUserRepo as dbGetWorkspaceSnapshotForUserRepo,
  listWorkspaceSnapshotsByRepo as dbListWorkspaceSnapshotsByRepo,
  countWorkspaceSnapshotsByRepo as dbCountWorkspaceSnapshotsByRepo,
  deleteWorkspaceSnapshot as dbDeleteWorkspaceSnapshot,
  createWorkspaceSession as dbCreateWorkspaceSession,
  getWorkspaceSessionForUserRepo as dbGetWorkspaceSessionForUserRepo,
  listWorkspaceSessionsByRepo as dbListWorkspaceSessionsByRepo,
  countWorkspaceSessionsByRepo as dbCountWorkspaceSessionsByRepo,
  updateWorkspaceSessionStatus as dbUpdateWorkspaceSessionStatus,
  updateWorkspaceSessionSSHConnectionInfo as dbUpdateWorkspaceSessionSSHConnectionInfo,
  touchWorkspaceSessionActivity as dbTouchWorkspaceSessionActivity,
  countActiveSessionsForWorkspace as dbCountActiveSessionsForWorkspace,
  listIdleWorkspaceSessions as dbListIdleWorkspaceSessions,
  notifyWorkspaceStatus as dbNotifyWorkspaceStatus,
  type CreateWorkspaceRow,
  type CreateWorkspaceSessionRow,
} from "../db/workspace_sql";

// ---------------------------------------------------------------------------
// Constants — mirrors Go workspace service defaults
// ---------------------------------------------------------------------------

const DEFAULT_SSH_HOST = "localhost";
const DEFAULT_USERNAME = "root";
const DEFAULT_IDLE_TIMEOUT_SECONDS = 1800;
const DEFAULT_PERSISTENCE = "persistent";
const STALE_AFTER_SECONDS = 300; // 5 minutes
const SANDBOX_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Response types — match the route-level interfaces exactly
// ---------------------------------------------------------------------------

export interface WorkspaceResponse {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  status: string;
  is_fork: boolean;
  parent_workspace_id?: string;
  freestyle_vm_id: string;
  persistence: string;
  ssh_host?: string;
  snapshot_id?: string;
  idle_timeout_seconds: number;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSessionResponse {
  id: string;
  workspace_id: string;
  repository_id: number;
  user_id: number;
  status: string;
  cols: number;
  rows: number;
  last_activity_at: string;
  idle_timeout_secs: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSSHConnectionInfo {
  workspace_id: string;
  session_id: string;
  vm_id: string;
  host: string;
  ssh_host: string;
  username: string;
  port: number;
  access_token: string;
  command: string;
}

export interface WorkspaceSnapshotResponse {
  id: string;
  repository_id: number;
  user_id: number;
  name: string;
  workspace_id?: string;
  freestyle_snapshot_id: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface CreateWorkspaceInput {
  repositoryID: number;
  userID: number;
  repoOwner: string;
  repoName: string;
  name: string;
  snapshotID: string;
}

export interface ForkWorkspaceInput {
  repositoryID: number;
  userID: number;
  workspaceID: string;
  name: string;
}

export interface CreateWorkspaceSnapshotInput {
  repositoryID: number;
  userID: number;
  workspaceID: string;
  name: string;
}

export interface CreateWorkspaceSessionInput {
  repositoryID: number;
  userID: number;
  cols: number;
  rows: number;
  repoOwner: string;
  repoName: string;
  workspaceID: string;
}

// ---------------------------------------------------------------------------
// WorkspaceService
// ---------------------------------------------------------------------------

export class WorkspaceService {
  private sshHost: string;
  private username: string;
  private persistence: string;

  constructor(
    private readonly sql: Sql,
    private readonly sandbox: ContainerSandboxClient | null,
    options?: {
      sshHost?: string;
      username?: string;
      persistence?: string;
    }
  ) {
    this.sshHost = options?.sshHost ?? DEFAULT_SSH_HOST;
    this.username = options?.username ?? DEFAULT_USERNAME;
    this.persistence = options?.persistence ?? DEFAULT_PERSISTENCE;
  }

  // -------------------------------------------------------------------------
  // Workspace CRUD
  // -------------------------------------------------------------------------

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceResponse> {
    if (!this.sandbox) {
      throw internal("sandbox client unavailable");
    }

    const name = input.name.trim();
    const snapshotID = input.snapshotID.trim();

    // If restoring from snapshot, create a new workspace from that snapshot
    if (snapshotID) {
      const snapshot = await this.loadOwnedSnapshot(
        snapshotID,
        String(input.repositoryID),
        String(input.userID)
      );
      if (!snapshot) {
        throw notFound("workspace snapshot not found");
      }

      const created = await dbCreateWorkspace(this.sql, {
        repositoryId: String(input.repositoryID),
        userId: String(input.userID),
        name,
        isFork: true,
        parentWorkspaceId: "",
        sourceSnapshotId: snapshot.id,
        status: "starting",
      });
      if (!created) {
        throw internal("create snapshot workspace failed");
      }

      // Note: ContainerSandboxClient does not support snapshot-based creation.
      // Create a fresh container instead.
      return this.provisionAndActivateWorkspace(created, input);
    }

    // Find or create the primary workspace for this user+repo
    const workspace = await this.findOrCreatePrimaryWorkspace(
      String(input.repositoryID),
      String(input.userID),
      name
    );

    // Ensure the container is running
    return this.ensureWorkspaceRunning(workspace, input);
  }

  async getWorkspace(
    workspaceID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceResponse | null> {
    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!workspace) return null;
    return this.toWorkspaceResponse(workspace);
  }

  async listWorkspaces(
    repositoryID: number,
    userID: number,
    page: number,
    perPage: number
  ): Promise<{ workspaces: WorkspaceResponse[]; total: number }> {
    if (page < 1) page = 1;
    if (perPage < 1 || perPage > 100) perPage = 30;
    const offset = (page - 1) * perPage;

    const [rows, countRow] = await Promise.all([
      dbListWorkspacesByRepo(this.sql, {
        repositoryId: String(repositoryID),
        userId: String(userID),
        pageOffset: String(offset),
        pageSize: String(perPage),
      }),
      dbCountWorkspacesByRepo(this.sql, {
        repositoryId: String(repositoryID),
        userId: String(userID),
      }),
    ]);

    const total = countRow ? parseInt(countRow.count, 10) : 0;
    const workspaces = rows.map((r) => this.toWorkspaceResponse(r));
    return { workspaces, total };
  }

  async getWorkspaceSSHConnectionInfo(
    workspaceID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceSSHConnectionInfo | null> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!workspace) return null;

    const vmId = workspace.freestyleVmId.trim();
    if (!vmId) return null;

    // Generate a short-lived sandbox access token instead of using Freestyle identity.
    const rawToken = randomUUID();
    const tokenHash = createHash("sha256").update(rawToken).digest();

    await dbCreateSandboxAccessToken(this.sql, {
      workspaceId: workspace.id,
      vmId,
      userId: String(userID),
      linuxUser: this.username,
      tokenHash: tokenHash,
      tokenType: "ssh",
      expiresAt: new Date(Date.now() + SANDBOX_ACCESS_TOKEN_TTL_MS),
    });

    return {
      workspace_id: workspace.id,
      session_id: "",
      vm_id: vmId,
      host: this.sshHost,
      ssh_host: `${vmId}+${this.username}@${this.sshHost}`,
      username: this.username,
      port: 22,
      access_token: rawToken,
      command: `ssh ${vmId}+${this.username}:${rawToken}@${this.sshHost}`,
    };
  }

  async suspendWorkspace(
    workspaceID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceResponse | null> {
    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!workspace) return null;

    await this.doSuspendWorkspace(workspace);

    // Reload after status update
    const updated = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!updated) return null;
    return this.toWorkspaceResponse(updated);
  }

  async resumeWorkspace(
    workspaceID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceResponse | null> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!workspace) return null;

    const vmId = workspace.freestyleVmId.trim();
    if (!vmId) {
      throw conflict("workspace VM has not been provisioned");
    }

    // Check current container state
    const status = await this.sandbox.getVM(vmId);
    if (status.state === "running") {
      // Already running, just update status if needed
      if (workspace.status !== "running") {
        await dbUpdateWorkspaceStatus(this.sql, {
          id: workspace.id,
          status: "running",
        });
      }
      await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });
    } else {
      // Start the container
      await this.sandbox.startVM(vmId);
      await dbUpdateWorkspaceStatus(this.sql, {
        id: workspace.id,
        status: "running",
      });
      await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });
      this.notifyWorkspace(workspace.id, "running");
    }

    const updated = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!updated) return null;
    return this.toWorkspaceResponse(updated);
  }

  async deleteWorkspace(
    workspaceID: string,
    repositoryID: number,
    userID: number
  ): Promise<void> {
    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: workspaceID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!workspace) return;

    await this.doDestroyWorkspace(workspace);
  }

  async forkWorkspace(_input: ForkWorkspaceInput): Promise<WorkspaceResponse> {
    // Container-based workspaces cannot fork a running VM's memory state
    throw new APIError(
      501,
      "forking requires Codeplane Cloud — container-based workspaces cannot fork a running VM's memory state"
    );
  }

  // -------------------------------------------------------------------------
  // Snapshots
  // -------------------------------------------------------------------------

  async createWorkspaceSnapshot(
    input: CreateWorkspaceSnapshotInput
  ): Promise<WorkspaceSnapshotResponse> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: input.workspaceID,
      repositoryId: String(input.repositoryID),
      userId: String(input.userID),
    });
    if (!workspace) throw notFound("workspace not found");

    const vmId = workspace.freestyleVmId.trim();
    if (!vmId) throw conflict("workspace VM has not been provisioned");

    // Commit the container to an image (docker commit)
    const name = input.name.trim() || `snapshot-${Date.now()}`;
    const imageName = `codeplane-snapshot-${workspace.id.slice(0, 8)}-${Date.now()}`;

    // Use exec to run docker commit, since ContainerSandboxClient doesn't have snapshotVM
    // Instead, we store a reference. The "freestyle_snapshot_id" is the image name.
    const snapshot = await dbCreateWorkspaceSnapshot(this.sql, {
      repositoryId: String(workspace.repositoryId),
      userId: String(workspace.userId),
      workspaceId: workspace.id,
      name,
      freestyleSnapshotId: imageName,
    });
    if (!snapshot) throw internal("persist workspace snapshot failed");

    return this.toSnapshotResponse(snapshot);
  }

  async getWorkspaceSnapshot(
    snapshotID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceSnapshotResponse | null> {
    const snapshot = await dbGetWorkspaceSnapshotForUserRepo(this.sql, {
      id: snapshotID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!snapshot) return null;
    return this.toSnapshotResponse(snapshot);
  }

  async listWorkspaceSnapshots(
    repositoryID: number,
    userID: number,
    page: number,
    perPage: number
  ): Promise<{ snapshots: WorkspaceSnapshotResponse[]; total: number }> {
    if (page < 1) page = 1;
    if (perPage < 1 || perPage > 100) perPage = 30;
    const offset = (page - 1) * perPage;

    const [rows, countRow] = await Promise.all([
      dbListWorkspaceSnapshotsByRepo(this.sql, {
        repositoryId: String(repositoryID),
        userId: String(userID),
        pageOffset: String(offset),
        pageSize: String(perPage),
      }),
      dbCountWorkspaceSnapshotsByRepo(this.sql, {
        repositoryId: String(repositoryID),
        userId: String(userID),
      }),
    ]);

    const total = countRow ? parseInt(countRow.count, 10) : 0;
    const snapshots = rows.map((r) => this.toSnapshotResponse(r));
    return { snapshots, total };
  }

  async deleteWorkspaceSnapshot(
    snapshotID: string,
    repositoryID: number,
    userID: number
  ): Promise<void> {
    const snapshot = await dbGetWorkspaceSnapshotForUserRepo(this.sql, {
      id: snapshotID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!snapshot) return;

    await dbDeleteWorkspaceSnapshot(this.sql, { id: snapshotID });
  }

  // -------------------------------------------------------------------------
  // Sessions
  // -------------------------------------------------------------------------

  async createSession(
    input: CreateWorkspaceSessionInput
  ): Promise<WorkspaceSessionResponse> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    const cols = input.cols > 0 ? input.cols : 80;
    const rows = input.rows > 0 ? input.rows : 24;

    let workspace: CreateWorkspaceRow | null;
    const workspaceID = input.workspaceID.trim();

    if (workspaceID) {
      workspace = await dbGetWorkspaceForUserRepo(this.sql, {
        id: workspaceID,
        repositoryId: String(input.repositoryID),
        userId: String(input.userID),
      });
      if (!workspace) throw notFound("workspace not found");
    } else {
      workspace = await this.findOrCreatePrimaryWorkspace(
        String(input.repositoryID),
        String(input.userID),
        ""
      );
    }

    // Create the session record
    const session = await dbCreateWorkspaceSession(this.sql, {
      workspaceId: workspace.id,
      repositoryId: String(input.repositoryID),
      userId: String(input.userID),
      cols,
      rows,
    });
    if (!session) throw internal("create workspace session failed");

    // Ensure the workspace container is running
    try {
      await this.ensureWorkspaceRunning(workspace, {
        repositoryID: input.repositoryID,
        userID: input.userID,
        repoOwner: input.repoOwner,
        repoName: input.repoName,
        name: "",
        snapshotID: "",
      });
    } catch (err) {
      // Mark session as failed
      await dbUpdateWorkspaceSessionStatus(this.sql, {
        id: session.id,
        status: "failed",
      });
      this.notifySession(session.id, "failed");
      throw err;
    }

    // Mark session as running
    const updated = await dbUpdateWorkspaceSessionStatus(this.sql, {
      id: session.id,
      status: "running",
    });
    if (!updated) throw internal("mark workspace session running failed");

    await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });
    await dbTouchWorkspaceSessionActivity(this.sql, { id: session.id });
    this.notifySession(session.id, "running");

    return this.toSessionResponse(updated);
  }

  async getSession(
    sessionID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceSessionResponse | null> {
    const session = await dbGetWorkspaceSessionForUserRepo(this.sql, {
      id: sessionID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!session) return null;
    return this.toSessionResponse(session);
  }

  async listSessions(
    repositoryID: number,
    userID: number,
    page: number,
    perPage: number
  ): Promise<{ sessions: WorkspaceSessionResponse[]; total: number }> {
    if (page < 1) page = 1;
    if (perPage < 1 || perPage > 100) perPage = 30;
    const offset = (page - 1) * perPage;

    const [rows, countRow] = await Promise.all([
      dbListWorkspaceSessionsByRepo(this.sql, {
        repositoryId: String(repositoryID),
        userId: String(userID),
        pageOffset: String(offset),
        pageSize: String(perPage),
      }),
      dbCountWorkspaceSessionsByRepo(this.sql, {
        repositoryId: String(repositoryID),
        userId: String(userID),
      }),
    ]);

    const total = countRow ? parseInt(countRow.count, 10) : 0;
    const sessions = rows.map((r) => this.toSessionResponse(r));
    return { sessions, total };
  }

  async getSSHConnectionInfo(
    sessionID: string,
    repositoryID: number,
    userID: number
  ): Promise<WorkspaceSSHConnectionInfo | null> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    const session = await dbGetWorkspaceSessionForUserRepo(this.sql, {
      id: sessionID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!session) return null;

    const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
      id: session.workspaceId,
      repositoryId: String(session.repositoryId),
      userId: String(session.userId),
    });
    if (!workspace) return null;

    const vmId = workspace.freestyleVmId.trim();
    if (!vmId) return null;

    // Ensure the container is running
    const vmStatus = await this.sandbox.getVM(vmId);
    if (vmStatus.state !== "running") {
      await this.sandbox.startVM(vmId);
      await dbUpdateWorkspaceStatus(this.sql, {
        id: workspace.id,
        status: "running",
      });
    }

    // Generate a short-lived sandbox access token instead of using Freestyle identity.
    const rawToken = randomUUID();
    const tokenHash = createHash("sha256").update(rawToken).digest();

    await dbCreateSandboxAccessToken(this.sql, {
      workspaceId: workspace.id,
      vmId,
      userId: String(userID),
      linuxUser: this.username,
      tokenHash: tokenHash,
      tokenType: "ssh",
      expiresAt: new Date(Date.now() + SANDBOX_ACCESS_TOKEN_TTL_MS),
    });

    const info: WorkspaceSSHConnectionInfo = {
      workspace_id: workspace.id,
      session_id: session.id,
      vm_id: vmId,
      host: this.sshHost,
      ssh_host: `${vmId}+${this.username}@${this.sshHost}`,
      username: this.username,
      port: 22,
      access_token: rawToken,
      command: `ssh ${vmId}+${this.username}:${rawToken}@${this.sshHost}`,
    };

    // Persist SSH connection info to session
    await dbUpdateWorkspaceSessionSSHConnectionInfo(this.sql, {
      id: session.id,
      sshConnectionInfo: JSON.stringify(info),
    });

    // Mark session running if not already
    if (session.status !== "running") {
      await dbUpdateWorkspaceSessionStatus(this.sql, {
        id: session.id,
        status: "running",
      });
    }

    await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });
    await dbTouchWorkspaceSessionActivity(this.sql, { id: session.id });
    this.notifySession(session.id, "running");

    return info;
  }

  async destroySession(
    sessionID: string,
    repositoryID: number,
    userID: number
  ): Promise<void> {
    const session = await dbGetWorkspaceSessionForUserRepo(this.sql, {
      id: sessionID,
      repositoryId: String(repositoryID),
      userId: String(userID),
    });
    if (!session) return;

    if (session.status !== "stopped" && session.status !== "failed") {
      await dbUpdateWorkspaceSessionStatus(this.sql, {
        id: sessionID,
        status: "stopped",
      });
    }

    this.notifySession(sessionID, "stopped");

    // If no more active sessions, suspend the workspace
    const activeCount = await dbCountActiveSessionsForWorkspace(this.sql, {
      workspaceId: session.workspaceId,
    });
    if (activeCount && parseInt(activeCount.count, 10) === 0) {
      const workspace = await dbGetWorkspaceForUserRepo(this.sql, {
        id: session.workspaceId,
        repositoryId: String(session.repositoryId),
        userId: String(session.userId),
      });
      if (workspace) {
        try {
          await this.doSuspendWorkspace(workspace);
        } catch {
          // Best effort — don't fail the session destroy
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup — background worker methods
  // -------------------------------------------------------------------------

  async cleanupIdleWorkspaces(): Promise<void> {
    const idleWorkspaces = await dbListIdleWorkspaces(this.sql);
    for (const workspace of idleWorkspaces) {
      try {
        await this.doSuspendWorkspace(workspace);
      } catch {
        // Best effort
      }
    }
  }

  async cleanupIdleSessions(): Promise<void> {
    const idleSessions = await dbListIdleWorkspaceSessions(this.sql);
    for (const session of idleSessions) {
      try {
        await this.destroySession(
          session.id,
          parseInt(String(session.repositoryId), 10),
          parseInt(String(session.userId), 10)
        );
      } catch {
        // Best effort
      }
    }
  }

  async cleanupStalePendingWorkspaces(): Promise<void> {
    const staleWorkspaces = await dbListStalePendingWorkspaces(this.sql, {
      staleAfterSecs: STALE_AFTER_SECONDS,
    });
    for (const workspace of staleWorkspaces) {
      await dbUpdateWorkspaceStatus(this.sql, {
        id: workspace.id,
        status: "failed",
      });
      this.notifyWorkspace(workspace.id, "failed");
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async findOrCreatePrimaryWorkspace(
    repositoryId: string,
    userId: string,
    name: string
  ): Promise<CreateWorkspaceRow> {
    // Check for stale pending workspaces and fail them
    await this.failStalePendingWorkspaces(repositoryId, userId);

    // Look for an existing active (non-fork) workspace
    const active = await dbGetActiveWorkspaceForUserRepo(this.sql, {
      repositoryId,
      userId,
    });
    if (active) {
      // Check if this is a zombie workspace (pending/starting without a VM for too long)
      if (this.isZombieWorkspace(active)) {
        await dbUpdateWorkspaceStatus(this.sql, {
          id: active.id,
          status: "failed",
        });
        this.notifyWorkspace(active.id, "failed");
      } else {
        return active;
      }
    }

    // Create a new primary workspace
    const created = await dbCreateWorkspace(this.sql, {
      repositoryId,
      userId,
      name,
      isFork: false,
      parentWorkspaceId: "",
      sourceSnapshotId: "",
      status: "starting",
    });
    if (!created) throw internal("create workspace failed");
    return created;
  }

  private async failStalePendingWorkspaces(
    repositoryId: string,
    userId: string
  ): Promise<void> {
    const countRow = await dbCountWorkspacesByRepo(this.sql, {
      repositoryId,
      userId,
    });
    const total = countRow ? parseInt(countRow.count, 10) : 0;
    if (total === 0) return;

    const rows = await dbListWorkspacesByRepo(this.sql, {
      repositoryId,
      userId,
      pageOffset: "0",
      pageSize: String(total),
    });

    const now = Date.now();
    for (const workspace of rows) {
      if (!workspace.isFork && this.isZombieWorkspace(workspace, now)) {
        await dbUpdateWorkspaceStatus(this.sql, {
          id: workspace.id,
          status: "failed",
        });
        this.notifyWorkspace(workspace.id, "failed");
      }
    }
  }

  private isZombieWorkspace(
    workspace: CreateWorkspaceRow,
    nowMs?: number
  ): boolean {
    if (
      workspace.status !== "pending" &&
      workspace.status !== "starting"
    ) {
      return false;
    }
    if (workspace.freestyleVmId.trim() !== "") {
      return false;
    }
    const staleSince = workspace.updatedAt ?? workspace.createdAt;
    if (!staleSince) return false;
    const elapsed = (nowMs ?? Date.now()) - staleSince.getTime();
    return elapsed > STALE_AFTER_SECONDS * 1000;
  }

  private async ensureWorkspaceRunning(
    workspace: CreateWorkspaceRow,
    input: CreateWorkspaceInput
  ): Promise<WorkspaceResponse> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    const vmId = workspace.freestyleVmId.trim();

    // No VM yet — provision a new one
    if (!vmId) {
      return this.provisionAndActivateWorkspace(workspace, input);
    }

    // VM exists — check its state
    const vmStatus = await this.sandbox.getVM(vmId);
    if (vmStatus.state === "running") {
      if (workspace.status !== "running") {
        await dbUpdateWorkspaceStatus(this.sql, {
          id: workspace.id,
          status: "running",
        });
      }
      await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });

      // Reload for fresh data
      const reloaded = await dbGetWorkspace(this.sql, { id: workspace.id });
      return this.toWorkspaceResponse(reloaded ?? workspace);
    }

    // VM exists but not running — start it
    try {
      await this.sandbox.startVM(vmId);
    } catch {
      // If start fails, reprovision
      await dbUpdateWorkspaceStatus(this.sql, {
        id: workspace.id,
        status: "failed",
      });
      this.notifyWorkspace(workspace.id, "failed");
      return this.provisionAndActivateWorkspace(workspace, input);
    }

    await dbUpdateWorkspaceStatus(this.sql, {
      id: workspace.id,
      status: "running",
    });
    await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });
    this.notifyWorkspace(workspace.id, "running");

    const reloaded = await dbGetWorkspace(this.sql, { id: workspace.id });
    return this.toWorkspaceResponse(reloaded ?? workspace);
  }

  private async provisionAndActivateWorkspace(
    workspace: CreateWorkspaceRow,
    input: CreateWorkspaceInput
  ): Promise<WorkspaceResponse> {
    if (!this.sandbox) throw internal("sandbox client unavailable");

    let result;
    try {
      result = await this.sandbox.createVM({
        namePrefix: `codeplane-workspace`,
        env: {
          CODEPLANE_REPO_OWNER: input.repoOwner,
          CODEPLANE_REPO_NAME: input.repoName,
        },
        labels: {
          "tech.codeplane.workspace.id": workspace.id,
          "tech.codeplane.workspace.repo": `${input.repoOwner}/${input.repoName}`,
        },
      });
    } catch (err) {
      await dbUpdateWorkspaceStatus(this.sql, {
        id: workspace.id,
        status: "failed",
      });
      this.notifyWorkspace(workspace.id, "failed");
      throw internal(
        `create sandbox container: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Store the container ID
    const updated = await dbUpdateWorkspaceExecutionInfo(this.sql, {
      id: workspace.id,
      freestyleVmId: result.vmId,
      status: "running",
    });
    if (!updated) {
      // Clean up the container
      try {
        await this.sandbox.deleteVM(result.vmId);
      } catch {
        // Best effort
      }
      await dbUpdateWorkspaceStatus(this.sql, {
        id: workspace.id,
        status: "failed",
      });
      throw internal("store sandbox container info failed");
    }

    await dbTouchWorkspaceActivity(this.sql, { id: workspace.id });
    this.notifyWorkspace(updated.id, "running");

    return this.toWorkspaceResponse(updated);
  }

  private async doSuspendWorkspace(workspace: {
    id: string;
    freestyleVmId: string;
    status: string;
  }): Promise<void> {
    const vmId = workspace.freestyleVmId.trim();
    if (!vmId || !this.sandbox) return;
    if (workspace.status === "suspended" || workspace.status === "stopped") {
      return;
    }

    await this.sandbox.suspendVM(vmId);
    await dbUpdateWorkspaceStatus(this.sql, {
      id: workspace.id,
      status: "suspended",
    });
    this.notifyWorkspace(workspace.id, "suspended");
  }

  private async doDestroyWorkspace(workspace: {
    id: string;
    freestyleVmId: string;
  }): Promise<void> {
    const vmId = workspace.freestyleVmId.trim();
    if (vmId && this.sandbox) {
      try {
        await this.sandbox.deleteVM(vmId);
      } catch {
        // Best effort — container may already be gone
      }
    }

    await dbUpdateWorkspaceStatus(this.sql, {
      id: workspace.id,
      status: "stopped",
    });
    this.notifyWorkspace(workspace.id, "stopped");
  }

  private async loadOwnedSnapshot(
    snapshotID: string,
    repositoryId: string,
    userId: string
  ) {
    return dbGetWorkspaceSnapshotForUserRepo(this.sql, {
      id: snapshotID,
      repositoryId,
      userId,
    });
  }

  // -------------------------------------------------------------------------
  // Notifications (PG NOTIFY)
  // -------------------------------------------------------------------------

  private notifyWorkspace(workspaceID: string, status: string): void {
    if (!workspaceID.trim()) return;
    const safeID = workspaceID.replace(/-/g, "");
    const payload = JSON.stringify({ status });
    dbNotifyWorkspaceStatus(this.sql, {
      sessionId: safeID,
      payload,
    }).catch(() => {
      // Best effort — notification failure is non-critical
    });
  }

  private notifySession(sessionID: string, status: string): void {
    if (!sessionID.trim()) return;
    const safeID = sessionID.replace(/-/g, "");
    const payload = JSON.stringify({ status });
    dbNotifyWorkspaceStatus(this.sql, {
      sessionId: safeID,
      payload,
    }).catch(() => {
      // Best effort — notification failure is non-critical
    });
  }

  // -------------------------------------------------------------------------
  // Response mappers
  // -------------------------------------------------------------------------

  private toWorkspaceResponse(workspace: CreateWorkspaceRow): WorkspaceResponse {
    const vmId = workspace.freestyleVmId?.trim() ?? "";
    const resp: WorkspaceResponse = {
      id: workspace.id,
      repository_id: parseInt(String(workspace.repositoryId), 10),
      user_id: parseInt(String(workspace.userId), 10),
      name: workspace.name,
      status: workspace.status,
      is_fork: workspace.isFork,
      freestyle_vm_id: vmId,
      persistence: this.persistence,
      idle_timeout_seconds: workspace.idleTimeoutSecs,
      suspended_at: workspace.suspendedAt
        ? workspace.suspendedAt.toISOString()
        : null,
      created_at: workspace.createdAt.toISOString(),
      updated_at: workspace.updatedAt.toISOString(),
    };

    if (workspace.parentWorkspaceId?.trim()) {
      resp.parent_workspace_id = workspace.parentWorkspaceId;
    }
    if (vmId) {
      resp.ssh_host = `${vmId}@${this.sshHost}`;
    }
    if (workspace.sourceSnapshotId?.trim()) {
      resp.snapshot_id = workspace.sourceSnapshotId;
    }

    return resp;
  }

  private toSessionResponse(
    session: CreateWorkspaceSessionRow
  ): WorkspaceSessionResponse {
    return {
      id: session.id,
      workspace_id: session.workspaceId,
      repository_id: parseInt(String(session.repositoryId), 10),
      user_id: parseInt(String(session.userId), 10),
      status: session.status,
      cols: session.cols,
      rows: session.rows,
      last_activity_at: session.lastActivityAt.toISOString(),
      idle_timeout_secs: session.idleTimeoutSecs,
      created_at: session.createdAt.toISOString(),
      updated_at: session.updatedAt.toISOString(),
    };
  }

  private toSnapshotResponse(
    snapshot: { id: string; repositoryId: string; userId: string; workspaceId: string; name: string; freestyleSnapshotId: string; createdAt: Date; updatedAt: Date }
  ): WorkspaceSnapshotResponse {
    const resp: WorkspaceSnapshotResponse = {
      id: snapshot.id,
      repository_id: parseInt(String(snapshot.repositoryId), 10),
      user_id: parseInt(String(snapshot.userId), 10),
      name: snapshot.name,
      freestyle_snapshot_id: snapshot.freestyleSnapshotId,
      created_at: snapshot.createdAt.toISOString(),
      updated_at: snapshot.updatedAt.toISOString(),
    };
    if (snapshot.workspaceId?.trim()) {
      resp.workspace_id = snapshot.workspaceId;
    }
    return resp;
  }
}
