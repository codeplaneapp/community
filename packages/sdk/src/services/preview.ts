/**
 * PreviewService — Landing Request preview environment manager
 *
 * Manages preview environments for Landing Requests in JJHub Community Edition.
 * Preview environments are workspaces that are automatically created when a
 * Landing Request is opened (if .jjhub/preview.ts exists), run the preview
 * configuration, and expose the result on a URL.
 *
 * CE Mode: Preview proxy runs in-process. Routes incoming requests by
 * Host header or path prefix to the preview container's exposed port.
 *
 * Lifecycle:
 *   1. Auto-create workspace when LR is opened (if .jjhub/preview.ts exists)
 *   2. Run preview config (install, start, expose port)
 *   3. Generate preview URL: {lr-number}-{repo}.preview.jjhub.tech (cloud)
 *      or localhost:{port} (CE)
 *   4. Auto-suspend when idle (no HTTP requests for 15 min)
 *   5. Auto-resume when preview URL is accessed
 *   6. Delete when LR is landed or closed
 */

import type { Sql } from "postgres";
import {
  APIError,
  notFound,
  internal,
  conflict,
  badRequest,
} from "../lib/errors";
import type { ContainerSandboxClient, PortMapping } from "./container-sandbox";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default idle timeout for preview environments (15 minutes). */
const PREVIEW_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Default port for preview services when not specified in config. */
const DEFAULT_PREVIEW_PORT = 3000;

/** Label used to identify preview containers. */
const PREVIEW_LABEL_PREFIX = "tech.jjhub.preview";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status of a preview environment. */
export type PreviewStatus =
  | "starting"
  | "running"
  | "suspended"
  | "stopped"
  | "failed";

/** Configuration for a preview environment, parsed from .jjhub/preview.ts. */
export interface PreviewConfig {
  /** Port to expose as the preview URL. */
  port: number;
  /** Install command to run before starting. */
  install?: string;
  /** Start command for the preview server. */
  start: string;
  /** Environment variables for the preview. */
  env?: Record<string, string>;
}

/** Response from preview operations. */
export interface PreviewResponse {
  /** Unique preview identifier (composite of repo + LR number). */
  id: string;
  /** Repository ID. */
  repository_id: number;
  /** Landing Request number. */
  lr_number: number;
  /** Current status. */
  status: PreviewStatus;
  /** Preview URL (host-based for cloud, localhost:port for CE). */
  url: string;
  /** Container/VM ID backing this preview. */
  container_id: string;
  /** The port the preview service is running on inside the container. */
  container_port: number;
  /** The host port mapped to the container port. */
  host_port: number;
  /** When the preview was last accessed. */
  last_accessed_at: string;
  /** When the preview was created. */
  created_at: string;
}

/** In-memory record of a running preview. */
interface PreviewRecord {
  id: string;
  repositoryId: number;
  lrNumber: number;
  repoOwner: string;
  repoName: string;
  status: PreviewStatus;
  containerId: string;
  containerPort: number;
  hostPort: number;
  lastAccessedAt: Date;
  createdAt: Date;
}

/** Input for creating a preview. */
export interface CreatePreviewInput {
  repositoryId: number;
  lrNumber: number;
  repoOwner: string;
  repoName: string;
  /** Optional preview config. If not provided, uses defaults. */
  config?: PreviewConfig;
}

// ---------------------------------------------------------------------------
// PreviewService
// ---------------------------------------------------------------------------

export class PreviewService {
  /**
   * In-memory store of active previews, keyed by "{repoId}:{lrNumber}".
   * In a production deployment this would be backed by a database table,
   * but for CE single-process mode, in-memory is sufficient and avoids
   * requiring a schema migration.
   */
  private previews = new Map<string, PreviewRecord>();

  /** Timer references for idle-suspend checks, keyed by preview key. */
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Base domain for preview URLs. */
  private previewDomain: string;

  /** Host for CE-mode previews (typically localhost). */
  private hostAddress: string;

