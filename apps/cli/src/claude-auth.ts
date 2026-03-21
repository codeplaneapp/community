import { spawnSync } from "node:child_process";
import { deleteStoredToken, loadStoredToken, storeToken } from "./credentials.js";

const CLAUDE_SETUP_TOKEN_STORAGE_KEY = "claude.subscription-token";
const CLAUDE_CODE_KEYCHAIN_SERVICE = "Claude Code-credentials";
const CLAUDE_SETUP_TOKEN_PATTERN = /\bsk-ant-oat[0-9a-z-]*-[A-Za-z0-9._-]+\b/;
const CLAUDE_SETUP_TOKEN_PIPE_COMMAND = "claude setup-token | codeplane auth claude login";
const CLAUDE_LOCAL_LOGIN_COMMAND = "claude login";

interface ClaudeCodeKeychainPayload {
  claudeAiOauth?: {
    accessToken?: string;
  };
}

export type ClaudeAuthSource =
  | "env_auth_token"
  | "stored_subscription_token"
  | "env_api_key"
  | "local_claude_keychain";

export interface ResolvedClaudeAuth {
  env: Record<string, string>;
  source: ClaudeAuthSource;
}

interface ClaudeAuthRemediationOptions {
  markdown?: boolean;
  rerunCommand?: string;
}

function formatClaudeAuthEnvVars(options: ClaudeAuthRemediationOptions): string {
  return options.markdown
    ? "`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`"
    : "ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY";
}

function formatCodeLiteral(value: string, options: ClaudeAuthRemediationOptions): string {
  return options.markdown ? `\`${value}\`` : value;
}

export function describeClaudeAuthRemediation(
  options: ClaudeAuthRemediationOptions = {},
): string[] {
  const rerunSuffix = options.rerunCommand
    ? options.markdown
      ? ` and rerun \`${options.rerunCommand}\``
      : ` and rerun ${options.rerunCommand}`
    : "";

  return [
    `Run ${formatCodeLiteral(CLAUDE_SETUP_TOKEN_PIPE_COMMAND, options)}${rerunSuffix}.`,
    `Or set ${formatClaudeAuthEnvVars(options)}${rerunSuffix ? ` locally${rerunSuffix}` : ""}.`,
    `Or sign in with Claude Code locally (${formatCodeLiteral(CLAUDE_LOCAL_LOGIN_COMMAND, options)})${rerunSuffix}.`,
  ];
}

function extractClaudeSecurityPassword(output: string): string | null {
  const match = output.match(/password: "([\s\S]*)"\s*$/);
  return match?.[1]?.trim() || null;
}

export function extractClaudeSetupToken(input: string): string | null {
  const match = input.match(CLAUDE_SETUP_TOKEN_PATTERN);
  return match?.[0]?.trim() || null;
}

export function validateClaudeSetupToken(input: string): string {
  if (!input.trim()) {
    throw new Error("no Claude setup token provided on stdin");
  }

  const token = extractClaudeSetupToken(input);
  if (!token) {
    throw new Error(
      "Invalid Claude setup token. Run `claude setup-token` and provide the resulting sk-ant-oat token.",
    );
  }

  return token;
}

export function loadStoredClaudeAuthToken(): string | null {
  return loadStoredToken(CLAUDE_SETUP_TOKEN_STORAGE_KEY)?.trim() || null;
}

export function storeStoredClaudeAuthToken(token: string): void {
  storeToken(CLAUDE_SETUP_TOKEN_STORAGE_KEY, validateClaudeSetupToken(token));
}

export function deleteStoredClaudeAuthToken(): boolean {
  return deleteStoredToken(CLAUDE_SETUP_TOKEN_STORAGE_KEY);
}

export function loadClaudeOAuthAccessTokenFromKeychain(): string | null {
  const testPayload = process.env.CODEPLANE_TEST_CLAUDE_KEYCHAIN_PAYLOAD?.trim();
  if (testPayload) {
    try {
      const payload = JSON.parse(testPayload) as ClaudeCodeKeychainPayload;
      return payload.claudeAiOauth?.accessToken?.trim() || null;
    } catch {
      return null;
    }
  }

  if (process.platform !== "darwin") {
    return null;
  }

  const result = spawnSync(
    "security",
    ["find-generic-password", "-s", CLAUDE_CODE_KEYCHAIN_SERVICE, "-g"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return null;
  }

  const rawPassword =
    extractClaudeSecurityPassword(result.stderr) ||
    extractClaudeSecurityPassword(result.stdout);
  if (!rawPassword) {
    return null;
  }

  try {
    const payload = JSON.parse(rawPassword) as ClaudeCodeKeychainPayload;
    return payload.claudeAiOauth?.accessToken?.trim() || null;
  } catch {
    return null;
  }
}

export function resolveClaudeAuth(): ResolvedClaudeAuth | null {
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (authToken) {
    return {
      env: { ANTHROPIC_AUTH_TOKEN: authToken },
      source: "env_auth_token",
    };
  }

  const storedSubscriptionToken = loadStoredClaudeAuthToken();
  if (storedSubscriptionToken) {
    return {
      env: { ANTHROPIC_AUTH_TOKEN: storedSubscriptionToken },
      source: "stored_subscription_token",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (apiKey) {
    return {
      env: { ANTHROPIC_API_KEY: apiKey },
      source: "env_api_key",
    };
  }

  const keychainToken = loadClaudeOAuthAccessTokenFromKeychain();
  if (keychainToken) {
    return {
      env: { ANTHROPIC_AUTH_TOKEN: keychainToken },
      source: "local_claude_keychain",
    };
  }

  return null;
}

export function getClaudeAuthEnv(): Record<string, string> {
  return resolveClaudeAuth()?.env ?? {};
}

export function formatClaudeAuthSource(source: ClaudeAuthSource): string {
  switch (source) {
    case "env_auth_token":
      return "ANTHROPIC_AUTH_TOKEN env";
    case "stored_subscription_token":
      return "stored Claude subscription token";
    case "env_api_key":
      return "ANTHROPIC_API_KEY env";
    case "local_claude_keychain":
      return "local Claude Code login";
  }
}
