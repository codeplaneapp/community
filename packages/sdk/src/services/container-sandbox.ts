// ContainerSandboxClient — Docker/Podman-based workspace container manager
//
// This is the OSS Community Edition replacement for the proprietary Freestyle
// VM service used in JJHub Cloud. It maps the Freestyle VM lifecycle operations
// onto Docker/Podman container commands using Bun.spawn().
//
// Limitations vs JJHub Cloud (Freestyle/Firecracker):
//   - No memory snapshots — suspend is docker stop, resume is docker start (cold)
//   - No VM forking — returns an explicit error directing users to JJHub Cloud
//   - No microVM isolation — containers share the host kernel

import { randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Container runtime: docker or podman. */
export type ContainerRuntime = "docker" | "podman";

/** Current state of a sandbox container. */
export type ContainerState =
  | "creating"
  | "running"
  | "stopped"
  | "removing"
  | "not_found";

/** Port mapping for a workspace container. */
export interface PortMapping {
  /** Host port (0 = auto-assign). */
  hostPort: number;
  /** Container port. */
  containerPort: number;
  /** Protocol (default: tcp). */
  protocol?: "tcp" | "udp";
}

/** Volume mount for a workspace container. */
export interface VolumeMount {
  /** Host path or named volume. */
  source: string;
  /** Mount path inside the container. */
  target: string;
  /** Read-only mount. */
  readonly?: boolean;
}

/** Configuration for creating a new workspace container. */
export interface CreateContainerConfig {
  /** Workspace image (default: ghcr.io/jjhub-ai/workspace:latest). */
  image?: string;
  /** Container name prefix (will have random suffix appended). */
  namePrefix?: string;
  /** Environment variables to inject. */
  env?: Record<string, string>;
  /** Port mappings. */
  ports?: PortMapping[];
  /** Volume mounts. */
  volumes?: VolumeMount[];
  /** Working directory inside the container. */
  workdir?: string;
  /** Command to run (overrides image CMD). */
  command?: string[];
  /** Memory limit (e.g. "2g", "512m"). */
  memoryLimit?: string;
  /** CPU limit (e.g. "2.0" for 2 cores). */
  cpuLimit?: string;
  /** Labels to apply to the container. */
  labels?: Record<string, string>;
  /** SSH port inside the container (default: 22). */
  sshPort?: number;
  /** Healthcheck command (default: checks SSH port). */
  healthcheckCmd?: string;
  /** Healthcheck interval in seconds (default: 5). */
  healthcheckIntervalSecs?: number;
  /** Maximum time in seconds to wait for container to become healthy (default: 120). */
  healthcheckTimeoutSecs?: number;
}

/** Result of creating a container. */
export interface CreateContainerResult {
  /** Container ID (docker container ID). */
  vmId: string;
  /** Container name. */
  name: string;
  /** Mapped ports (host -> container). */
  ports: PortMapping[];
}

/** Container status information. */
export interface ContainerStatus {
  /** Container ID. */
  vmId: string;
  /** Container name. */
  name: string;
  /** Current state. */
  state: ContainerState;
  /** Whether the container is running. */
  running: boolean;
  /** Container health status (if healthcheck configured). */
  health?: string;
  /** Mapped ports. */
  ports: PortMapping[];
  /** Container creation time. */
  createdAt?: string;
  /** Container start time. */
  startedAt?: string;
}

/** Result of executing a command in a container. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** SSH connection info for a workspace container. */
export interface SSHConnectionInfo {
  host: string;
  port: number;
  username: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_IMAGE = "ghcr.io/jjhub-ai/workspace:latest";
const DEFAULT_SSH_PORT = 22;
const DEFAULT_HEALTHCHECK_INTERVAL_SECS = 5;
const DEFAULT_HEALTHCHECK_TIMEOUT_SECS = 120;
const CONTAINER_LABEL_PREFIX = "tech.jjhub.workspace";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a shell command via Bun.spawn and collect output. */
async function run(
  cmd: string[],
  options?: { stdin?: string; timeoutMs?: number }
): Promise<ExecResult> {
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: options?.stdin ? "pipe" : undefined,
  });

  if (options?.stdin && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

  const timeoutMs = options?.timeoutMs ?? 300_000; // 5 min default
  const exitCode = await Promise.race([
    proc.exited,
    new Promise<number>((_, reject) =>
      setTimeout(
        () => reject(new Error(`command timed out after ${timeoutMs}ms: ${cmd.join(" ")}`)),
        timeoutMs
      )
    ),
  ]);

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();

  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/** Generate a short random suffix for container names. */
function randomSuffix(): string {
  return randomBytes(4).toString("hex");
}

// ---------------------------------------------------------------------------
// ContainerSandboxClient
// ---------------------------------------------------------------------------

export class ContainerSandboxClient {
  private runtime: ContainerRuntime;
  private sshProxyHost: string;

  private constructor(runtime: ContainerRuntime, sshProxyHost: string) {
    this.runtime = runtime;
    this.sshProxyHost = sshProxyHost;
  }

  /**
   * Create a new ContainerSandboxClient.
   *
   * Auto-detects whether docker or podman is available on the system.
   * Throws if neither is found.
   *
   * @param sshProxyHost - Hostname for SSH proxy connections (default: "localhost")
   */
  static async create(sshProxyHost = "localhost"): Promise<ContainerSandboxClient> {
    const runtime = await detectRuntime();
    return new ContainerSandboxClient(runtime, sshProxyHost);
  }

  /**
   * Create a new ContainerSandboxClient with a specific runtime.
   *
   * @param runtime - "docker" or "podman"
   * @param sshProxyHost - Hostname for SSH proxy connections (default: "localhost")
   */
  static withRuntime(
    runtime: ContainerRuntime,
    sshProxyHost = "localhost"
  ): ContainerSandboxClient {
    return new ContainerSandboxClient(runtime, sshProxyHost);
  }

  // -------------------------------------------------------------------------
  // createVM — docker run
  // -------------------------------------------------------------------------

  /**
   * Create and start a new workspace container.
   *
   * Pulls the image if needed, runs the container with the specified
   * configuration, and waits for it to become healthy.
   */
  async createVM(config: CreateContainerConfig = {}): Promise<CreateContainerResult> {
    const image = config.image ?? DEFAULT_IMAGE;
    const sshPort = config.sshPort ?? DEFAULT_SSH_PORT;
    const namePrefix = config.namePrefix ?? "jjhub-workspace";
    const containerName = `${namePrefix}-${randomSuffix()}`;

    // Pull image (best effort — may already exist locally)
    await run([this.runtime, "pull", image], { timeoutMs: 600_000 }).catch(() => {
      // Image might be local-only, continue
    });

    // Build docker run args
    const args: string[] = [
      this.runtime,
      "run",
      "-d",
      "--name",
      containerName,
    ];

    // Labels
    args.push("--label", `${CONTAINER_LABEL_PREFIX}=true`);
    args.push("--label", `${CONTAINER_LABEL_PREFIX}.name=${containerName}`);
    if (config.labels) {
      for (const [key, value] of Object.entries(config.labels)) {
        args.push("--label", `${key}=${value}`);
      }
    }

    // Environment variables
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Port mappings
    const portMappings: PortMapping[] = [];
    if (config.ports) {
      for (const pm of config.ports) {
        const proto = pm.protocol ?? "tcp";
        if (pm.hostPort === 0) {
          args.push("-p", `${pm.containerPort}/${proto}`);
        } else {
          args.push("-p", `${pm.hostPort}:${pm.containerPort}/${proto}`);
        }
        portMappings.push(pm);
      }
    }

    // Always expose SSH port if not already mapped
    const sshAlreadyMapped = portMappings.some(
      (p) => p.containerPort === sshPort
    );
    if (!sshAlreadyMapped) {
      args.push("-p", `${sshPort}/tcp`);
      portMappings.push({ hostPort: 0, containerPort: sshPort });
    }

    // Volume mounts
    if (config.volumes) {
      for (const vol of config.volumes) {
        const mountStr = vol.readonly
          ? `${vol.source}:${vol.target}:ro`
          : `${vol.source}:${vol.target}`;
        args.push("-v", mountStr);
      }
    }

    // Working directory
    if (config.workdir) {
      args.push("-w", config.workdir);
    }

    // Resource limits
    if (config.memoryLimit) {
      args.push("--memory", config.memoryLimit);
    }
    if (config.cpuLimit) {
      args.push("--cpus", config.cpuLimit);
    }

    // Healthcheck
    const healthCmd =
      config.healthcheckCmd ??
      `ss -tlnp | grep -q ':${sshPort}' || exit 1`;
    const healthInterval =
      config.healthcheckIntervalSecs ?? DEFAULT_HEALTHCHECK_INTERVAL_SECS;
    args.push(
      "--health-cmd",
      healthCmd,
      "--health-interval",
      `${healthInterval}s`,
      "--health-retries",
      "10",
      "--health-start-period",
      "5s"
    );

    // Image and optional command
    args.push(image);
    if (config.command && config.command.length > 0) {
      args.push(...config.command);
    }

    const result = await run(args);
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to create container: ${result.stderr || result.stdout}`
      );
    }

    const containerId = result.stdout.slice(0, 64); // docker returns full SHA

    // Wait for healthy
    const timeoutSecs =
      config.healthcheckTimeoutSecs ?? DEFAULT_HEALTHCHECK_TIMEOUT_SECS;
    await this.waitForHealthy(containerId, timeoutSecs);

    // Resolve actual port mappings
    const resolvedPorts = await this.resolvePortMappings(containerId);

    return {
      vmId: containerId,
      name: containerName,
      ports: resolvedPorts,
    };
  }

  // -------------------------------------------------------------------------
  // suspendVM — docker stop
  // -------------------------------------------------------------------------

  /**
   * Suspend (stop) a workspace container.
   *
   * The container filesystem is preserved but memory state is lost.
   * This is the OSS equivalent of Freestyle's VM suspend — without memory
   * snapshots, resume will be a cold start.
   */
  async suspendVM(vmId: string): Promise<{ vmId: string; suspendedAt: string }> {
    const result = await run([this.runtime, "stop", vmId]);
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to stop container ${vmId}: ${result.stderr || result.stdout}`
      );
    }

    return {
      vmId,
      suspendedAt: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // startVM — docker start
  // -------------------------------------------------------------------------

  /**
   * Start (resume) a stopped workspace container.
   *
   * This is a cold start — the container's filesystem is intact but memory
   * state from before the stop is gone. This is the key OSS limitation
   * compared to Freestyle's Firecracker snapshot-based resume.
   */
  async startVM(
    vmId: string,
    healthcheckTimeoutSecs = DEFAULT_HEALTHCHECK_TIMEOUT_SECS
  ): Promise<{ vmId: string; ports: PortMapping[] }> {
    const result = await run([this.runtime, "start", vmId]);
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to start container ${vmId}: ${result.stderr || result.stdout}`
      );
    }

    await this.waitForHealthy(vmId, healthcheckTimeoutSecs);
    const ports = await this.resolvePortMappings(vmId);

    return { vmId, ports };
  }

  // -------------------------------------------------------------------------
  // deleteVM — docker rm
  // -------------------------------------------------------------------------

  /**
   * Delete a workspace container and optionally its associated volumes.
   */
  async deleteVM(vmId: string, removeVolumes = true): Promise<void> {
    // Force stop if running
    await run([this.runtime, "stop", vmId]).catch(() => {
      // Might already be stopped
    });

    const args = [this.runtime, "rm"];
    if (removeVolumes) {
      args.push("-v");
    }
    args.push("--force", vmId);

    const result = await run(args);
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to remove container ${vmId}: ${result.stderr || result.stdout}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // forkVM — NOT SUPPORTED
  // -------------------------------------------------------------------------

  /**
   * Fork a workspace container.
   *
   * This operation is NOT supported in the OSS Community Edition.
   * Workspace forking requires Firecracker VM snapshots which are only
   * available in JJHub Cloud.
   */
  async forkVM(_sourceVmId: string): Promise<never> {
    throw new Error(
      "workspace forking requires JJHub Cloud — " +
        "container-based workspaces cannot fork a running VM's memory state. " +
        "Use createVM() to create an independent workspace instead."
    );
  }

  // -------------------------------------------------------------------------
  // exec — docker exec
  // -------------------------------------------------------------------------

  /**
   * Execute a command inside a running workspace container.
   */
  async exec(
    vmId: string,
    command: string | string[],
    options?: { timeoutMs?: number; workdir?: string; env?: Record<string, string> }
  ): Promise<ExecResult> {
    const args: string[] = [this.runtime, "exec"];

    if (options?.workdir) {
      args.push("-w", options.workdir);
    }
    if (options?.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push(vmId);

    if (typeof command === "string") {
      args.push("sh", "-c", command);
    } else {
      args.push(...command);
    }

    return run(args, { timeoutMs: options?.timeoutMs });
  }

  // -------------------------------------------------------------------------
  // writeFile — docker exec with stdin
  // -------------------------------------------------------------------------

  /**
   * Write a file inside a running workspace container.
   *
   * Uses `docker exec` with `tee` to pipe content via stdin.
   */
  async writeFile(vmId: string, path: string, content: string): Promise<void> {
    // Ensure parent directory exists
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir) {
      await run([this.runtime, "exec", vmId, "mkdir", "-p", dir]);
    }

    const result = await run(
      [this.runtime, "exec", "-i", vmId, "tee", path],
      { stdin: content }
    );
    if (result.exitCode !== 0) {
      throw new Error(
        `failed to write file ${path} in container ${vmId}: ${result.stderr}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // getVM — docker inspect
  // -------------------------------------------------------------------------

  /**
   * Get the current status of a workspace container.
   */
  async getVM(vmId: string): Promise<ContainerStatus> {
    const result = await run([
      this.runtime,
      "inspect",
      "--format",
      '{{json .}}',
      vmId,
    ]);

    if (result.exitCode !== 0) {
      return {
        vmId,
        name: "",
        state: "not_found",
        running: false,
        ports: [],
      };
    }

    const info = JSON.parse(result.stdout);
    const stateObj = info.State ?? {};
    const name = (info.Name ?? "").replace(/^\//, "");

    let state: ContainerState = "stopped";
    if (stateObj.Running) {
      state = "running";
    } else if (stateObj.Restarting) {
      state = "creating";
    } else if (stateObj.Dead || stateObj.OOMKilled) {
      state = "stopped";
    }

    const ports = await this.resolvePortMappings(vmId).catch(() => []);

    return {
      vmId,
      name,
      state,
      running: stateObj.Running ?? false,
      health: stateObj.Health?.Status,
      ports,
      createdAt: info.Created,
      startedAt: stateObj.StartedAt,
    };
  }

  // -------------------------------------------------------------------------
  // getSSHConnectionInfo — return SSH proxy info
  // -------------------------------------------------------------------------

  /**
   * Get SSH connection info for a running workspace container.
   *
   * Returns the host/port needed to SSH into the container's exposed
   * SSH port.
   */
  async getSSHConnectionInfo(
    vmId: string,
    username = "root"
  ): Promise<SSHConnectionInfo> {
    const ports = await this.resolvePortMappings(vmId);
    const sshMapping = ports.find((p) => p.containerPort === DEFAULT_SSH_PORT);

    if (!sshMapping) {
      throw new Error(
        `no SSH port mapping found for container ${vmId} — ` +
          `ensure port ${DEFAULT_SSH_PORT} is exposed`
      );
    }

    return {
      host: this.sshProxyHost,
      port: sshMapping.hostPort,
      username,
    };
  }

  // -------------------------------------------------------------------------
  // Utility methods
  // -------------------------------------------------------------------------

  /** Return the detected container runtime. */
  getRuntime(): ContainerRuntime {
    return this.runtime;
  }

  /**
   * List all workspace containers managed by this client.
   */
  async listContainers(): Promise<ContainerStatus[]> {
    const result = await run([
      this.runtime,
      "ps",
      "-a",
      "--filter",
      `label=${CONTAINER_LABEL_PREFIX}=true`,
      "--format",
      "{{.ID}}",
    ]);

    if (result.exitCode !== 0 || !result.stdout) {
      return [];
    }

    const ids = result.stdout.split("\n").filter(Boolean);
    const statuses: ContainerStatus[] = [];
    for (const id of ids) {
      statuses.push(await this.getVM(id));
    }
    return statuses;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Wait for a container to report healthy status.
   */
  private async waitForHealthy(
    vmId: string,
    timeoutSecs: number
  ): Promise<void> {
    const deadline = Date.now() + timeoutSecs * 1000;
    const pollIntervalMs = 2000;

    while (Date.now() < deadline) {
      const result = await run([
        this.runtime,
        "inspect",
        "--format",
        "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{if .State.Running}}running{{else}}stopped{{end}}{{end}}",
        vmId,
      ]);

      const status = result.stdout.trim();
      if (status === "healthy" || status === "running") {
        return;
      }
      if (status === "unhealthy") {
        throw new Error(
          `container ${vmId} became unhealthy — check container logs with: ${this.runtime} logs ${vmId}`
        );
      }

      await Bun.sleep(pollIntervalMs);
    }

    throw new Error(
      `container ${vmId} did not become healthy within ${timeoutSecs}s`
    );
  }

  /**
   * Resolve the actual host port mappings for a container.
   */
  private async resolvePortMappings(vmId: string): Promise<PortMapping[]> {
    const result = await run([
      this.runtime,
      "inspect",
      "--format",
      "{{json .NetworkSettings.Ports}}",
      vmId,
    ]);

    if (result.exitCode !== 0 || !result.stdout || result.stdout === "null") {
      return [];
    }

    // Docker format: { "22/tcp": [{ "HostIp": "0.0.0.0", "HostPort": "32768" }] }
    const portsMap: Record<string, Array<{ HostIp: string; HostPort: string }> | null> =
      JSON.parse(result.stdout);

    const mappings: PortMapping[] = [];
    for (const [containerSpec, hostBindings] of Object.entries(portsMap)) {
      if (!hostBindings || hostBindings.length === 0) continue;

      const [portStr, proto] = containerSpec.split("/");
      const containerPort = parseInt(portStr, 10);
      const hostPort = parseInt(hostBindings[0].HostPort, 10);

      if (!isNaN(containerPort) && !isNaN(hostPort)) {
        mappings.push({
          hostPort,
          containerPort,
          protocol: (proto as "tcp" | "udp") ?? "tcp",
        });
      }
    }

    return mappings;
  }
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

/**
 * Detect whether docker or podman is available on the system.
 * Prefers docker if both are present.
 */
async function detectRuntime(): Promise<ContainerRuntime> {
  // Try docker first
  try {
    const dockerResult = await run(["docker", "info"], { timeoutMs: 10_000 });
    if (dockerResult.exitCode === 0) {
      return "docker";
    }
  } catch {
    // docker not available
  }

  // Try podman
  try {
    const podmanResult = await run(["podman", "info"], { timeoutMs: 10_000 });
    if (podmanResult.exitCode === 0) {
      return "podman";
    }
  } catch {
    // podman not available
  }

  throw new Error(
    "no container runtime found — install docker or podman to use workspace containers. " +
      "See https://docs.docker.com/get-docker/ or https://podman.io/getting-started/installation"
  );
}
