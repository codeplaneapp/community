import type { CreateAgentSessionOptions } from "@mariozechner/pi-coding-agent";
import type { AuthTokenSource } from "../auth-state.js";

type Tool = NonNullable<CreateAgentSessionOptions["tools"]>[number];

export interface CommandCapture {
  command: string;
  ok: boolean;
  output?: string;
  error?: string;
  exitCode?: number | null;
}

export interface RepoAuthStatus {
  loggedIn: boolean;
  host: string;
  user?: string;
  tokenSource?: AuthTokenSource;
  message?: string;
  verified: boolean;
}

export interface RemoteRepoAvailability {
  checked: boolean;
  available?: boolean;
  status?: number;
  message?: string;
  url?: string;
}

export interface RepoContext {
  collectedAt: string;
  cwd: string;
  repoRoot: string | null;
  repoSlug: string | null;
  repoSource: "override" | "detected" | "unavailable";
  jjRemotes: CommandCapture;
  jjStatus: CommandCapture;
  auth: RepoAuthStatus;
  remoteRepo: RemoteRepoAvailability;
  warnings: string[];
  backend?: Record<string, unknown>;
}

export interface DocsCorpusStatus {
  url: string;
  status: "fresh" | "stale" | "unavailable";
  source: "network" | "cache" | "none";
  fetchedAt?: string;
  warning?: string;
  etag?: string;
  lastModified?: string;
}

export interface AgentExecutionBackend {
  kind: "local" | "workspace";
  displayName: string;
  cwd: string;
  createPiTools(): Tool[];
  describeContext(): Record<string, unknown>;
  dispose(): Promise<void>;
}

export interface RuntimeWarnings {
  docs?: string;
  backend?: string;
}
