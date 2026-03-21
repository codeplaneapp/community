/**
 * Codeplane CLI configuration.
 *
 * Non-secret settings live in ~/.config/codeplane/config.toon. Authentication
 * tokens are resolved separately so they never need to be written here.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";

export type GitProtocol = "ssh" | "https";

export interface Config {
  api_url: string;
  git_protocol: GitProtocol;
  agent_issue_repo?: string;
}

export interface RawConfig extends Config {
  token?: string;
}

const DEFAULT_API_URL = "https://api.codeplane.app";

export function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
}

/** Resolve the XDG config directory. */
function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) return xdg;

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return join(homedir(), ".config");
}

/** Resolve the XDG cache directory. */
function cacheBaseDir(): string {
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && xdg.length > 0) return xdg;

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches");
  }
  return join(homedir(), ".cache");
}

/** Resolve the XDG state directory. */
function stateBaseDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  if (xdg && xdg.length > 0) return xdg;

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return join(homedir(), ".local", "state");
}

/** Path to the config file. */
export function configPath(): string {
  return join(configDir(), "codeplane", "config.toon");
}

/** Path to the Codeplane cache directory. */
export function cacheDir(): string {
  return join(cacheBaseDir(), "codeplane");
}

/** Path to the Codeplane state directory. */
export function stateDir(): string {
  return join(stateBaseDir(), "codeplane");
}

/** Load config from disk without env overlay. */
export function loadRaw(): RawConfig {
  const path = configPath();
  if (!existsSync(path)) {
    return { api_url: DEFAULT_API_URL, git_protocol: "ssh" };
  }

  const contents = readFileSync(path, "utf-8");
  const parsed = yaml.load(contents) as Record<string, unknown> | null;
  if (!parsed || typeof parsed !== "object") {
    return { api_url: DEFAULT_API_URL, git_protocol: "ssh" };
  }

  return {
    api_url:
      typeof parsed.api_url === "string"
        ? normalizeApiUrl(parsed.api_url)
        : DEFAULT_API_URL,
    token: typeof parsed.token === "string" ? parsed.token : undefined,
    agent_issue_repo:
      typeof parsed.agent_issue_repo === "string" ? parsed.agent_issue_repo : undefined,
    git_protocol:
      parsed.git_protocol === "https" ? "https" : "ssh",
  };
}

/** Load config from disk with CODEPLANE_TOKEN env overlay. */
export function loadConfig(): Config {
  const raw = loadRaw();
  const config: Config = {
    api_url: raw.api_url,
    git_protocol: raw.git_protocol,
    agent_issue_repo: raw.agent_issue_repo,
  };
  const envIssueRepo = process.env.CODEPLANE_AGENT_ISSUE_REPO;
  if (envIssueRepo) {
    config.agent_issue_repo = envIssueRepo;
  }
  return config;
}

function writeRawConfig(config: RawConfig): void {
  const path = configPath();
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });

  const content = yaml.dump(config, { lineWidth: -1 });
  writeFileSync(path, content, "utf-8");
}

/** Save non-secret config to disk. */
export function saveConfig(config: Partial<Config>): void {
  const existing = loadRaw();
  const merged: RawConfig = {
    api_url: normalizeApiUrl(config.api_url ?? existing.api_url),
    git_protocol: config.git_protocol ?? existing.git_protocol,
    agent_issue_repo: config.agent_issue_repo ?? existing.agent_issue_repo,
  };
  writeRawConfig(merged);
}

/** Remove any legacy token that may still exist in the config file. */
export function clearLegacyToken(): boolean {
  const existing = loadRaw();
  if (!existing.token) {
    return false;
  }

  const { token: _token, ...rest } = existing;
  writeRawConfig(rest);
  return true;
}

/** Extract hostname from api_url (e.g. "https://api.codeplane.app" → "codeplane.app"). */
export function hostFromUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    const host = url.hostname;
    return host.startsWith("api.") ? host.slice(4).toLowerCase() : host.toLowerCase();
  } catch {
    const trimmed = apiUrl.trim().toLowerCase();
    return trimmed.startsWith("api.") ? trimmed.slice(4) : trimmed;
  }
}
