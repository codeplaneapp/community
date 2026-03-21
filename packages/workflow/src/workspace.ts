/**
 * Workspace, preview, and CI DSL for Codeplane.
 *
 * These functions are used in `.codeplane/workspace.ts` and `.codeplane/preview.ts`
 * to define repository workspace templates and preview environment configs.
 *
 * See docs/specs/workspaces.md sections 2.2-2.3 for the spec.
 */

// ── Validation helpers ──────────────────────────────────────────────────────

const TOOL_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const APT_PACKAGE_RE = /^[a-z0-9][a-z0-9.+\-]*$/;
const LINUX_USER_RE = /^[a-z_][a-z0-9_-]*[$]?$/;

function validateToolNames(tools: Record<string, string>): void {
  for (const name of Object.keys(tools)) {
    if (!TOOL_NAME_RE.test(name)) {
      throw new Error(
        `Invalid tool name "${name}": must be alphanumeric (may include hyphens and underscores, must start with alphanumeric)`,
      );
    }
  }
}

function validatePackageNames(packages: string[]): void {
  for (const pkg of packages) {
    if (!APT_PACKAGE_RE.test(pkg)) {
      throw new Error(
        `Invalid package name "${pkg}": must be a valid apt package name (lowercase alphanumeric, may include dots, plus, hyphens)`,
      );
    }
  }
}

function validatePort(port: number, label: string): void {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `Invalid port ${port} for ${label}: must be an integer between 1 and 65535`,
    );
  }
}

function validateUser(user: string): void {
  if (!LINUX_USER_RE.test(user) || user.length > 32) {
    throw new Error(
      `Invalid Linux username "${user}": must match [a-z_][a-z0-9_-]*[$]? and be at most 32 characters`,
    );
  }
}

function validateServices(
  services: Record<string, ServiceConfig> | undefined,
): void {
  if (!services) return;
  for (const [name, svc] of Object.entries(services)) {
    if (!svc.command || svc.command.trim().length === 0) {
      throw new Error(`Service "${name}" must have a non-empty command`);
    }
    if (svc.port !== undefined) {
      validatePort(svc.port, `service "${name}"`);
    }
  }
}

// ── Service configuration ───────────────────────────────────────────────────

export interface ServiceConfig {
  /** Shell command to start the service. */
  command: string;
  /** Port the service listens on. */
  port?: number;
  /** Shell command to check service health (exit 0 = healthy). */
  healthCheck?: string;
  /** String to watch for in stdout to determine readiness. */
  readySignal?: string;
}

// ── Workspace handle (passed to preview setup functions) ────────────────────

