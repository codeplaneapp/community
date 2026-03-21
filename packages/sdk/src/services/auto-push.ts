/**
 * AutoPushService — Automatic private branch pushing for Codeplane daemon.
 *
 * Watches local jj repositories for new operations (via fs.watch on the
 * .jj/repo/op_store/ directory) and automatically pushes bookmarks to the
 * remote as private branches under the `private/{username}/{bookmark}` namespace.
 *
 * Private branches are only visible to the owning user on the remote.
 *
 * Features:
 * - File-system watching (Bun/Node fs.watch) for instant detection
 * - 5-second debounce so rapid edits batch together
 * - Offline queue: if push fails, retry on next operation
 * - Structured logging via event emitter
 */

import { watch, type FSWatcher } from "node:fs";
import { readdir, access } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoPushConfig {
  /** Base directory for repositories (CODEPLANE_DATA_DIR/repos/). */
  reposBaseDir: string;
  /** Username for the private bookmark namespace. */
  username: string;
  /** Remote name to push to. Defaults to "origin". */
  remote?: string;
  /** Debounce interval in ms. Defaults to 5000 (5 seconds). */
  debounceMs?: number;
}

export type AutoPushEventType =
  | "push-start"
  | "push-complete"
  | "push-error"
  | "watch-start"
  | "watch-stop"
  | "watch-error"
  | "offline-queued";

export interface AutoPushEvent {
  type: AutoPushEventType;
  repoPath?: string;
  bookmark?: string;
  error?: string;
  timestamp: Date;
}

type AutoPushListener = (event: AutoPushEvent) => void;

interface PendingPush {
  repoPath: string;
  timer: ReturnType<typeof setTimeout>;
}

// ---------------------------------------------------------------------------
// AutoPushService
// ---------------------------------------------------------------------------

export class AutoPushService {
  private readonly reposBaseDir: string;
  private readonly username: string;
  private readonly remote: string;
  private readonly debounceMs: number;

  private watchers: Map<string, FSWatcher> = new Map();
  private pendingPushes: Map<string, PendingPush> = new Map();
  private offlineQueue: Set<string> = new Set();
  private listeners: Map<AutoPushEventType, Set<AutoPushListener>> = new Map();
  private running = false;
  private rootWatcher: FSWatcher | null = null;

  constructor(config: AutoPushConfig) {
    this.reposBaseDir = config.reposBaseDir;
    this.username = config.username;
    this.remote = config.remote ?? "origin";
    this.debounceMs = config.debounceMs ?? 5000;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start watching all repositories under reposBaseDir for jj operation
   * changes. Also watches the reposBaseDir itself for new repos being added.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Scan existing repos and start watchers
    await this.scanAndWatch();

    // Watch the repos base dir for new owner dirs / repos being added
    try {
      this.rootWatcher = watch(this.reposBaseDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        // When a new op_store change is detected anywhere under reposBaseDir,
        // find which repo it belongs to and schedule a push
        if (filename.includes(".jj") && filename.includes("op_store")) {
          const repoPath = this.extractRepoPath(filename);
          if (repoPath) {
            this.schedulePush(repoPath);
          }
        }
      });
    } catch {
      // Fallback: if recursive watch is not supported, watch individual repos
      await this.watchIndividualRepos();
    }

