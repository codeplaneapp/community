import { expect } from "bun:test";
import { join } from "node:path";

// CLI binary — either compiled binary or bun-run entry point
export const JJHUB_BIN = process.env.JJHUB_BIN;
export const JJHUB_ENTRY = process.env.JJHUB_ENTRY ?? join(import.meta.dir, "../../apps/cli/src/main.ts");
export const BUN = Bun.which("bun") ?? process.execPath;

// Server config
export const API_URL = process.env.API_URL ?? "http://localhost:3000";
export const WRITE_TOKEN = process.env.JJHUB_WRITE_TOKEN ?? "jjhub_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
export const READ_TOKEN = process.env.JJHUB_READ_TOKEN ?? "jjhub_feedfacefeedfacefeedfacefeedfacefeedface";
export const OWNER = process.env.JJHUB_E2E_OWNER ?? "alice";
export const ORG = process.env.JJHUB_E2E_ORG ?? "acme";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function cli(args: string[], opts: { token?: string; repo?: string; json?: boolean } = {}): Promise<CommandResult> {
  const fullArgs: string[] = [];
  if (opts.repo) fullArgs.push("-R", opts.repo);
  if (opts.json) fullArgs.push("--json");
  fullArgs.push(...args);

  const cmd = JJHUB_BIN ? [JJHUB_BIN, ...fullArgs] : [BUN, JJHUB_ENTRY, ...fullArgs];

  const env: Record<string, string> = { ...process.env as Record<string, string> };
  env.JJHUB_API_URL = API_URL;
  env.NO_COLOR = "1";
  if (opts.token !== undefined) {
    env.JJHUB_TOKEN = opts.token;
  } else {
    env.JJHUB_TOKEN = WRITE_TOKEN;
  }

  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

export function jsonParse<T = unknown>(result: CommandResult): T {
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout) as T;
}

export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}