export interface WorkspaceHandle {
  /** Execute a shell command inside the workspace. */
  exec(
    command: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  /** Write a file inside the workspace. */
  writeFile(path: string, content: string): Promise<void>;
  /** Read a file from the workspace. */
  readFile(path: string): Promise<string>;
}

// ── Workspace template (.codeplane/workspace.ts) ────────────────────────────────

export interface WorkspaceConfig {
  /** Tools and runtimes to install, e.g. { bun: "latest", jj: "latest" }. */
  tools?: Record<string, string>;
  /** System packages to install via apt. */
  packages?: string[];
  /** Install command (runs once after clone, cached in snapshot). */
  install?: string;
  /** Long-running services to start in the workspace. */
  services?: Record<string, ServiceConfig>;
  /** Non-secret environment variables. */
  env?: Record<string, string>;
  /** Linux user to run as (default: "developer"). */
  user?: string;
  /** Persistence mode for workspace storage. */
  persistence?: "ephemeral" | "sticky" | "persistent";
  /** Auto-suspend timeout in seconds (default: 1800). */
  idleTimeout?: number;
}

export interface WorkspaceDefinition {
  _type: "workspace";
  config: WorkspaceConfig;
}

/**
 * Define a workspace template for a repository.
 *
 * Used in `.codeplane/workspace.ts`:
 * ```ts
 * import { defineWorkspace } from "@codeplane-ai/workflow";
 *
 * export default defineWorkspace({
 *   tools: { bun: "latest", jj: "latest" },
 *   packages: ["curl", "git", "jq"],
 *   install: "bun install",
 *   services: {
 *     "dev-server": { command: "bun run dev", port: 3000 },
 *   },
 * });
 * ```
 */
export function defineWorkspace(config: WorkspaceConfig): WorkspaceDefinition {
  if (config.tools) {
    validateToolNames(config.tools);
  }
  if (config.packages) {
    validatePackageNames(config.packages);
  }
  if (config.user !== undefined) {
    validateUser(config.user);
  }
  if (config.idleTimeout !== undefined) {
    if (
      !Number.isInteger(config.idleTimeout) ||
      config.idleTimeout < 0
    ) {
      throw new Error(
        `Invalid idleTimeout ${config.idleTimeout}: must be a non-negative integer (seconds)`,
      );
    }
  }
  if (config.persistence !== undefined) {
    const valid = ["ephemeral", "sticky", "persistent"];
    if (!valid.includes(config.persistence)) {
      throw new Error(
        `Invalid persistence "${config.persistence}": must be one of ${valid.join(", ")}`,
      );
    }
  }
  validateServices(config.services);

  return { _type: "workspace", config };
}

// ── Preview environment (.codeplane/preview.ts) ─────────────────────────────────

export interface PreviewConfig {
  /** Port to expose as the preview URL. */
  port: number;
  /** Install command (runs before start). */
  install?: string;
  /** Start command for the preview server. */
  start?: string;
  /** Non-secret environment variables for the preview. */
  env?: Record<string, string>;
  /** Full control setup function — receives a workspace handle. */
  setup?: (workspace: WorkspaceHandle) => Promise<void>;
  /** Additional services to run alongside the preview. */
  services?: Record<string, ServiceConfig>;
}

export interface PreviewDefinition {
  _type: "preview";
  config: PreviewConfig;
}

/**
 * Define a preview environment for Landing Requests.
 *
 * Used in `.codeplane/preview.ts`:
 * ```ts
 * import { definePreview } from "@codeplane-ai/workflow";
 *
 * export default definePreview({
 *   port: 3000,
 *   install: "bun install",
 *   start: "bun run dev",
 *   env: { NODE_ENV: "preview" },
 * });
 * ```
 */
export function definePreview(config: PreviewConfig): PreviewDefinition {
  validatePort(config.port, "preview");
  validateServices(config.services);

  if (
    !config.start &&
    !config.setup
  ) {
    throw new Error(
      "Preview config must specify at least one of 'start' or 'setup'",
    );
  }

  return { _type: "preview", config };
}

// ── CI pipeline (.codeplane/ci.ts or inline) ────────────────────────────────────

export interface CIStepConfig {
  /** Unique identifier for this step. */
  id: string;
  /** Human-readable label for this step. */
  label?: string;
  /** Shell command to run. */
  command: string;
  /** Working directory relative to repo root. */
  workdir?: string;
  /** Environment variables for this step. */
  env?: Record<string, string>;
  /** Timeout in seconds (default: 300). */
  timeout?: number;
  /** Continue the pipeline even if this step fails. */
  continueOnFail?: boolean;
}

export interface CIGroupConfig {
  /** Unique identifier for this group. */
  id: string;
  /** Human-readable label for this group. */
  label?: string;
  /** Steps that run in parallel within this group. */
  steps: CIStepConfig[];
}

export interface CIConfig {
  /** Install command (runs once before all steps). */
  install?: string;
  /** Tools and runtimes to install. */
  tools?: Record<string, string>;
  /** System packages to install. */
  packages?: string[];
  /** Environment variables applied to all steps. */
  env?: Record<string, string>;
  /** Sequential pipeline stages, each containing parallel steps. */
  stages: CIGroupConfig[];
}

export interface CIDefinition {
  _type: "ci";
  config: CIConfig;
}

/**
 * Define a CI pipeline configuration.
 *
 * Used in `.codeplane/ci.ts`:
 * ```ts
 * import { defineCI } from "@codeplane-ai/workflow";
 *
 * export default defineCI({
 *   install: "bun install",
 *   stages: [
 *     {
 *       id: "lint",
 *       steps: [
 *         { id: "lint-ts", command: "bun run lint" },
 *         { id: "lint-go", command: "go vet ./..." },
 *       ],
 *     },
 *     {
 *       id: "test",
 *       steps: [
 *         { id: "test-unit", command: "bun test" },
 *         { id: "test-e2e", command: "bun run test:e2e" },
 *       ],
 *     },
 *   ],
 * });
 * ```
 */
export function defineCI(config: CIConfig): CIDefinition {
  if (!config.stages || config.stages.length === 0) {
    throw new Error("CI config must define at least one stage");
  }

  if (config.tools) {
    validateToolNames(config.tools);
  }
  if (config.packages) {
    validatePackageNames(config.packages);
  }

  const seenStepIds = new Set<string>();
  const seenGroupIds = new Set<string>();

  for (const group of config.stages) {
    if (!group.id || group.id.trim().length === 0) {
      throw new Error("Each CI stage must have a non-empty id");
    }
    if (seenGroupIds.has(group.id)) {
      throw new Error(`Duplicate CI stage id "${group.id}"`);
    }
    seenGroupIds.add(group.id);

    if (!group.steps || group.steps.length === 0) {
      throw new Error(`CI stage "${group.id}" must have at least one step`);
    }

    for (const step of group.steps) {
      if (!step.id || step.id.trim().length === 0) {
        throw new Error(
          `Each step in stage "${group.id}" must have a non-empty id`,
        );
      }
      if (seenStepIds.has(step.id)) {
        throw new Error(`Duplicate CI step id "${step.id}"`);
      }
      seenStepIds.add(step.id);

      if (!step.command || step.command.trim().length === 0) {
        throw new Error(
          `Step "${step.id}" in stage "${group.id}" must have a non-empty command`,
        );
      }

      if (step.timeout !== undefined) {
        if (!Number.isInteger(step.timeout) || step.timeout < 1) {
          throw new Error(
            `Invalid timeout ${step.timeout} for step "${step.id}": must be a positive integer (seconds)`,
          );
        }
      }
    }
  }

  return { _type: "ci", config };
}
