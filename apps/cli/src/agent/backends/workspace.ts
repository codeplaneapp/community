import { Buffer } from "node:buffer";
import { posix as pathPosix } from "node:path";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { api } from "../../client.js";
import type { AgentExecutionBackend, RepoContext } from "../types.js";

const DEFAULT_REMOTE_ROOT = "/home/developer/workspace";
const DEFAULT_TIMEOUT_MS = 30_000;

interface WorkspaceRecord {
  id: string;
  status: string;
  freestyle_vm_id?: string | null;
}

interface WorkspaceSshInfo {
  command?: string;
  ssh_command?: string;
  host?: string;
  ssh_host?: string;
  username?: string;
  port?: number;
  access_token?: string;
}

interface CreateWorkspaceBackendOptions {
  repoContext: RepoContext;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function tokenizeShellWords(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === null && char === "\\") {
      escaped = true;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (quote === null && (char === "'" || char === '"')) {
      quote = char;
      continue;
    }

    if (quote === null && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

class WorkspaceRemoteClient {
  constructor(
    private readonly sshArgs: string[],
    private readonly localRoot: string,
    private readonly remoteRoot: string,
  ) {}

  private mapPath(localPath: string): string {
    const relative = localPath.startsWith(this.localRoot)
      ? localPath.slice(this.localRoot.length).replace(/^\/+/, "")
      : localPath.replace(/^\/+/, "");
    return relative ? pathPosix.join(this.remoteRoot, relative) : this.remoteRoot;
  }

  private async run(
    remoteArgs: string[],
    options: { stdin?: string; timeoutMs?: number } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const proc = Bun.spawn([...this.sshArgs, ...remoteArgs], {
      stdin: options.stdin !== undefined ? "pipe" : undefined,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();

    if (options.stdin !== undefined) {
      await proc.stdin!.write(options.stdin);
      await proc.stdin!.end();
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const exitCode = await Promise.race([
      proc.exited,
      new Promise<number>((resolve) =>
        (timeoutId = setTimeout(() => {
          timedOut = true;
          resolve(124);
        }, timeoutMs)),
      ),
    ]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (timedOut) {
      try {
        proc.kill();
      } catch {
        // Ignore kill errors if the process already exited.
      }
    }

    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    return { stdout, stderr, exitCode };
  }

  private async runShell(
    script: string,
    options: { stdin?: string; timeoutMs?: number } = {},
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return this.run(["bash", "-lc", script], options);
  }

  async exec(
    command: string,
    cwd: string,
    options: {
      onData: (data: Buffer) => void;
      signal?: AbortSignal;
      timeout?: number;
      env?: NodeJS.ProcessEnv;
    },
  ): Promise<{ exitCode: number | null }> {
    const remoteCwd = this.mapPath(cwd);
    const envPrefix = Object.entries(options.env ?? {})
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([key, value]) => `${key}=${shellEscape(value)}`)
      .join(" ");
    const script = `cd ${shellEscape(remoteCwd)} && ${envPrefix ? `${envPrefix} ` : ""}${command}`;

    const proc = Bun.spawn([...this.sshArgs, "bash", "-lc", script], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const pump = async (stream: ReadableStream<Uint8Array> | null) => {
      if (!stream) return;
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) return;
          if (value) {
            options.onData(Buffer.from(value));
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    const abort = () => {
      try {
        proc.kill();
      } catch {
        // Ignore abort races.
      }
    };

    options.signal?.addEventListener("abort", abort, { once: true });

    const timeout = options.timeout
      ? setTimeout(() => {
          abort();
        }, options.timeout)
      : undefined;

    await Promise.all([pump(proc.stdout), pump(proc.stderr)]);
    const exitCode = await proc.exited;
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    return { exitCode };
  }

  async readFile(localPath: string): Promise<Buffer> {
    const remotePath = this.mapPath(localPath);
    const result = await this.runShell(`base64 < ${shellEscape(remotePath)} | tr -d '\\n'`);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Failed to read ${remotePath}`);
    }
    return Buffer.from(result.stdout.trim(), "base64");
  }

  async access(localPath: string, mode: "read" | "write" | "readwrite"): Promise<void> {
    const remotePath = this.mapPath(localPath);
    const testFlag =
      mode === "read" ? "-r" : mode === "write" ? "-w" : "-r";
    const secondCheck =
      mode === "readwrite" ? ` && test -w ${shellEscape(remotePath)}` : "";
    const result = await this.runShell(`test ${testFlag} ${shellEscape(remotePath)}${secondCheck}`);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Path is not accessible: ${remotePath}`);
    }
  }

  async writeFile(localPath: string, content: string): Promise<void> {
    const remotePath = this.mapPath(localPath);
    const base64 = Buffer.from(content, "utf8").toString("base64");
    const result = await this.runShell(
      `mkdir -p ${shellEscape(pathPosix.dirname(remotePath))} && base64 -d > ${shellEscape(remotePath)}`,
      { stdin: base64 },
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Failed to write ${remotePath}`);
    }
  }

  async mkdir(localDir: string): Promise<void> {
    const remoteDir = this.mapPath(localDir);
    const result = await this.runShell(`mkdir -p ${shellEscape(remoteDir)}`);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Failed to create ${remoteDir}`);
    }
  }

  async exists(localPath: string): Promise<boolean> {
    const remotePath = this.mapPath(localPath);
    const result = await this.runShell(`test -e ${shellEscape(remotePath)}`);
    return result.exitCode === 0;
  }

  async stat(localPath: string): Promise<{ isDirectory: () => boolean }> {
    const remotePath = this.mapPath(localPath);
    const result = await this.runShell(
      `if [ -d ${shellEscape(remotePath)} ]; then echo dir; elif [ -e ${shellEscape(remotePath)} ]; then echo file; else exit 1; fi`,
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Path not found: ${remotePath}`);
    }
    return {
      isDirectory: () => result.stdout.trim() === "dir",
    };
  }

  async readdir(localPath: string): Promise<string[]> {
    const remotePath = this.mapPath(localPath);
    const result = await this.runShell(`cd ${shellEscape(remotePath)} && ls -1A`);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `Failed to list ${remotePath}`);
    }
    return result.stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  async glob(
    pattern: string,
    cwd: string,
    options: { ignore: string[]; limit: number },
  ): Promise<string[]> {
    const remoteCwd = this.mapPath(cwd);
    const ignoreArgs = options.ignore
      .filter(Boolean)
      .map((ignore) => `-E ${shellEscape(ignore)}`)
      .join(" ");
    const script = [
      `cd ${shellEscape(remoteCwd)}`,
      "if command -v fd >/dev/null 2>&1; then",
      `  fd --hidden --type f --glob ${ignoreArgs} ${shellEscape(pattern)} . | head -n ${options.limit}`,
      "else",
      `  find . -type f -name ${shellEscape(pattern.replace(/^\*\*\//, ""))} | sed 's#^\\./##' | head -n ${options.limit}`,
      "fi",
    ].join(" ; ");

    const result = await this.runShell(script);
    if (result.exitCode !== 0 && result.exitCode !== 1) {
      throw new Error(result.stderr.trim() || `Failed to search ${remoteCwd}`);
    }
    return result.stdout
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

async function resolveWorkspaceId(repoSlug: string): Promise<string> {
  const [owner, repo] = repoSlug.split("/");
  const workspaces = await api<WorkspaceRecord[]>(
    "GET",
    `/api/repos/${owner}/${repo}/workspaces`,
  );

  const reusable =
    workspaces.find((workspace) => workspace.status === "running") ??
    workspaces.find(
      (workspace) =>
        workspace.status === "starting" ||
        workspace.status === "suspended" ||
        (workspace.status === "pending" && Boolean(workspace.freestyle_vm_id?.trim())),
    );
  if (reusable) {
    return reusable.id;
  }

  const created = await api<{ id: string }>(
    "POST",
    `/api/repos/${owner}/${repo}/workspaces`,
    { name: "" },
  );
  return created.id;
}

async function loadWorkspaceSshInfo(
  repoSlug: string,
  workspaceId: string,
): Promise<WorkspaceSshInfo> {
  const [owner, repo] = repoSlug.split("/");
  return api<WorkspaceSshInfo>(
    "GET",
    `/api/repos/${owner}/${repo}/workspaces/${workspaceId}/ssh`,
  );
}

function resolveSshArgs(info: WorkspaceSshInfo): string[] {
  const command = info.command ?? info.ssh_command;
  if (command) {
    return tokenizeShellWords(command);
  }

  if (info.ssh_host) {
    const args = ["ssh"];
    if (info.port && info.port !== 22) {
      args.push("-p", String(info.port));
    }
    args.push(info.ssh_host);
    return args;
  }

  throw new Error("Workspace SSH details are incomplete.");
}

export async function createWorkspaceBackend(
  options: CreateWorkspaceBackendOptions,
): Promise<AgentExecutionBackend> {
  const { repoContext } = options;

  if (!repoContext.repoRoot) {
    throw new Error(
      "Sandbox mode requires a local jj repository. Run `codeplane agent` from inside a repo.",
    );
  }

  if (!repoContext.repoSlug) {
    throw new Error(
      "Sandbox mode requires a Codeplane repository slug. Use `--repo OWNER/REPO` or add a Codeplane remote.",
    );
  }

  if (!repoContext.auth.loggedIn) {
    throw new Error(
      "Sandbox mode requires Codeplane auth. Run `codeplane auth login` first.",
    );
  }

  const workspaceId = await resolveWorkspaceId(repoContext.repoSlug);
  const sshInfo = await loadWorkspaceSshInfo(repoContext.repoSlug, workspaceId);
  const sshArgs = resolveSshArgs(sshInfo);
  const remoteClient = new WorkspaceRemoteClient(
    sshArgs,
    repoContext.repoRoot,
    DEFAULT_REMOTE_ROOT,
  );
  const cwd = repoContext.repoRoot;

  return {
    kind: "workspace",
    displayName: "sandbox",
    cwd,
    createPiTools() {
      return [
        createReadTool(cwd, {
          operations: {
            readFile: (absolutePath) => remoteClient.readFile(absolutePath),
            access: (absolutePath) => remoteClient.access(absolutePath, "read"),
          },
        }),
        createWriteTool(cwd, {
          operations: {
            writeFile: (absolutePath, content) => remoteClient.writeFile(absolutePath, content),
            mkdir: (dir) => remoteClient.mkdir(dir),
          },
        }),
        createEditTool(cwd, {
          operations: {
            readFile: (absolutePath) => remoteClient.readFile(absolutePath),
            writeFile: (absolutePath, content) => remoteClient.writeFile(absolutePath, content),
            access: (absolutePath) => remoteClient.access(absolutePath, "readwrite"),
          },
        }),
        createBashTool(cwd, {
          operations: {
            exec: (command, toolCwd, execOptions) =>
              remoteClient.exec(command, toolCwd, execOptions),
          },
        }),
        createFindTool(cwd, {
          operations: {
            exists: (absolutePath) => remoteClient.exists(absolutePath),
            glob: (pattern, toolCwd, findOptions) =>
              remoteClient.glob(pattern, toolCwd, findOptions),
          },
        }),
        createLsTool(cwd, {
          operations: {
            exists: (absolutePath) => remoteClient.exists(absolutePath),
            stat: (absolutePath) => remoteClient.stat(absolutePath),
            readdir: (absolutePath) => remoteClient.readdir(absolutePath),
          },
        }),
      ];
    },
    describeContext() {
      return {
        backend: "workspace",
        workspaceId,
        remoteRoot: DEFAULT_REMOTE_ROOT,
        repoSlug: repoContext.repoSlug,
      };
    },
    async dispose() {
      // The workspace remains available for reuse after the local agent exits.
    },
  };
}