    this.emit("watch-start", { reposBaseDir: this.reposBaseDir });
  }

  /**
   * Stop all watchers and clear pending pushes.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    // Close root watcher
    if (this.rootWatcher) {
      this.rootWatcher.close();
      this.rootWatcher = null;
    }

    // Close all individual repo watchers
    for (const [path, watcher] of this.watchers) {
      watcher.close();
      this.watchers.delete(path);
    }

    // Cancel all pending debounced pushes
    for (const [path, pending] of this.pendingPushes) {
      clearTimeout(pending.timer);
      this.pendingPushes.delete(path);
    }

    this.emit("watch-stop", {});
  }

  // -----------------------------------------------------------------------
  // Repo scanning
  // -----------------------------------------------------------------------

  /**
   * Scan the repos base dir for existing repositories and start
   * watching their op_store directories.
   */
  private async scanAndWatch(): Promise<void> {
    try {
      const owners = await readdir(this.reposBaseDir).catch(() => [] as string[]);
      for (const owner of owners) {
        const ownerDir = join(this.reposBaseDir, owner);
        const repos = await readdir(ownerDir).catch(() => [] as string[]);
        for (const repo of repos) {
          const repoPath = join(ownerDir, repo);
          await this.watchRepo(repoPath);
        }
      }
    } catch {
      // reposBaseDir may not exist yet — that's fine
    }
  }

  /**
   * Watch an individual repository's op_store for changes.
   */
  private async watchRepo(repoPath: string): Promise<void> {
    const opStorePath = join(repoPath, ".jj", "repo", "op_store");

    // Check if op_store exists
    try {
      await access(opStorePath);
    } catch {
      return; // Not a jj repo or op_store doesn't exist yet
    }

    if (this.watchers.has(repoPath)) return;

    try {
      const watcher = watch(opStorePath, { recursive: true }, () => {
        this.schedulePush(repoPath);
      });

      this.watchers.set(repoPath, watcher);
    } catch (err) {
      this.emit("watch-error", {
        repoPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Fallback for platforms that don't support recursive fs.watch on the
   * root directory. Watches each repo's op_store individually.
   */
  private async watchIndividualRepos(): Promise<void> {
    await this.scanAndWatch();
  }

  /**
   * Extract the repository path from a filename relative to reposBaseDir.
   * Example: "owner/repo/.jj/repo/op_store/..." -> "/base/owner/repo"
   */
  private extractRepoPath(filename: string): string | null {
    // filename is relative to reposBaseDir, like "owner/repo/.jj/repo/op_store/..."
    const jjIndex = filename.indexOf(".jj");
    if (jjIndex === -1) return null;

    const relativeRepoPath = filename.slice(0, jjIndex).replace(/\/$/, "");
    if (!relativeRepoPath) return null;

    return join(this.reposBaseDir, relativeRepoPath);
  }

  // -----------------------------------------------------------------------
  // Debounced push scheduling
  // -----------------------------------------------------------------------

  /**
   * Schedule a push for a repository. If a push is already scheduled,
   * reset the debounce timer so rapid operations batch together.
   */
  private schedulePush(repoPath: string): void {
    const existing = this.pendingPushes.get(repoPath);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      this.pendingPushes.delete(repoPath);
      this.executePush(repoPath);
    }, this.debounceMs);

    this.pendingPushes.set(repoPath, { repoPath, timer });
  }

  // -----------------------------------------------------------------------
  // Push execution
  // -----------------------------------------------------------------------

  /**
   * Execute the push for a repository: list local bookmarks, then push
   * each one as a private branch.
   */
  private async executePush(repoPath: string): Promise<void> {
    if (!this.running) return;

    this.emit("push-start", { repoPath });

    try {
      // List local bookmarks
      const bookmarks = await this.listLocalBookmarks(repoPath);
      if (bookmarks.length === 0) return;

      // Check if remote is configured
      const hasRemote = await this.hasRemoteConfigured(repoPath);
      if (!hasRemote) {
        // Queue for later when remote becomes available
        this.offlineQueue.add(repoPath);
        this.emit("offline-queued", { repoPath });
        return;
      }

      // Push each bookmark as a private branch
      for (const bookmark of bookmarks) {
        await this.pushBookmark(repoPath, bookmark);
      }

      // If we got here, we're online — flush any queued repos
      this.offlineQueue.delete(repoPath);

      this.emit("push-complete", { repoPath });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // If the error looks like a network/auth failure, queue for retry
      if (this.isNetworkError(errorMsg)) {
        this.offlineQueue.add(repoPath);
        this.emit("offline-queued", { repoPath, error: errorMsg });
      } else {
        this.emit("push-error", { repoPath, error: errorMsg });
      }
    }
  }

  /**
   * List local bookmarks that have unpushed changes.
   * Returns bookmark names that need pushing.
   */
  private async listLocalBookmarks(repoPath: string): Promise<string[]> {
    const proc = Bun.spawn(
      ["jj", "bookmark", "list", "--all", "-T", 'if(!remote, name ++ "\\n")'],
      {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          JJ_CONFIG: "ui.pager=false\nui.color=never",
        },
      },
    );

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) return [];

    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((name) => name.length > 0)
      // Don't re-push bookmarks that are already in the private namespace
      .filter((name) => !name.startsWith("private/"));
  }

  /**
   * Check whether the repository has a git remote configured.
   */
  private async hasRemoteConfigured(repoPath: string): Promise<boolean> {
    const proc = Bun.spawn(["jj", "git", "remote", "list"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        JJ_CONFIG: "ui.pager=false\nui.color=never",
      },
    });

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) return false;

    // Check if our target remote exists in the list
    const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.some((line) => line.startsWith(this.remote));
  }

  /**
   * Push a single bookmark as a private branch to the remote.
   *
   * Creates the private bookmark locally pointing at the same target as the
   * original bookmark, then pushes it. The private bookmark name follows the
   * pattern: `private/{username}/{bookmark_name}`.
   */
  private async pushBookmark(
    repoPath: string,
    bookmarkName: string,
  ): Promise<void> {
    const privateName = `private/${this.username}/${bookmarkName}`;

    // Create or move the private bookmark to point at the same target
    // as the original bookmark.
    const setProc = Bun.spawn(
      ["jj", "bookmark", "set", privateName, "-r", `bookmark(exact:"${bookmarkName}")`],
      {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          JJ_CONFIG: "ui.pager=false\nui.color=never",
        },
      },
    );
    await new Response(setProc.stdout).text();
    const setExitCode = await setProc.exited;

    if (setExitCode !== 0) {
      const stderr = await new Response(setProc.stderr).text();
      throw new Error(`failed to set private bookmark '${privateName}': ${stderr.trim()}`);
    }

    // Push the private bookmark to the remote
    const pushProc = Bun.spawn(
      ["jj", "git", "push", "--bookmark", privateName, "--remote", this.remote],
      {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          JJ_CONFIG: "ui.pager=false\nui.color=never",
        },
      },
    );

    const pushStdout = await new Response(pushProc.stdout).text();
    const pushStderr = await new Response(pushProc.stderr).text();
    const pushExitCode = await pushProc.exited;

    if (pushExitCode !== 0) {
      const errText = pushStderr.trim() || pushStdout.trim();
      // "Nothing changed" is not an error
      if (errText.includes("Nothing changed") || errText.includes("already up to date")) {
        return;
      }
      throw new Error(`failed to push '${privateName}': ${errText}`);
    }
  }

  // -----------------------------------------------------------------------
  // Offline queue
  // -----------------------------------------------------------------------

  /**
   * Retry pushing all repos that were queued while offline.
   * Call this when connectivity is restored.
   */
  async flushOfflineQueue(): Promise<void> {
    const repos = Array.from(this.offlineQueue);
    for (const repoPath of repos) {
      this.schedulePush(repoPath);
    }
  }

  /**
   * Get the number of repos waiting to be pushed.
   */
  getOfflineQueueSize(): number {
    return this.offlineQueue.size;
  }

  // -----------------------------------------------------------------------
  // Error classification
  // -----------------------------------------------------------------------

  /**
   * Determine if an error message indicates a network or auth issue
   * (i.e., something that might resolve on retry).
   */
  private isNetworkError(message: string): boolean {
    const networkPatterns = [
      "could not resolve",
      "connection refused",
      "connection reset",
      "timed out",
      "timeout",
      "network",
      "ECONNREFUSED",
      "ENOTFOUND",
      "ETIMEDOUT",
      "ECONNRESET",
      "authentication",
      "auth",
      "permission denied",
      "could not read",
      "unable to access",
      "SSL",
    ];
    const lower = message.toLowerCase();
    return networkPatterns.some((p) => lower.includes(p.toLowerCase()));
  }

  // -----------------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------------

  /**
   * Subscribe to auto-push events.
   */
  on(event: AutoPushEventType, listener: AutoPushListener): () => void {
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

  private emit(
    type: AutoPushEventType,
    data: Omit<AutoPushEvent, "type" | "timestamp"> & Record<string, unknown>,
  ): void {
    const event: AutoPushEvent = {
      type,
      timestamp: new Date(),
      repoPath: data.repoPath as string | undefined,
      bookmark: data.bookmark as string | undefined,
      error: data.error as string | undefined,
    };

    const listeners = this.listeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Don't let listener errors crash the service
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an AutoPushService configured from environment and provided options.
 *
 * @param username - The authenticated user's username.
 * @param options  - Optional overrides for reposBaseDir, remote, and debounceMs.
 */
export function createAutoPushService(
  username: string,
  options?: Partial<Omit<AutoPushConfig, "username">>,
): AutoPushService {
  const reposBaseDir =
    options?.reposBaseDir ??
    join(process.env.CODEPLANE_DATA_DIR ?? "./data", "repos");

  return new AutoPushService({
    reposBaseDir,
    username,
    remote: options?.remote,
    debounceMs: options?.debounceMs,
  });
}
