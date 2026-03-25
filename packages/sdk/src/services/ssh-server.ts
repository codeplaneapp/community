/**
 * SSH Server service for Codeplane Community Edition.
 *
 * Provides SSH transport for two use cases:
 *   1. Git operations (git clone/push/pull over SSH)
 *   2. Workspace SSH access (terminal into workspace containers)
 *
 * This is the TypeScript port of Go's internal/ssh/server.go, using the
 * ssh2 npm package instead of gliderlabs/ssh.
 *
 * Authentication is by SSH public key — the server looks up the key's
 * SHA256 fingerprint in the ssh_keys table (user keys) or deploy_keys
 * table (deploy keys).
 */

import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Sql } from "postgres";
import type { Subprocess } from "bun";

import { Server as SSH2Server } from "ssh2";
import type {
  Connection,
  AuthContext,
  PublicKeyAuthContext,
  Session,
  ServerChannel,
  AcceptConnection,
  RejectConnection,
  ExecInfo,
  ClientInfo,
} from "ssh2";

import { getUserBySSHFingerprint } from "../db/ssh_keys_sql";
import {
  getAnyDeployKeyByFingerprint,
  getDeployKeyByFingerprint,
} from "../db/deploy_keys_sql";
import { getRepoByOwnerAndLowerName } from "../db/repos_sql";
import type { RepoHostService } from "./repohost";
import type { ContainerSandboxClient } from "./container-sandbox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authenticated principal — either a user or a deploy key. */
interface SSHPrincipal {
  userId: string;
  username: string;
  fingerprint: string;
  isDeployKey: boolean;
}

/** Configuration for the SSH server. */
export interface SSHServerConfig {
  /** Port to listen on (default: 2222). */
  port?: number;
  /** Host to bind to (default: "0.0.0.0"). */
  host?: string;
  /** Directory to store host keys (default: CODEPLANE_DATA_DIR/ssh/). */
  hostKeyDir?: string;
  /** Maximum concurrent connections (0 = unlimited). */
  maxConnections?: number;
  /** Maximum concurrent connections per IP (0 = unlimited). */
  maxConnectionsPerIP?: number;
}

// ---------------------------------------------------------------------------
// Host key management
// ---------------------------------------------------------------------------

/**
 * Ensure an Ed25519 host key exists at the given path.
 * If it does not exist, generate one and write it to disk.
 * Returns the PEM-encoded private key as a string.
 */
function ensureHostKey(hostKeyPath: string): string {
  if (existsSync(hostKeyPath)) {
    return readFileSync(hostKeyPath, "utf-8");
  }

  console.log(`Generating SSH host key at ${hostKeyPath}`);
  const dir = join(hostKeyPath, "..");
  mkdirSync(dir, { recursive: true });

  // ssh2 requires RSA keys in PEM format (it does not support
  // Ed25519 keys in PKCS8/PEM encoding). Use RSA-4096 which is
  // universally supported by the ssh2 library.
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  writeFileSync(hostKeyPath, privateKey, { mode: 0o600 });
  return privateKey;
}

// ---------------------------------------------------------------------------
// Repo path parsing (mirrors Go's parseRepoPath)
// ---------------------------------------------------------------------------

function isSafeRepoComponent(component: string): boolean {
  if (
    component === "" ||
    component === "." ||
    component === ".." ||
    component.includes("..")
  ) {
    return false;
  }
  for (const ch of component) {
    const code = ch.charCodeAt(0);
    const isAlphaNum =
      (code >= 0x61 && code <= 0x7a) || // a-z
      (code >= 0x41 && code <= 0x5a) || // A-Z
      (code >= 0x30 && code <= 0x39); // 0-9
    const isAllowed = ch === "-" || ch === "_" || ch === ".";
    if (!isAlphaNum && !isAllowed) return false;
  }
  return true;
}

