import { getAuthStatus, requireAuthToken } from "../auth-state.js";
import { hostFromUrl, loadConfig } from "../config.js";
import { ApiError, requireJj, resolveRepoRef } from "../client.js";
import type {
  CommandCapture,
  RemoteRepoAvailability,
  RepoAuthStatus,
  RepoContext,
} from "./types.js";

export interface CommandRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<CommandRunnerResult>;

export interface CollectRepoContextOptions {
  cwd?: string;
  repoOverride?: string;
  fetchImpl?: typeof fetch;
  runner?: CommandRunner;
  requireJjFn?: () => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

const defaultRunner: CommandRunner = async (command, args, options = {}) => {
  const proc = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();

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
      // Ignore kill errors if the process exited while timing out.
    }
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    stdout,
    stderr,
    exitCode,
  };
};

function trimOutput(value: string | undefined, maxChars = 8_000): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars)}\n...[truncated]`;
}

function parseRepoFromRemoteUrl(
  url: string,
  host: string,
): { owner: string; repo: string } | null {
  const clean = url.replace(/\.git$/, "");

  try {
    const parsed = new URL(clean);
    const remoteHost = parsed.hostname;
    if (remoteHost === host || remoteHost === `ssh.${host}` || remoteHost === `api.${host}`) {
      const parts = parsed.pathname.replace(/^\//, "").split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {
    // Fall through to scp-style parsing.
  }

  const scpMatch = clean.match(/^[^@]+@([^:]+):(.+)$/);
  if (!scpMatch) {
    const pseudoUrlMatch = clean.match(/^[a-z]+:\/\/([^:]+):([^/]+)\/([^/]+)$/i);
    if (!pseudoUrlMatch) {
      return null;
    }

    const remoteHost = pseudoUrlMatch[1];
    if (
      remoteHost !== host &&
      remoteHost !== `ssh.${host}` &&
      remoteHost !== `api.${host}`
    ) {
      return null;
    }

    return {
      owner: pseudoUrlMatch[2]!,
      repo: pseudoUrlMatch[3]!,
    };
  }

  const remoteHost = scpMatch[1]!;
  if (remoteHost !== host && remoteHost !== `ssh.${host}`) {
    return null;
  }

  const parts = scpMatch[2]!.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return { owner: parts[0], repo: parts[1] };
}

function detectRepoSlugFromRemotes(output: string | undefined): string | null {
  if (!output) return null;

  const host = hostFromUrl(loadConfig().api_url);
  let fallback: string | null = null;

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;

    const [name, url] = parts;
    const parsed = parseRepoFromRemoteUrl(url!, host);
    if (!parsed) continue;

    const slug = `${parsed.owner}/${parsed.repo}`;
    if (name === "origin") {
      return slug;
    }
    fallback ??= slug;
  }

  return fallback;
}

async function runCapturedCommand(
  runner: CommandRunner,
  command: string,
  args: string[],
  cwd?: string,
): Promise<CommandCapture> {
  const result = await runner(command, args, { cwd, timeoutMs: DEFAULT_TIMEOUT_MS });
  const commandText = [command, ...args].join(" ");

  if (result.exitCode === 0) {
    return {
      command: commandText,
      ok: true,
      output: trimOutput(result.stdout),
      exitCode: result.exitCode,
    };
  }

  return {
    command: commandText,
    ok: false,
    output: trimOutput(result.stdout),
    error: trimOutput(result.stderr) ?? `Command exited with code ${result.exitCode ?? "unknown"}`,
    exitCode: result.exitCode,
  };
}

async function detectRepoRoot(
  runner: CommandRunner,
  cwd: string,
): Promise<string | null> {
  const result = await runner("jj", ["root"], { cwd, timeoutMs: DEFAULT_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    return null;
  }
  const repoRoot = result.stdout.trim();
  return repoRoot.length > 0 ? repoRoot : null;
}

function mapAuthStatus(status: Awaited<ReturnType<typeof getAuthStatus>>): RepoAuthStatus {
  return {
    loggedIn: status.logged_in,
    host: status.host,
    user: status.user,
    tokenSource: status.token_source,
    message: status.message,
    verified: status.logged_in && !status.message?.includes("Could not verify"),
  };
}

async function checkRemoteRepoAvailability(
  repoSlug: string | null,
  auth: RepoAuthStatus,
  fetchImpl: typeof fetch,
): Promise<RemoteRepoAvailability> {
  if (!repoSlug || !auth.loggedIn) {
    return {
      checked: false,
      message: repoSlug ? "Skipped because Codeplane auth is unavailable" : "No Codeplane repo detected",
    };
  }

  const authToken = requireAuthToken();
  const [owner, repo] = repoSlug.split("/");
  const path = `/api/repos/${owner}/${repo}`;
  const url = `${authToken.apiUrl}${path}`;

  try {
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `token ${authToken.token}`,
        Accept: "application/json",
      },
    });
    if (res.ok) {
      return {
        checked: true,
        available: true,
        status: res.status,
        url,
      };
    }

    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) {
        message = body.message;
      }
    } catch {
      // Ignore JSON parse failures for non-JSON responses.
    }

    return {
      checked: true,
      available: false,
      status: res.status,
      message,
      url,
    };
  } catch (error) {
    const message = error instanceof ApiError ? error.detail : String(error);
    return {
      checked: true,
      available: false,
      message,
      url,
    };
  }
}

export async function collectRepoContext(
  options: CollectRepoContextOptions = {},
): Promise<RepoContext> {
  const cwd = options.cwd ?? process.cwd();
  const runner = options.runner ?? defaultRunner;
  const fetchImpl = options.fetchImpl ?? fetch;
  const requireJjFn = options.requireJjFn ?? requireJj;

  requireJjFn();

  const warnings: string[] = [];
  const repoRoot = await detectRepoRoot(runner, cwd);
  const jjCommandCwd = repoRoot ?? cwd;

  const jjRemotes = await runCapturedCommand(runner, "jj", ["git", "remote", "list"], jjCommandCwd);
  const jjStatus = await runCapturedCommand(runner, "jj", ["status"], jjCommandCwd);

  let repoSlug: string | null = null;
  let repoSource: RepoContext["repoSource"] = "unavailable";

  if (options.repoOverride) {
    const { owner, repo } = resolveRepoRef(options.repoOverride);
    repoSlug = `${owner}/${repo}`;
    repoSource = "override";
  } else {
    repoSlug = detectRepoSlugFromRemotes(jjRemotes.output);
    if (repoSlug) {
      repoSource = "detected";
    } else {
      warnings.push(
        "Could not determine the current Codeplane repository from local remotes.",
      );
    }
  }

  if (!repoRoot) {
    warnings.push("No local jj repository was detected from the current working directory.");
  }
  if (!jjRemotes.ok && jjRemotes.error) {
    warnings.push(`Failed to collect \`jj git remote list\`: ${jjRemotes.error}`);
  }
  if (!jjStatus.ok && jjStatus.error) {
    warnings.push(`Failed to collect \`jj status\`: ${jjStatus.error}`);
  }

  const auth = mapAuthStatus(await getAuthStatus(fetchImpl));
  const remoteRepo = await checkRemoteRepoAvailability(repoSlug, auth, fetchImpl);

  return {
    collectedAt: new Date().toISOString(),
    cwd,
    repoRoot,
    repoSlug,
    repoSource,
    jjRemotes,
    jjStatus,
    auth,
    remoteRepo,
    warnings,
  };
}
