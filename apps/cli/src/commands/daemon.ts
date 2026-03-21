import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { Cli, z } from "incur";
import { stateDir } from "../config.js";

/**
 * Path to the daemon PID file.
 */
function pidFilePath(): string {
  return join(stateDir(), "daemon.pid");
}

/**
 * Path to the daemon log file.
 */
function logFilePath(): string {
  return join(stateDir(), "daemon.log");
}

/**
 * Read the stored daemon PID, or null if not running.
 */
function readPid(): number | null {
  const path = pidFilePath();
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8").trim();
  const pid = parseInt(raw, 10);
  if (Number.isNaN(pid)) return null;

  // Check if process is actually alive
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process is gone — clean up stale PID file
    try { unlinkSync(path); } catch {}
    return null;
  }
}

/**
 * Write the daemon PID file.
 */
function writePid(pid: number): void {
  const dir = stateDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(pidFilePath(), String(pid), "utf-8");
}

/**
 * Remove the daemon PID file.
 */
function removePid(): void {
  try { unlinkSync(pidFilePath()); } catch {}
}

/**
 * Resolve the daemon API URL. Tries the daemon's known port first,
 * then falls back to the configured api_url.
 */
async function daemonUrl(): Promise<string> {
  const config = await import("../config.js").then((m) => m.loadConfig());
  // The daemon always listens on localhost. Check the JJHUB_PORT env or default.
  return config.api_url ?? "http://127.0.0.1:3000";
}

/**
 * Make a request to the daemon's internal API.
 */
