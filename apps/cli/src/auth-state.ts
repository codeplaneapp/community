import {
  clearLegacyToken,
  hostFromUrl,
  loadConfig,
  loadRaw,
  normalizeApiUrl,
  saveConfig,
} from "./config.js";
import { deleteStoredToken, loadStoredToken, storeToken } from "./credentials.js";

export type AuthTokenSource = "env" | "keyring" | "config";

export interface AuthTarget {
  apiUrl: string;
  host: string;
}

export interface ResolvedAuthToken extends AuthTarget {
  source: AuthTokenSource;
  token: string;
}

export interface AuthStatusResult {
  logged_in: boolean;
  api_url: string;
  host: string;
  token_set: boolean;
  user?: string;
  token_source?: AuthTokenSource;
  message: string;
}

function isLoopbackHost(host: string): boolean {
  return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)(?::\d+)?$/i.test(host.trim());
}

export function apiUrlFromHostInput(hostnameOrApiUrl: string): string {
  const value = hostnameOrApiUrl.trim();
  if (!value) {
    throw new Error("Hostname is required.");
  }

  if (/^https?:\/\//i.test(value)) {
    return normalizeApiUrl(value);
  }

  if (isLoopbackHost(value)) {
    return `http://${value}`;
  }

  const apiHost = value.startsWith("api.") ? value : `api.${hostFromUrl(value)}`;
  return `https://${apiHost}`;
}

export function resolveAuthTarget(
  options: { apiUrl?: string; hostname?: string } = {},
): AuthTarget {
  if (options.apiUrl?.trim()) {
    const apiUrl = normalizeApiUrl(options.apiUrl);
    return { apiUrl, host: hostFromUrl(apiUrl) };
  }

  const config = loadConfig();
  const configuredApiUrl = normalizeApiUrl(config.api_url);
  const configuredHost = hostFromUrl(configuredApiUrl);

  if (!options.hostname?.trim()) {
    return { apiUrl: configuredApiUrl, host: configuredHost };
  }

  const explicit = options.hostname.trim();
  if (/^https?:\/\//i.test(explicit)) {
    const apiUrl = normalizeApiUrl(explicit);
    return { apiUrl, host: hostFromUrl(apiUrl) };
  }

  const host = hostFromUrl(explicit);
  if (host === configuredHost) {
    return { apiUrl: configuredApiUrl, host };
  }

  return { apiUrl: apiUrlFromHostInput(explicit), host };
}

export function formatTokenSource(source: AuthTokenSource): string {
  switch (source) {
    case "env":
      return "CODEPLANE_TOKEN env";
    case "keyring":
      return "keyring";
    case "config":
      return "config file";
  }
}

function readLegacyTokenForTarget(target: AuthTarget): string | null {
  const raw = loadRaw();
  if (hostFromUrl(raw.api_url) !== target.host) {
    return null;
  }

  const token = raw.token?.trim();
  return token ? token : null;
}

function scrubLegacyTokenIfCurrentHost(target: AuthTarget): boolean {
  const raw = loadRaw();
  if (!raw.token || hostFromUrl(raw.api_url) !== target.host) {
    return false;
  }
  return clearLegacyToken();
}

export function resolveAuthToken(
  options: { apiUrl?: string; hostname?: string } = {},
): ResolvedAuthToken | null {
  const target = resolveAuthTarget(options);
  const envToken = process.env.CODEPLANE_TOKEN?.trim();
  if (envToken) {
    return {
      ...target,
      source: "env",
      token: envToken,
    };
  }

  const storedToken = loadStoredToken(target.host)?.trim();
  if (storedToken) {
    return {
      ...target,
      source: "keyring",
      token: storedToken,
    };
  }

  const legacyToken = readLegacyTokenForTarget(target);
  if (!legacyToken) {
    return null;
  }

  return {
    ...target,
    source: "config",
    token: legacyToken,
  };
}

export function requireAuthToken(
  options: { apiUrl?: string; hostname?: string } = {},
): ResolvedAuthToken {
  const resolved = resolveAuthToken(options);
  if (resolved) {
    return resolved;
  }

  const target = resolveAuthTarget(options);
  throw new Error(
    `no token found for ${target.host}. Run \`codeplane auth login\` or set CODEPLANE_TOKEN.`,
  );
}

export function persistAuthToken(
  token: string,
  options: { apiUrl?: string; hostname?: string } = {},
): AuthTarget {
  const target = resolveAuthTarget(options);
  storeToken(target.host, token.trim());
  saveConfig({ api_url: target.apiUrl });
  scrubLegacyTokenIfCurrentHost(target);
  return target;
}

export function clearAuthToken(
  options: { apiUrl?: string; hostname?: string } = {},
): AuthTarget & { cleared: boolean; legacy_cleared: boolean } {
  const target = resolveAuthTarget(options);
  const cleared = deleteStoredToken(target.host);
  const legacyCleared = scrubLegacyTokenIfCurrentHost(target);
  return {
    ...target,
    cleared,
    legacy_cleared: legacyCleared,
  };
}

export async function getAuthStatus(
  fetchImpl: typeof fetch = fetch,
  options: { apiUrl?: string; hostname?: string } = {},
): Promise<AuthStatusResult> {
  const target = resolveAuthTarget(options);
  const resolved = resolveAuthToken(options);
  if (!resolved) {
    return {
      logged_in: false,
      api_url: target.apiUrl,
      host: target.host,
      token_set: false,
      message: `Not logged in to ${target.host}`,
    };
  }

  const source = formatTokenSource(resolved.source);
  try {
    const res = await fetchImpl(`${resolved.apiUrl}/api/user`, {
      headers: {
        Authorization: `token ${resolved.token}`,
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const user = (await res.json()) as { login?: string; username?: string };
      const username = user.login ?? user.username;
      return {
        logged_in: true,
        api_url: resolved.apiUrl,
        host: resolved.host,
        token_set: true,
        user: username,
        token_source: resolved.source,
        message: username
          ? `Logged in to ${resolved.host} as ${username} via ${source}`
          : `Logged in to ${resolved.host} via ${source}`,
      };
    }

    return {
      logged_in: false,
      api_url: resolved.apiUrl,
      host: resolved.host,
      token_set: true,
      token_source: resolved.source,
      message: `Stored token for ${resolved.host} from ${source} is invalid or expired`,
    };
  } catch {
    return {
      logged_in: true,
      api_url: resolved.apiUrl,
      host: resolved.host,
      token_set: true,
      token_source: resolved.source,
      message: `Logged in to ${resolved.host} via ${source} (could not verify token due to network error)`,
    };
  }
}
