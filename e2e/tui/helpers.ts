import { join } from "node:path"

/** Absolute path to the TUI app root */
export const TUI_ROOT = join(import.meta.dir, "../../apps/tui")

/** Absolute path to the TUI source directory */
export const TUI_SRC = join(TUI_ROOT, "src")

/** TUI entry point for spawning in tests */
export const TUI_ENTRY = join(TUI_SRC, "index.tsx")

/** Bun binary path */
export const BUN = Bun.which("bun") ?? process.execPath

// Server config (shared with CLI e2e tests)
export const API_URL = process.env.API_URL ?? "http://localhost:3000"
export const WRITE_TOKEN = process.env.CODEPLANE_WRITE_TOKEN ?? "codeplane_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
export const READ_TOKEN = process.env.CODEPLANE_READ_TOKEN ?? "codeplane_feedfacefeedfacefeedfacefeedfacefeedface"
export const OWNER = process.env.CODEPLANE_E2E_OWNER ?? "alice"
export const ORG = process.env.CODEPLANE_E2E_ORG ?? "acme"

/** Standard terminal sizes for snapshot tests (matches design.md § 8.1 Breakpoints) */
export const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
} as const

/**
 * Run a command in a subprocess and capture output.
 * Used for tsc, bun eval, and other verification commands.
 */
export async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? TUI_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env as Record<string, string>, ...opts.env },
  })

  const timeout = opts.timeout ?? 30_000
  const timer = setTimeout(() => proc.kill(), timeout)

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  clearTimeout(timer)

  return { exitCode, stdout, stderr }
}

/**
 * Run a `bun -e` expression in the TUI package context.
 * Useful for verifying runtime import resolution.
 */
export async function bunEval(expression: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return run([BUN, "-e", expression])
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── TUITestInstance interface (preserved for backward compatibility) ─────────
// Imported by: e2e/tui/agents.test.ts, future test files

export interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>;
  sendText(text: string): Promise<void>;
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  snapshot(): string;
  getLine(lineNumber: number): string;
  resize(cols: number, rows: number): Promise<void>;
  terminate(): Promise<void>;
  rows: number;
  cols: number;
}

export async function launchTUI(options?: {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
}): Promise<TUITestInstance> {
  throw new Error("TUITestInstance: Not yet implemented. This is a stub for E2E test scaffolding.");
}