function parseRepoPath(path: string): { owner: string; repo: string } | null {
  path = path.trim();
  if (path.startsWith("/")) path = path.slice(1);
  if (path.endsWith(".git")) path = path.slice(0, -4);

  const parts = path.split("/");
  if (parts.length !== 2) return null;

  const owner = parts[0]!;
  const repo = parts[1]!;

  if (!isSafeRepoComponent(owner) || !isSafeRepoComponent(repo)) return null;

  return { owner, repo };
}

// ---------------------------------------------------------------------------
// Git command parsing
// ---------------------------------------------------------------------------

type GitCommand = "git-upload-pack" | "git-receive-pack";
type AccessMode = "read" | "write";

function accessModeFromGitCommand(
  cmd: string
): { gitCmd: GitCommand; mode: AccessMode } | null {
  switch (cmd) {
    case "git-upload-pack":
      return { gitCmd: "git-upload-pack", mode: "read" };
    case "git-receive-pack":
      return { gitCmd: "git-receive-pack", mode: "write" };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Fingerprint computation
// ---------------------------------------------------------------------------

/**
 * Compute the SHA256 fingerprint of an SSH public key in the same format
 * as Go's crypto/sha256 + base64.RawStdEncoding (no padding).
 *
 * The ssh2 PublicKeyAuthContext gives us `ctx.key.data` which is the raw
 * SSH public key blob (same format as `key.Marshal()` in Go).
 */
function computeFingerprint(keyData: Buffer): string {
  const hash = createHash("sha256").update(keyData).digest("base64");
  // Remove trailing '=' padding to match Go's base64.RawStdEncoding
  const rawBase64 = hash.replace(/=+$/, "");
  return `SHA256:${rawBase64}`;
}

// ---------------------------------------------------------------------------
// SSHServer
// ---------------------------------------------------------------------------

export class SSHServer {
  private sql: Sql;
  private repoHost: RepoHostService;
  private containerSandbox: ContainerSandboxClient | null;
  private config: Required<SSHServerConfig>;
  private server: SSH2Server | null = null;

  // Connection tracking
  private activeConns = 0;
  private activeConnsPerIP = new Map<string, number>();

  constructor(
    sql: Sql,
    repoHost: RepoHostService,
    containerSandbox: ContainerSandboxClient | null,
    config: SSHServerConfig = {}
  ) {
    this.sql = sql;
    this.repoHost = repoHost;
    this.containerSandbox = containerSandbox;

    const dataDir = process.env.CODEPLANE_DATA_DIR ?? "./data";
    this.config = {
      port: config.port ?? parseInt(process.env.CODEPLANE_SSH_PORT ?? "2222", 10),
      host: config.host ?? "0.0.0.0",
      hostKeyDir: config.hostKeyDir ?? join(dataDir, "ssh"),
      maxConnections: config.maxConnections ?? 0,
      maxConnectionsPerIP: config.maxConnectionsPerIP ?? 0,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the SSH server. Returns a promise that resolves once the server
   * is listening.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const hostKeyPath = join(this.config.hostKeyDir, "ssh_host_ed25519_key");
      const hostKey = ensureHostKey(hostKeyPath);

      this.server = new SSH2Server(
        { hostKeys: [hostKey] },
        (client: Connection, info: ClientInfo) => {
          this.handleConnection(client, info);
        }
      );

      this.server.on("error", (err: Error) => {
        console.error("SSH server error:", err.message);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        console.log(
          `SSH server listening on ${this.config.host}:${this.config.port}`
        );
        resolve();
      });

      this.server.once("error", (err: Error) => {
        reject(err);
      });
    });
  }

  /**
   * Gracefully shut down the SSH server.
   */
  async shutdown(): Promise<void> {
    if (!this.server) return;

    return new Promise((resolve) => {
      this.server!.close(() => {
        console.log("SSH server shut down");
        resolve();
      });
    });
  }

  /** Return the configured port. */
  getPort(): number {
    return this.config.port;
  }

  // -------------------------------------------------------------------------
  // Connection handling
  // -------------------------------------------------------------------------

  private handleConnection(client: Connection, info: ClientInfo): void {
    const remoteIP = info.ip;

    // Connection limit checks
    if (
      this.config.maxConnections > 0 &&
      this.activeConns >= this.config.maxConnections
    ) {
      client.end();
      return;
    }
    if (
      this.config.maxConnectionsPerIP > 0 &&
      (this.activeConnsPerIP.get(remoteIP) ?? 0) >=
        this.config.maxConnectionsPerIP
    ) {
      client.end();
      return;
    }

    this.activeConns++;
    this.activeConnsPerIP.set(
      remoteIP,
      (this.activeConnsPerIP.get(remoteIP) ?? 0) + 1
    );

    // Track the authenticated principal for this connection
    let principal: SSHPrincipal | null = null;

    client.on("authentication", (ctx: AuthContext) => {
      this.handleAuth(ctx, remoteIP).then((result) => {
        if (result) {
          principal = result;
          ctx.accept();
        } else {
          ctx.reject(["publickey"]);
        }
      }).catch((err) => {
        console.error("SSH auth error:", err);
        ctx.reject(["publickey"]);
      });
    });

    client.on("ready", () => {
      client.on(
        "session",
        (accept: AcceptConnection<Session>, _reject: RejectConnection) => {
          const session = accept();
          this.handleSession(session, principal, remoteIP);
        }
      );
    });

    client.on("close", () => {
      this.activeConns = Math.max(0, this.activeConns - 1);
      const count = this.activeConnsPerIP.get(remoteIP) ?? 0;
      if (count <= 1) {
        this.activeConnsPerIP.delete(remoteIP);
      } else {
        this.activeConnsPerIP.set(remoteIP, count - 1);
      }
    });

    client.on("error", (err: Error) => {
      // Client disconnected or protocol error — non-fatal
      if ((err as Error & { code?: string }).code !== "ECONNRESET") {
        console.warn("SSH client error:", err.message);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------

  private async handleAuth(
    ctx: AuthContext,
    remoteIP: string
  ): Promise<SSHPrincipal | null> {
    if (ctx.method !== "publickey") {
      return null;
    }

    const pkCtx = ctx as PublicKeyAuthContext;
    const fingerprint = computeFingerprint(pkCtx.key.data);

    const principal = await this.lookupPrincipal(fingerprint);
    if (!principal) {
      console.warn(
        `SSH auth failed: fingerprint=${fingerprint} remote_ip=${remoteIP}`
      );
      return null;
    }

    const logFields = principal.isDeployKey
      ? `deploy_key fingerprint=${fingerprint}`
      : `user_id=${principal.userId} username=${principal.username} fingerprint=${fingerprint}`;
    console.log(`SSH auth succeeded: ${logFields} remote_ip=${remoteIP}`);

    return principal;
  }

  /**
   * Look up a principal by SSH key fingerprint.
   * First checks user keys, then deploy keys (matching Go's lookupPrincipal).
   */
  private async lookupPrincipal(
    fingerprint: string
  ): Promise<SSHPrincipal | null> {
    // Try user key first
    const user = await getUserBySSHFingerprint(this.sql, { fingerprint });
    if (user) {
      return {
        userId: user.userId,
        username: user.username,
        fingerprint,
        isDeployKey: false,
      };
    }

    // Try deploy key
    const deployKey = await getAnyDeployKeyByFingerprint(this.sql, {
      keyFingerprint: fingerprint,
    });
    if (deployKey) {
      return {
        userId: "",
        username: "deploy-key",
        fingerprint,
        isDeployKey: true,
      };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Session handling
  // -------------------------------------------------------------------------

  private handleSession(
    session: Session,
    principal: SSHPrincipal | null,
    remoteIP: string
  ): void {
    session.on(
      "exec",
      (
        accept: AcceptConnection<ServerChannel>,
        reject: RejectConnection,
        info: ExecInfo
      ) => {
        this.handleExec(accept, reject, info, principal, remoteIP);
      }
    );

    session.on(
      "shell",
      (accept: AcceptConnection<ServerChannel>, _reject: RejectConnection) => {
        // Workspace shell access — for now, reject with a message
        // until workspace routing is wired up
        const channel = accept();
        channel.stderr.write("interactive shell requires a workspace target\r\n");
        channel.stderr.write(
          "use: ssh -t workspace-<id>@ssh.codeplane.app\r\n"
        );
        channel.exit(1);
        channel.end();
      }
    );
  }

  private handleExec(
    accept: AcceptConnection<ServerChannel>,
    _reject: RejectConnection,
    info: ExecInfo,
    principal: SSHPrincipal | null,
    remoteIP: string
  ): void {
    const rawCmd = info.command;

    if (!rawCmd) {
      const channel = accept();
      channel.stderr.write("interactive shell not supported\r\n");
      channel.exit(1);
      channel.end();
      return;
    }

    // Check if this is a workspace exec command
    // Format: "workspace-exec <workspace-id> <command>"
    if (rawCmd.startsWith("workspace-exec ")) {
      this.handleWorkspaceExec(accept, rawCmd, principal, remoteIP);
      return;
    }

    // Parse git command: "git-upload-pack 'owner/repo.git'" or
    // "git-receive-pack 'owner/repo.git'"
    const parts = rawCmd.split(" ");
    if (parts.length < 2) {
      const channel = accept();
      channel.stderr.write("invalid command\r\n");
      channel.exit(1);
      channel.end();
      return;
    }

    const cmdName = parts[0]!;
    const repoPathRaw = parts.slice(1).join(" ").replace(/^['"]|['"]$/g, "");

    const parsed = accessModeFromGitCommand(cmdName);
    if (!parsed) {
      const channel = accept();
      channel.stderr.write(`unsupported command: ${cmdName}\r\n`);
      channel.exit(1);
      channel.end();
      return;
    }

    const repoParsed = parseRepoPath(repoPathRaw);
    if (!repoParsed) {
      const channel = accept();
      channel.stderr.write("invalid repository path\r\n");
      channel.exit(1);
      channel.end();
      return;
    }

    if (!principal) {
      const channel = accept();
      this.writeGitPermissionDenied(channel, repoParsed.owner, repoParsed.repo);
      channel.exit(1);
      channel.end();
      return;
    }

    const { gitCmd, mode } = parsed;
    const { owner, repo } = repoParsed;

    console.log(
      `SSH session: username=${principal.username} git_command=${gitCmd} ` +
        `repo=${owner}/${repo} remote_ip=${remoteIP}`
    );

    // Authorize and proxy
    this.authorizeAndProxy(accept, gitCmd, owner, repo, mode, principal, remoteIP);
  }

  // -------------------------------------------------------------------------
  // Authorization
  // -------------------------------------------------------------------------

  private async authorizeAndProxy(
    accept: AcceptConnection<ServerChannel>,
    gitCmd: GitCommand,
    owner: string,
    repo: string,
    mode: AccessMode,
    principal: SSHPrincipal,
    remoteIP: string
  ): Promise<void> {
    const channel = accept();
    const startTime = Date.now();

    try {
      // Authorize the principal for this repo
      const authorizedPrincipal = await this.authorizePrincipal(
        principal,
        owner,
        repo,
        mode
      );

      // Proxy the git command
      await this.proxyGitCommand(channel, gitCmd, owner, repo, authorizedPrincipal);

      const durationMs = Date.now() - startTime;
      console.log(
        `SSH session end: username=${authorizedPrincipal.username} ` +
          `git_command=${gitCmd} repo=${owner}/${repo} ` +
          `duration_ms=${durationMs} remote_ip=${remoteIP}`
      );

      channel.exit(0);
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const message = err?.message ?? "unknown error";

      if (
        message.includes("permission denied") ||
        message.includes("not found")
      ) {
        this.writeGitPermissionDenied(channel, owner, repo);
      } else {
        console.error(
          `SSH git proxy failed: git_command=${gitCmd} repo=${owner}/${repo} ` +
            `error=${message} duration_ms=${durationMs}`
        );
        channel.stderr.write("ERROR: repository operation failed\r\n");
      }

      channel.exit(1);
    } finally {
      channel.end();
    }
  }

  private async authorizePrincipal(
    principal: SSHPrincipal,
    owner: string,
    repo: string,
    mode: AccessMode
  ): Promise<SSHPrincipal> {
    if (principal.isDeployKey) {
      return this.authorizeDeployKey(principal, owner, repo, mode);
    }

    // For user keys in the OSS/CE edition, we do a simplified check:
    // look up the repository and verify the user has access.
    // The full authorization (org membership, team perms, etc.) is in
    // the Go version's SSHAuthorizationService. For CE, the repo owner
    // check is sufficient since there are no multi-user orgs at scale.
    const repository = await getRepoByOwnerAndLowerName(this.sql, {
      lowerName: repo.toLowerCase(),
      owner: owner.toLowerCase(),
    });

    if (!repository) {
      throw new Error("repository not found");
    }

    if (repository.isArchived && mode === "write") {
      throw new Error("permission denied: repository is archived");
    }

    // Public repos allow read access to any authenticated user
    if (mode === "read" && repository.isPublic) {
      return principal;
    }

    // Owner check: the user must own the repo (user repo) or be the org member
    // For CE, we do a simple owner ID check
    if (repository.userId === principal.userId) {
      return principal;
    }

    // If not the direct owner, deny (CE doesn't have full org/team perms)
    // In production Codeplane Cloud, this uses SSHAuthorizationService
    throw new Error("permission denied");
  }

  private async authorizeDeployKey(
    principal: SSHPrincipal,
    owner: string,
    repo: string,
    mode: AccessMode
  ): Promise<SSHPrincipal> {
    const repository = await getRepoByOwnerAndLowerName(this.sql, {
      lowerName: repo.toLowerCase(),
      owner: owner.toLowerCase(),
    });

    if (!repository) {
      throw new Error("repository not found");
    }

    if (repository.isArchived && mode === "write") {
      throw new Error("permission denied: repository is archived");
    }

    const key = await getDeployKeyByFingerprint(this.sql, {
      repositoryId: repository.id,
      keyFingerprint: principal.fingerprint,
    });

    if (!key) {
      throw new Error("permission denied");
    }

    if (mode === "write" && key.readOnly) {
      throw new Error("permission denied: deploy key is read only");
    }

    return {
      userId: "",
      username: `deploy-key:${key.title}`,
      fingerprint: principal.fingerprint,
      isDeployKey: true,
    };
  }

  // -------------------------------------------------------------------------
  // Git proxying — spawn git-upload-pack / git-receive-pack
  // -------------------------------------------------------------------------

  private async proxyGitCommand(
    channel: ServerChannel,
    gitCmd: GitCommand,
    owner: string,
    repo: string,
    _principal: SSHPrincipal
  ): Promise<void> {
    let proc: Subprocess;

    if (gitCmd === "git-upload-pack") {
      proc = this.repoHost.gitUploadPack(owner, repo);
    } else {
      proc = this.repoHost.gitReceivePack(owner, repo);
    }

    // Bidirectional pipe: SSH channel <-> git process
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (err?: Error) => {
        if (done) return;
        done = true;
        if (err) reject(err);
        else resolve();
      };

      // SSH channel -> git stdin
      channel.on("data", (data: Buffer) => {
        if (proc.stdin) {
          (proc.stdin as any).write(data);
        }
      });

      channel.on("end", () => {
        if (proc.stdin) {
          (proc.stdin as any).end();
        }
      });

      channel.on("error", (err: Error) => {
        proc.kill();
        finish(err);
      });

      // git stdout -> SSH channel
      if (proc.stdout) {
        const reader = proc.stdout as ReadableStream<Uint8Array>;
        const pipeStdout = async () => {
          try {
            for await (const chunk of reader) {
              channel.write(Buffer.from(chunk));
            }
          } catch {
            // Stream ended or errored — handled by process exit
          }
        };
        pipeStdout();
      }

      // git stderr -> SSH channel stderr
      if (proc.stderr) {
        const reader = proc.stderr as ReadableStream<Uint8Array>;
        const pipeStderr = async () => {
          try {
            for await (const chunk of reader) {
              channel.stderr.write(Buffer.from(chunk));
            }
          } catch {
            // Stream ended or errored — handled by process exit
          }
        };
        pipeStderr();
      }

      // Wait for git process to exit
      proc.exited
        .then((exitCode: number) => {
          if (exitCode !== 0) {
            finish(new Error(`git process exited with code ${exitCode}`));
          } else {
            // After receive-pack, import git refs into jj
            if (gitCmd === "git-receive-pack") {
              this.repoHost
                .importRefs(owner, repo)
                .then(() => finish())
                .catch((err) => {
                  console.error(
                    `Failed to import refs after push to ${owner}/${repo}:`,
                    err
                  );
                  // Non-fatal: the push succeeded, ref import can be retried
                  finish();
                });
            } else {
              finish();
            }
          }
        })
        .catch(finish);
    });
  }

  // -------------------------------------------------------------------------
  // Workspace exec
  // -------------------------------------------------------------------------

  private async handleWorkspaceExec(
    accept: AcceptConnection<ServerChannel>,
    rawCmd: string,
    principal: SSHPrincipal | null,
    _remoteIP: string
  ): Promise<void> {
    const channel = accept();

    if (!principal) {
      channel.stderr.write("ERROR: authentication required\r\n");
      channel.exit(1);
      channel.end();
      return;
    }

    if (!this.containerSandbox) {
      channel.stderr.write(
        "ERROR: workspace containers are not configured\r\n"
      );
      channel.exit(1);
      channel.end();
      return;
    }

    // Parse: "workspace-exec <workspace-id> <command...>"
    const parts = rawCmd.split(" ");
    if (parts.length < 3) {
      channel.stderr.write(
        "usage: workspace-exec <workspace-id> <command>\r\n"
      );
      channel.exit(1);
      channel.end();
      return;
    }

    const workspaceVmId = parts[1]!;
    const command = parts.slice(2).join(" ");

    try {
      const result = await this.containerSandbox.exec(workspaceVmId, command);
      if (result.stdout) channel.write(result.stdout);
      if (result.stderr) channel.stderr.write(result.stderr);
      channel.exit(result.exitCode);
    } catch (err: any) {
      channel.stderr.write(`ERROR: ${err.message}\r\n`);
      channel.exit(1);
    } finally {
      channel.end();
    }
  }

  // -------------------------------------------------------------------------
  // Error messages (match Go's output)
  // -------------------------------------------------------------------------

  private writeGitPermissionDenied(
    channel: ServerChannel,
    owner: string,
    repo: string
  ): void {
    channel.stderr.write(`ERROR: ${owner}/${repo}: permission denied\r\n`);
    channel.stderr.write(
      "fatal: Could not read from remote repository.\r\n"
    );
    channel.stderr.write("\r\n");
    channel.stderr.write(
      "Please make sure you have the correct access rights\r\n"
    );
    channel.stderr.write("and the repository exists.\r\n");
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSSHServer(
  sql: Sql,
  repoHost: RepoHostService,
  containerSandbox: ContainerSandboxClient | null = null,
  config: SSHServerConfig = {}
): SSHServer {
  return new SSHServer(sql, repoHost, containerSandbox, config);
}
