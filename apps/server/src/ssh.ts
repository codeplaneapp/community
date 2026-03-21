/**
 * SSH server integration for JJHub Community Edition.
 *
 * Starts the SSH server alongside the Hono HTTP server in the same process.
 * The SSH server handles git transport (clone/push/pull) and workspace
 * terminal access over SSH.
 *
 * Configuration via environment variables:
 *   JJHUB_SSH_PORT          — SSH listen port (default: 2222)
 *   JJHUB_SSH_HOST          — SSH bind host (default: 0.0.0.0)
 *   JJHUB_SSH_ENABLED       — Set to "false" to disable (default: true)
 *   JJHUB_SSH_MAX_CONNS     — Max concurrent SSH connections (default: 0 = unlimited)
 *   JJHUB_SSH_MAX_CONNS_IP  — Max connections per IP (default: 0 = unlimited)
 *   JJHUB_DATA_DIR          — Data directory for host keys (default: ./data)
 */

import {
  getDb,
  getRepoHostService,
  createSSHServer,
  type SSHServer,
} from "@jjhub/sdk";

let sshServer: SSHServer | null = null;

/**
 * Start the SSH server if enabled. Should be called after initDb() and
 * initServices().
 *
 * Returns the SSHServer instance or null if SSH is disabled.
 */
export async function startSSHServer(): Promise<SSHServer | null> {
  const enabled = process.env.JJHUB_SSH_ENABLED !== "false";
  if (!enabled) {
    console.log("SSH server disabled (JJHUB_SSH_ENABLED=false)");
    return null;
  }

  const db = getDb();
  const repoHost = getRepoHostService();

  // ContainerSandboxClient is optional — workspace SSH only works if
  // a container runtime is available. We try to create it but don't
  // fail if docker/podman isn't installed.
  let containerSandbox = null;
  try {
    const { ContainerSandboxClient } = await import("@jjhub/sdk");
    containerSandbox = await ContainerSandboxClient.create().catch(() => null);
  } catch {
    // Container runtime not available — workspace SSH will be disabled
  }

  const config = {
    port: parseInt(process.env.JJHUB_SSH_PORT ?? "2222", 10),
    host: process.env.JJHUB_SSH_HOST ?? "0.0.0.0",
    maxConnections: parseInt(process.env.JJHUB_SSH_MAX_CONNS ?? "0", 10),
    maxConnectionsPerIP: parseInt(
      process.env.JJHUB_SSH_MAX_CONNS_IP ?? "0",
      10
    ),
  };

  sshServer = createSSHServer(db, repoHost, containerSandbox, config);

  await sshServer.start();
  return sshServer;
}

/**
 * Gracefully shut down the SSH server.
 */
export async function stopSSHServer(): Promise<void> {
  if (sshServer) {
    await sshServer.shutdown();
    sshServer = null;
  }
}

/**
 * Get the running SSH server instance, or null if not started.
 */
export function getSSHServer(): SSHServer | null {
  return sshServer;
}