  constructor(
    private readonly sql: Sql,
    private readonly sandbox: ContainerSandboxClient | null,
    options?: {
      /** Preview domain for cloud mode (e.g. "preview.jjhub.tech"). */
      previewDomain?: string;
      /** Host address for CE mode (default: "localhost"). */
      hostAddress?: string;
    }
  ) {
    this.previewDomain = options?.previewDomain ?? "";
    this.hostAddress = options?.hostAddress ?? "localhost";
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Create a preview environment for a Landing Request.
   *
   * Creates a new container, runs the install + start commands from the
   * preview config, and exposes the configured port. Returns the preview
   * status and URL.
   */
  async createPreview(input: CreatePreviewInput): Promise<PreviewResponse> {
    if (!this.sandbox) {
      throw internal("sandbox client unavailable — preview environments require a container runtime");
    }

    const key = this.previewKey(input.repositoryId, input.lrNumber);

    // Check if a preview already exists
    const existing = this.previews.get(key);
    if (existing && existing.status !== "stopped" && existing.status !== "failed") {
      // Preview exists and is active — return it after waking if suspended
      if (existing.status === "suspended") {
        return this.wakePreview(input.repositoryId, input.lrNumber);
      }
      return this.toPreviewResponse(existing);
    }

    const config = input.config ?? {
      port: DEFAULT_PREVIEW_PORT,
      start: "npm start",
    };

    const containerPort = config.port || DEFAULT_PREVIEW_PORT;

    // Build environment variables
    const env: Record<string, string> = {
      JJHUB_PREVIEW: "true",
      JJHUB_REPO_OWNER: input.repoOwner,
      JJHUB_REPO_NAME: input.repoName,
      JJHUB_LR_NUMBER: String(input.lrNumber),
      PORT: String(containerPort),
      ...(config.env ?? {}),
    };

    // Build the startup command that runs install then start
    const startupParts: string[] = [];
    if (config.install) {
      startupParts.push(config.install);
    }
    startupParts.push(config.start);
    const startupCommand = startupParts.join(" && ");

    // Create the container with the preview port exposed
    let result;
    try {
      result = await this.sandbox.createVM({
        namePrefix: `jjhub-preview-lr${input.lrNumber}`,
        env,
        ports: [
          { hostPort: 0, containerPort, protocol: "tcp" },
        ],
        labels: {
          [`${PREVIEW_LABEL_PREFIX}`]: "true",
          [`${PREVIEW_LABEL_PREFIX}.repo`]: `${input.repoOwner}/${input.repoName}`,
          [`${PREVIEW_LABEL_PREFIX}.lr`]: String(input.lrNumber),
        },
        // Healthcheck on the preview port instead of SSH
        healthcheckCmd: `ss -tlnp | grep -q ':${containerPort}' || exit 1`,
        healthcheckIntervalSecs: 5,
        healthcheckTimeoutSecs: 120,
      });
    } catch (err) {
      throw internal(
        `create preview container: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Resolve the mapped host port for the preview service
    const previewPortMapping = result.ports.find(
      (p: PortMapping) => p.containerPort === containerPort
    );
    const hostPort = previewPortMapping?.hostPort ?? 0;

    // Execute the install + start command inside the container
    try {
      // Run in the background — the command starts the dev server which stays running
      await this.sandbox.exec(result.vmId, `sh -c 'nohup sh -c "${startupCommand}" > /tmp/preview.log 2>&1 &'`, {
        timeoutMs: 60_000,
      });
    } catch (err) {
      // Non-fatal: the container is running, the command may just take time
      console.warn(
        `Preview startup command may have issues for LR #${input.lrNumber}:`,
        err instanceof Error ? err.message : String(err)
      );
    }

    const now = new Date();
    const record: PreviewRecord = {
      id: key,
      repositoryId: input.repositoryId,
      lrNumber: input.lrNumber,
      repoOwner: input.repoOwner,
      repoName: input.repoName,
      status: "running",
      containerId: result.vmId,
      containerPort,
      hostPort,
      lastAccessedAt: now,
      createdAt: now,
    };

    this.previews.set(key, record);
    this.scheduleIdleCheck(key);

    return this.toPreviewResponse(record);
  }

  /**
   * Get the current preview status for a Landing Request.
   *
   * Returns null if no preview exists for this LR.
   */
  async getPreview(
    repositoryId: number,
    lrNumber: number
  ): Promise<PreviewResponse | null> {
    const key = this.previewKey(repositoryId, lrNumber);
    const record = this.previews.get(key);
    if (!record) return null;

    // Refresh container status from the runtime
    if (this.sandbox && record.containerId) {
      try {
        const status = await this.sandbox.getVM(record.containerId);
        if (status.state === "not_found") {
          record.status = "stopped";
        } else if (status.state === "running" && record.status === "suspended") {
          // Container was resumed externally
          record.status = "running";
        } else if (status.state === "stopped" && record.status === "running") {
          record.status = "suspended";
        }
      } catch {
        // Best effort status refresh
      }
    }

    return this.toPreviewResponse(record);
  }

  /**
   * Delete a preview environment for a Landing Request.
   *
   * Stops and removes the container and cleans up all internal state.
   * Called when a LR is landed or closed.
   */
  async deletePreview(
    repositoryId: number,
    lrNumber: number
  ): Promise<void> {
    const key = this.previewKey(repositoryId, lrNumber);
    const record = this.previews.get(key);
    if (!record) return;

    // Clear idle timer
    this.clearIdleTimer(key);

    // Destroy the container
    if (this.sandbox && record.containerId) {
      try {
        await this.sandbox.deleteVM(record.containerId);
      } catch {
        // Best effort — container may already be gone
      }
    }

    record.status = "stopped";
    this.previews.delete(key);
  }

  /**
   * Wake a suspended preview environment.
   *
   * Restarts the container and re-runs the start command. This is called
   * automatically when the preview URL is accessed while the preview is
   * suspended.
   */
  async wakePreview(
    repositoryId: number,
    lrNumber: number
  ): Promise<PreviewResponse> {
    if (!this.sandbox) {
      throw internal("sandbox client unavailable");
    }

    const key = this.previewKey(repositoryId, lrNumber);
    const record = this.previews.get(key);
    if (!record) {
      throw notFound("preview not found");
    }

    if (record.status === "running") {
      record.lastAccessedAt = new Date();
      this.scheduleIdleCheck(key);
      return this.toPreviewResponse(record);
    }

    if (!record.containerId) {
      throw conflict("preview container has not been provisioned");
    }

    // Start the container
    try {
      const startResult = await this.sandbox.startVM(record.containerId);

      // Re-resolve port mappings since they may change on restart
      const previewPortMapping = startResult.ports.find(
        (p: PortMapping) => p.containerPort === record.containerPort
      );
      if (previewPortMapping) {
        record.hostPort = previewPortMapping.hostPort;
      }
    } catch (err) {
      record.status = "failed";
      throw internal(
        `resume preview container: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    record.status = "running";
    record.lastAccessedAt = new Date();
    this.scheduleIdleCheck(key);

    return this.toPreviewResponse(record);
  }

  /**
   * Record a preview access (called by the reverse proxy on each request).
   *
   * Resets the idle timer and wakes suspended previews.
   */
  async recordAccess(
    repositoryId: number,
    lrNumber: number
  ): Promise<PreviewResponse | null> {
    const key = this.previewKey(repositoryId, lrNumber);
    const record = this.previews.get(key);
    if (!record) return null;

    if (record.status === "suspended") {
      return this.wakePreview(repositoryId, lrNumber);
    }

    record.lastAccessedAt = new Date();
    this.scheduleIdleCheck(key);
    return this.toPreviewResponse(record);
  }

  /**
   * Look up a preview by host header for reverse proxy routing.
   *
   * Parses the Host header to extract the LR number and repo name,
   * then returns the preview record if one exists.
   *
   * Expected format: {lr-number}-{repo}.preview.jjhub.tech
   * For CE: falls back to path-based lookup.
   */
  resolvePreviewByHost(host: string): PreviewRecord | null {
    if (!this.previewDomain || !host.endsWith(`.${this.previewDomain}`)) {
      return null;
    }

    // Strip the domain suffix to get "{lr-number}-{repo}"
    const prefix = host.slice(0, -(this.previewDomain.length + 1));
    const dashIdx = prefix.indexOf("-");
    if (dashIdx === -1) return null;

    const lrStr = prefix.slice(0, dashIdx);
    const repoName = prefix.slice(dashIdx + 1);
    const lrNumber = parseInt(lrStr, 10);
    if (isNaN(lrNumber)) return null;

    // Search for a matching preview by repo name and LR number
    for (const record of this.previews.values()) {
      if (record.lrNumber === lrNumber && record.repoName === repoName) {
        return record;
      }
    }
    return null;
  }

  /**
   * Look up a preview for reverse proxy routing by repo and LR number.
   *
   * Used for path-based routing in CE mode:
   *   /_preview/{owner}/{repo}/landings/{number}/* -> preview container
   */
  resolvePreviewByRepo(
    repoOwner: string,
    repoName: string,
    lrNumber: number
  ): PreviewRecord | null {
    for (const record of this.previews.values()) {
      if (
        record.repoOwner === repoOwner &&
        record.repoName === repoName &&
        record.lrNumber === lrNumber
      ) {
        return record;
      }
    }
    return null;
  }

  /**
   * Get the upstream target for a preview (host:port to proxy to).
   *
   * Returns null if no preview is found or the preview is not running.
   */
  getProxyTarget(
    repositoryId: number,
    lrNumber: number
  ): { host: string; port: number } | null {
    const key = this.previewKey(repositoryId, lrNumber);
    const record = this.previews.get(key);
    if (!record || record.status !== "running" || !record.hostPort) {
      return null;
    }
    return { host: this.hostAddress, port: record.hostPort };
  }

  /**
   * List all active previews. Useful for admin/debugging.
   */
  listPreviews(): PreviewResponse[] {
    const results: PreviewResponse[] = [];
    for (const record of this.previews.values()) {
      results.push(this.toPreviewResponse(record));
    }
    return results;
  }

  /**
   * Suspend all idle previews. Called by the cleanup scheduler.
   */
  async suspendIdlePreviews(): Promise<number> {
    let suspended = 0;
    const now = Date.now();

    for (const [key, record] of this.previews.entries()) {
      if (record.status !== "running") continue;
      const idleMs = now - record.lastAccessedAt.getTime();
      if (idleMs >= PREVIEW_IDLE_TIMEOUT_MS) {
        try {
          await this.suspendPreview(key, record);
          suspended++;
        } catch {
          // Best effort
        }
      }
    }

    return suspended;
  }

  /**
   * Clean up all previews. Called on server shutdown.
   */
  async cleanup(): Promise<void> {
    for (const [key] of this.previews) {
      this.clearIdleTimer(key);
    }
    // Intentionally do not stop containers on shutdown — they persist
    // and will be cleaned up when the LR is closed.
    this.previews.clear();
    this.idleTimers.clear();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private previewKey(repositoryId: number, lrNumber: number): string {
    return `${repositoryId}:${lrNumber}`;
  }

  private buildPreviewUrl(record: PreviewRecord): string {
    // Cloud mode: host-based URL
    if (this.previewDomain) {
      return `https://${record.lrNumber}-${record.repoName}.${this.previewDomain}`;
    }
    // CE mode: localhost with mapped port
    if (record.hostPort) {
      return `http://${this.hostAddress}:${record.hostPort}`;
    }
    return "";
  }

  private toPreviewResponse(record: PreviewRecord): PreviewResponse {
    return {
      id: record.id,
      repository_id: record.repositoryId,
      lr_number: record.lrNumber,
      status: record.status,
      url: this.buildPreviewUrl(record),
      container_id: record.containerId,
      container_port: record.containerPort,
      host_port: record.hostPort,
      last_accessed_at: record.lastAccessedAt.toISOString(),
      created_at: record.createdAt.toISOString(),
    };
  }

  private scheduleIdleCheck(key: string): void {
    this.clearIdleTimer(key);
    const timer = setTimeout(async () => {
      const record = this.previews.get(key);
      if (!record || record.status !== "running") return;

      const idleMs = Date.now() - record.lastAccessedAt.getTime();
      if (idleMs >= PREVIEW_IDLE_TIMEOUT_MS) {
        try {
          await this.suspendPreview(key, record);
        } catch {
          // Best effort
        }
      } else {
        // Re-schedule for the remaining idle time
        this.scheduleIdleCheck(key);
      }
    }, PREVIEW_IDLE_TIMEOUT_MS);

    this.idleTimers.set(key, timer);
  }

  private clearIdleTimer(key: string): void {
    const timer = this.idleTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(key);
    }
  }

  private async suspendPreview(
    key: string,
    record: PreviewRecord
  ): Promise<void> {
    if (!this.sandbox || !record.containerId) return;

    try {
      await this.sandbox.suspendVM(record.containerId);
      record.status = "suspended";
    } catch {
      // Container may already be stopped
      record.status = "suspended";
    }

    this.clearIdleTimer(key);
  }
}
