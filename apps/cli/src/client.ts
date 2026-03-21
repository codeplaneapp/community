/**
 * Codeplane API client.
 *
 * Typed HTTP client matching the Rust CLI's api_client.rs.
 * Loads config for API URL and auth token.
 */
import { execSync } from "node:child_process";
import { requireAuthToken } from "./auth-state.js";
import type { GitProtocol } from "./config.js";
import { loadConfig, hostFromUrl } from "./config.js";

/**
 * Verify that `jj` is installed and available on PATH.
 * Throws a helpful error with install instructions if not found.
 */
let jjChecked = false;
export function requireJj(): void {
  if (jjChecked) return;
  try {
    execSync("jj --version", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    jjChecked = true;
  } catch {
    throw new Error(
      [
        "jj (Jujutsu) is not installed or not on your PATH.",
        "",
        "Codeplane requires jj for local repository operations.",
        "",
        "Install it:",
        "  brew install jj            # macOS",
        "  cargo install jj-cli       # any platform",
        "  https://jj-vcs.github.io/jj/latest/install-and-setup/",
      ].join("\n"),
    );
  }
}

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(method: string, path: string, status: number, detail: string) {
    super(`${method} ${path} → ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
}

function getClientOptions(): ApiClientOptions {
  const auth = requireAuthToken();
  return {
    baseUrl: auth.apiUrl,
    token: auth.token,
  };
}

/** Resolve repo reference from -R flag or git remote detection. */
export function resolveRepoRef(
  repoOverride?: string,
): { owner: string; repo: string } {
  if (repoOverride) {
    const host = hostFromUrl(loadConfig().api_url);
    const parsed = parseRepoOverride(repoOverride, host);
    if (!parsed) {
      throw new Error([
        `Invalid repo format: "${repoOverride}".`,
        `Expected OWNER/REPO or a clone URL on ${host}.`,
      ].join(" "));
    }
    return { owner: parsed.owner, repo: parsed.repo };
  }

  // Detect from jj/git remotes in cwd
  const detected = detectRepoFromRemotes();
  if (detected) return detected;

  throw new Error(
    "Could not determine repository. Use -R OWNER/REPO or run from within a repo.",
  );
}

export function resolveRepoCloneTarget(
  repoRef: string,
  protocol: GitProtocol,
  apiUrl = loadConfig().api_url,
): { owner: string; repo: string; cloneUrl: string } {
  const host = hostFromUrl(apiUrl);
  const parsed = parseRepoOverride(repoRef, host);
  if (!parsed) {
    throw new Error([
      `Invalid repo format: "${repoRef}".`,
      `Expected OWNER/REPO or a clone URL on ${host}.`,
    ].join(" "));
  }

  return {
    owner: parsed.owner,
    repo: parsed.repo,
    cloneUrl: parsed.cloneUrl ?? buildCloneUrl(parsed.owner, parsed.repo, protocol, apiUrl),
  };
}

export function buildCloneUrl(
  owner: string,
  repo: string,
  protocol: GitProtocol,
  apiUrl = loadConfig().api_url,
): string {
  const host = hostFromUrl(apiUrl);
  return protocol === "https"
    ? `https://${host}/${owner}/${repo}.git`
    : `git@ssh.${host}:${owner}/${repo}.git`;
}

function parseRepoOverride(
  repoOverride: string,
  host: string,
): { owner: string; repo: string; cloneUrl?: string } | null {
  const trimmed = repoOverride.trim();
  const urlMatch = parseRepoFromUrl(trimmed, host);
  if (urlMatch) {
    return { ...urlMatch, cloneUrl: trimmed };
  }

  const slugMatch = parseOwnerRepoRef(trimmed);
  if (slugMatch) {
    return slugMatch;
  }

  return null;
}

function parseOwnerRepoRef(repoRef: string): { owner: string; repo: string } | null {
  const parts = repoRef.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Parse OWNER/REPO from a remote URL matching the configured Codeplane host.
 *
 * Supported formats:
 *   ssh://git@ssh.codeplane.app/OWNER/REPO.git
 *   git@ssh.codeplane.app:OWNER/REPO.git
 *   https://codeplane.app/OWNER/REPO.git
 */
function parseRepoFromUrl(
  url: string,
  host: string,
): { owner: string; repo: string } | null {
  // Normalize: strip trailing .git
  const clean = url.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  const normalizedHost = host.toLowerCase();
  const acceptedHosts = new Set([
    normalizedHost,
    `ssh.${normalizedHost}`,
    `api.${normalizedHost}`,
  ]);
  if (normalizedHost === "127.0.0.1" || normalizedHost === "localhost") {
    acceptedHosts.add("codeplane.app");
    acceptedHosts.add("ssh.codeplane.app");
    acceptedHosts.add("api.codeplane.app");
  }

  // ssh:// style
  try {
    const parsed = new URL(clean);
    const h = parsed.hostname.toLowerCase();
    if (acceptedHosts.has(h)) {
      const parts = parsed.pathname.replace(/^\//, "").split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  } catch {
    // Not a URL — try SCP-style
  }

  // SCP-style: git@ssh.codeplane.app:OWNER/REPO
  const scpMatch = clean.match(/^[^@]+@([^:]+):(.+)$/);
  if (scpMatch) {
    const h = scpMatch[1]!.toLowerCase();
    if (acceptedHosts.has(h)) {
      const parts = scpMatch[2]!.split("/");
      if (parts.length === 2 && parts[0] && parts[1]) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
  }

  // JJ sometimes normalizes SCP-style remotes into "https://ssh.host:OWNER/REPO".
  const pseudoUrlMatch = clean.match(/^[a-z]+:\/\/([^:]+):([^/]+)\/([^/]+)$/i);
  if (pseudoUrlMatch) {
    const h = pseudoUrlMatch[1]!.toLowerCase();
    if (acceptedHosts.has(h)) {
      return { owner: pseudoUrlMatch[2]!, repo: pseudoUrlMatch[3]! };
    }
  }

  return null;
}

/** Detect OWNER/REPO from jj git remotes in the current working directory. */
function detectRepoFromRemotes(): { owner: string; repo: string } | null {
  const config = loadConfig();
  const host = hostFromUrl(config.api_url);

  const outputs: string[] = [];
  try {
    requireJj();
    outputs.push(execSync("jj git remote list", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }));
  } catch {
    // Fall through to git-based detection below.
  }

  try {
    outputs.push(execSync("git remote -v", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }));
  } catch {
    // Ignore git detection errors as well.
  }

  if (outputs.length === 0) {
    return null;
  }

  // Parse lines like: "origin ssh://git@ssh.codeplane.app/owner/repo.git"
  // Prefer "origin" remote, fall back to first match
  let fallback: { owner: string; repo: string } | null = null;
  for (const output of outputs) {
    for (const line of output.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const [name, url] = parts;
      const parsed = parseRepoFromUrl(url!, host);
      if (parsed) {
        if (name === "origin") return parsed;
        fallback ??= parsed;
      }
    }
  }

  return fallback;
}

/** Make an authenticated API request. */
export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options?: { token?: string; baseUrl?: string },
): Promise<T> {
  const opts = options ?? getClientOptions();
  const baseUrl = opts.baseUrl ?? getClientOptions().baseUrl;
  const token = opts.token ?? getClientOptions().token;
  const url = `${baseUrl}${path}`;

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
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
    throw new ApiError(method, path, res.status, detail);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}