async function daemonFetch<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const baseUrl = await daemonUrl();
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail: string;
    try {
      const err = (await res.json()) as { message?: string };
      detail = err.message || res.statusText;
    } catch {
      detail = res.statusText;
    }
    throw new Error(`${method} ${path} failed (${res.status}): ${detail}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const daemon = Cli.create("daemon", {
  description: "Run JJHub locally with embedded PostgreSQL (PGLite)",
})
  .command("start", {
    description: "Start the local JJHub daemon with embedded PostgreSQL",
    options: z.object({
      port: z.string().default("3000").describe("Port to listen on"),
      host: z.string().default("127.0.0.1").describe("Host to bind to"),
      "data-dir": z.string().optional().describe("Data directory (default: ./data)"),
      foreground: z.boolean().default(false).describe("Run in foreground instead of daemonizing"),
    }),
    async run(c) {
      const existingPid = readPid();
      if (existingPid) {
        return {
          status: "already_running",
          pid: existingPid,
          message: `Daemon is already running (PID ${existingPid}). Use 'jjhub daemon stop' first.`,
        };
      }

      const port = c.options.port;
      const host = c.options.host;
      const dataDir = c.options["data-dir"] ?? "./data";

      // Set environment for PGLite mode
      process.env.JJHUB_DB_MODE = "pglite";
      process.env.JJHUB_DATA_DIR = dataDir;
      process.env.JJHUB_PORT = port;
      process.env.JJHUB_HOST = host;

      if (!c.options.foreground) {
        // Spawn detached daemon process
        const { spawn } = await import("node:child_process");
        const { openSync } = await import("node:fs");

        const logPath = logFilePath();
        mkdirSync(stateDir(), { recursive: true });
        const logFd = openSync(logPath, "a");

        const child = spawn(
          process.argv[0]!,
          [
            ...process.argv.slice(1, process.argv.indexOf("daemon")),
            "daemon", "start", "--foreground",
            "--port", port,
            "--host", host,
            "--data-dir", dataDir,
          ],
          {
            detached: true,
            stdio: ["ignore", logFd, logFd],
            env: {
              ...process.env,
              JJHUB_DB_MODE: "pglite",
              JJHUB_DATA_DIR: dataDir,
              JJHUB_PORT: port,
              JJHUB_HOST: host,
            },
          },
        );

        child.unref();
        writePid(child.pid!);

        return {
          status: "started",
          pid: child.pid,
          port,
          host,
          data_dir: dataDir,
          log: logPath,
          url: `http://${host}:${port}`,
          message: `Daemon started (PID ${child.pid}). Logs: ${logPath}`,
        };
      }

      // Foreground mode — run the server directly in this process
      writePid(process.pid);

      // Ensure data directory exists
      mkdirSync(dataDir, { recursive: true });

      console.log(`JJHub daemon starting (PGLite mode)`);
      console.log(`  Data directory: ${dataDir}`);
      console.log(`  Listening on: http://${host}:${port}`);

      // Clean up PID file on exit
      const cleanup = () => {
        removePid();
        process.exit(0);
      };
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);

      // Import and start the server — initDb() inside will pick up JJHUB_DB_MODE=pglite
      await import("@jjhub/server");

      // Keep the process alive
      await new Promise(() => {});
    },
  })
  .command("status", {
    description: "Show daemon status (PID, uptime, port, sync, database mode)",
    async run() {
      const pid = readPid();
      if (!pid) {
        return {
          status: "stopped",
          message: "Daemon is not running.",
        };
      }

      // Fetch full status from the daemon's status endpoint
      try {
        const status = await daemonFetch<{
          pid: number;
          uptime: string;
          uptime_ms: number;
          port: string;
          db_mode: string;
          sync_status: string;
          pending_count: number;
          conflict_count: number;
          last_sync_at: string | null;
          error: string | null;
          remote_url: string | null;
        }>("GET", "/api/daemon/status");

        return {
          status: "running",
          pid: status.pid,
          uptime: status.uptime,
          port: status.port,
          db_mode: status.db_mode,
          sync_status: status.sync_status,
          pending_count: status.pending_count,
          conflict_count: status.conflict_count,
          last_sync_at: status.last_sync_at,
          error: status.error,
          remote_url: status.remote_url,
          message: [
            `Daemon running (PID ${status.pid})`,
            `  Uptime: ${status.uptime}`,
            `  Port: ${status.port}`,
            `  Database: ${status.db_mode}`,
            `  Sync: ${status.sync_status}`,
            `  Pending: ${status.pending_count}`,
            `  Conflicts: ${status.conflict_count}`,
            status.remote_url ? `  Remote: ${status.remote_url}` : `  Remote: none`,
            status.last_sync_at ? `  Last sync: ${status.last_sync_at}` : null,
            status.error ? `  Error: ${status.error}` : null,
          ].filter(Boolean).join("\n"),
        };
      } catch {
        // Daemon process is alive but API is unreachable
        return {
          status: "running",
          pid,
          healthy: false,
          message: "Daemon process is alive but API is unreachable.",
        };
      }
    },
  })
  .command("stop", {
    description: "Stop the running daemon",
    async run() {
      const pid = readPid();
      if (!pid) {
        return {
          status: "not_running",
          message: "Daemon is not running.",
        };
      }

      try {
        process.kill(pid, "SIGTERM");
      } catch (err) {
        // Process might already be gone
        removePid();
        return {
          status: "stopped",
          pid,
          message: `Process ${pid} already gone. Cleaned up PID file.`,
        };
      }

      // Wait briefly for process to exit
      let exited = false;
      for (let i = 0; i < 30; i++) {
        try {
          process.kill(pid, 0);
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch {
          exited = true;
          break;
        }
      }

      removePid();

      if (exited) {
        return {
          status: "stopped",
          pid,
          message: `Daemon stopped (PID ${pid}).`,
        };
      }

      // Force kill if still alive
      try { process.kill(pid, "SIGKILL"); } catch {}
      return {
        status: "stopped",
        pid,
        message: `Daemon force-killed (PID ${pid}).`,
      };
    },
  })
  .command("sync", {
    description: "Force sync with remote server now",
    async run() {
      const pid = readPid();
      if (!pid) {
        return {
          status: "error",
          message: "Daemon is not running. Start it with 'jjhub daemon start'.",
        };
      }

      try {
        const result = await daemonFetch<{
          total: number;
          synced: number;
          conflicts: number;
          failed: number;
        }>("POST", "/api/daemon/sync");

        return {
          status: "ok",
          total: result.total,
          synced: result.synced,
          conflicts: result.conflicts,
          failed: result.failed,
          message: result.total === 0
            ? "Nothing to sync."
            : `Synced ${result.synced} items, ${result.conflicts} conflicts, ${result.failed} failed.`,
        };
      } catch (err) {
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  })
  .command("conflicts", {
    description: "Show sync conflicts",
    options: z.object({
      resolve: z.string().optional().describe("Discard a conflict by ID (accept server version)"),
      retry: z.string().optional().describe("Retry a failed sync item by ID"),
    }),
    async run(c) {
      const pid = readPid();
      if (!pid) {
        return {
          status: "error",
          message: "Daemon is not running. Start it with 'jjhub daemon start'.",
        };
      }

      // Handle --resolve
      if (c.options.resolve) {
        try {
          const result = await daemonFetch<{ resolved: boolean; id: string }>(
            "POST",
            `/api/daemon/conflicts/${c.options.resolve}/resolve`,
          );
          return {
            status: "ok",
            resolved: result.resolved,
            id: result.id,
            message: `Conflict ${result.id} resolved (discarded local version).`,
          };
        } catch (err) {
          return {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // Handle --retry
      if (c.options.retry) {
        try {
          const result = await daemonFetch<{ retried: boolean; id: string }>(
            "POST",
            `/api/daemon/conflicts/${c.options.retry}/retry`,
          );
          return {
            status: "ok",
            retried: result.retried,
            id: result.id,
            message: `Item ${result.id} queued for retry.`,
          };
        } catch (err) {
          return {
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          };
        }
      }

      // List conflicts
      try {
        const conflicts = await daemonFetch<Array<{
          id: string;
          method: string;
          path: string;
          error_message: string;
          created_at: string;
          status: string;
        }>>("GET", "/api/daemon/conflicts");

        if (conflicts.length === 0) {
          return {
            status: "ok",
            conflicts: [],
            message: "No sync conflicts.",
          };
        }

        return {
          status: "ok",
          conflicts,
          message: [
            `${conflicts.length} conflict(s):`,
            "",
            ...conflicts.map((item) =>
              [
                `  ID: ${item.id}`,
                `  ${item.method} ${item.path}`,
                `  Error: ${item.error_message}`,
                `  Created: ${item.created_at}`,
                "",
              ].join("\n"),
            ),
            "Use --resolve <id> to discard or --retry <id> to retry.",
          ].join("\n"),
        };
      } catch (err) {
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  })
  .command("connect", {
    description: "Configure remote sync target",
    args: z.tuple([z.string().describe("Remote JJHub URL (e.g. https://api.jjhub.tech)")]),
    options: z.object({
      token: z.string().optional().describe("Auth token for the remote server"),
    }),
    async run(c) {
      const pid = readPid();
      if (!pid) {
        return {
          status: "error",
          message: "Daemon is not running. Start it with 'jjhub daemon start'.",
        };
      }

      const [url] = c.args;
      const token = c.options.token;

      try {
        const result = await daemonFetch<{
          connected: boolean;
          remote_url: string;
          has_token: boolean;
          sync_started: boolean;
        }>("POST", "/api/daemon/connect", { url, token });

        return {
          status: "ok",
          connected: result.connected,
          remote_url: result.remote_url,
          sync_started: result.sync_started,
          message: [
            `Connected to ${result.remote_url}.`,
            result.sync_started
              ? "Sync started."
              : "No token provided — sync not started. Use --token to enable sync.",
          ].join(" "),
        };
      } catch (err) {
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  })
  .command("disconnect", {
    description: "Stop syncing with remote (local data is preserved)",
    async run() {
      const pid = readPid();
      if (!pid) {
        return {
          status: "error",
          message: "Daemon is not running. Start it with 'jjhub daemon start'.",
        };
      }

      try {
        const result = await daemonFetch<{
          disconnected: boolean;
          was_connected: boolean;
        }>("POST", "/api/daemon/disconnect");

        return {
          status: "ok",
          disconnected: result.disconnected,
          was_connected: result.was_connected,
          message: result.was_connected
            ? "Disconnected from remote. Local data preserved."
            : "No remote was configured.",
        };
      } catch (err) {
        return {
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        };
      }
    },
  });
