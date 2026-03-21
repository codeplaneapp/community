// e2e/tui/helpers.ts

import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { createTestTui } from "@microsoft/tui-test";

// ── Constants ────────────────────────────────────────────────────────────────

export const TUI_ROOT = join(import.meta.dir, "../../apps/tui");
export const TUI_SRC = join(TUI_ROOT, "src");
export const TUI_ENTRY = join(TUI_ROOT, "src/index.tsx");
export const BUN = Bun.which("bun") ?? process.execPath;

// ── Default terminal dimensions ──────────────────────────────────────────────

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;

// ── Default timeouts ─────────────────────────────────────────────────────────

const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
const DEFAULT_LAUNCH_TIMEOUT_MS = 15_000;

export async function navigateToAgents(terminal: TUITestInstance): Promise<void> {
  // Assume global command palette or go-to binding
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}

export async function waitForSessionListReady(terminal: TUITestInstance): Promise<void> {
  // Wait until sessions are loaded (not just loading state)
  const startTime = Date.now();
  while (Date.now() - startTime < 10_000) {
    const content = terminal.snapshot();
    if (!content.includes("Loading sessions") && (content.includes("sessions") || content.includes("No sessions"))) {
      return;
    }
    await sleep(100);
  }
}

/**
 * Navigate to the agent chat screen for a specific session.
 * Assumes the TUI is on the dashboard or session list.
 */
export async function navigateToAgentChat(
  terminal: TUITestInstance,
  sessionIndex: number = 0,
): Promise<void> {
  await navigateToAgents(terminal);
  await waitForSessionListReady(terminal);
  // Move to the desired session
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("Enter");
  // Wait for chat screen to load
  await waitForChatReady(terminal);
}

/**
 * Wait for the agent chat screen to be fully loaded.
 */
export async function waitForChatReady(
  terminal: TUITestInstance,
): Promise<void> {
  // Wait for either input placeholder or replay banner
  const startTime = Date.now();
  while (Date.now() - startTime < 10_000) {
    const content = terminal.snapshot();
    if (
      content.includes("Type a message") ||
      content.includes("Read-only replay mode") ||
      content.includes("Session not found")
    ) {
      return;
    }
    await sleep(100);
  }
  throw new Error("waitForChatReady: chat screen not ready within 10s");
}


// ── TUITestInstance interface ────────────────────────────────────────────────

export interface TUITestInstance {
  /** Send one or more key sequences to the TUI process. */
  sendKeys(...keys: string[]): Promise<void>;
  /** Send literal text input to the TUI process. */
  sendText(text: string): Promise<void>;
  /** Wait until the given text appears anywhere in the terminal buffer. */
  waitForText(text: string, timeoutMs?: number): Promise<void>;
  /** Wait until the given text is no longer present in the terminal buffer. */
  waitForNoText(text: string, timeoutMs?: number): Promise<void>;
  /** Capture the full terminal buffer as a string (ANSI codes preserved). */
  snapshot(): string;
  /** Get a specific line from the terminal buffer (0-indexed). */
  getLine(lineNumber: number): string;
  /** Resize the virtual terminal. Triggers SIGWINCH in the TUI process. */
  resize(cols: number, rows: number): Promise<void>;
  /** Terminate the TUI process and clean up resources. */
  terminate(): Promise<void>;
  /** Current terminal height in rows. */
  rows: number;
  /** Current terminal width in columns. */
  cols: number;
}

// ── Launch options ────────────────────────────────────────────────────────────

export interface LaunchTUIOptions {
  /** Terminal width in columns. Default: 120. */
  cols?: number;
  /** Terminal height in rows. Default: 40. */
  rows?: number;
  /** Additional environment variables merged with defaults. */
  env?: Record<string, string>;
  /** Additional CLI arguments passed to the TUI process. */
  args?: string[];
  /** Timeout for the TUI process to be ready (ms). Default: 15000. */
  launchTimeoutMs?: number;
}

// ── Credential store helper ──────────────────────────────────────────────────

export function createTestCredentialStore(token?: string): {
  path: string;
  token: string;
  cleanup: () => void;
} {
  const testToken = token ?? `codeplane_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const dir = mkdtempSync(join(tmpdir(), "codeplane-tui-test-"));
  const storePath = join(dir, "credentials.json");
  writeFileSync(
    storePath,
    JSON.stringify({
      version: 1,
      tokens: [
        {
          host: "localhost",
          token: testToken,
          created_at: new Date().toISOString(),
        },
      ],
    }),
  );
  return {
    path: storePath,
    token: testToken,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}

// ── Mock API server helper ───────────────────────────────────────────────────

export function createMockAPIEnv(options?: {
  apiBaseUrl?: string;
  token?: string;
  disableSSE?: boolean;
}): Record<string, string> {
  const env: Record<string, string> = {
    CODEPLANE_API_URL: options?.apiBaseUrl ?? "http://localhost:13370",
    CODEPLANE_TOKEN: options?.token ?? "test-token-for-e2e",
  };
  if (options?.disableSSE) {
    env.CODEPLANE_DISABLE_SSE = "1";
  }
  return env;
}

// ── launchTUI implementation (Fallback) ───────────────────────────────────────

export async function launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance> {
  const cols = options?.cols ?? DEFAULT_COLS;
  const rows = options?.rows ?? DEFAULT_ROWS;

  const args = [BUN, "run", TUI_ENTRY, ...(options?.args ?? [])];

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERM: "xterm-256color",
    NO_COLOR: "",
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    CODEPLANE_TOKEN: "e2e-test-token",
    CODEPLANE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "codeplane-tui-config-")),
    ...options?.env,
  };

  const proc = Bun.spawn(args, {
    cwd: TUI_ROOT,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "inherit",
    env,
  });

  let buffer = "";
  if (proc.stdout) {
    const reader = proc.stdout.getReader();
    const readLoop = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            buffer += new TextDecoder().decode(value);
          }
        }
      } catch (e) {
        // stream closed
      }
    };
    readLoop();
  }

  let currentCols = cols;
  let currentRows = rows;

  const instance: TUITestInstance = {
    get cols() { return currentCols; },
    get rows() { return currentRows; },

    async sendKeys(...keys: string[]): Promise<void> {
      for (const key of keys) {
        if (proc.stdin) {
          proc.stdin.write(key);
        }
        await sleep(50);
      }
    },

    async sendText(text: string): Promise<void> {
      for (const char of text) {
        if (proc.stdin) {
          proc.stdin.write(char);
        }
        await sleep(20);
      }
    },

    async waitForText(text: string, timeoutMs?: number): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      const startTime = Date.now();
      const pollIntervalMs = 100;

      while (Date.now() - startTime < timeout) {
        if (buffer.includes(text)) {
          return;
        }
        await sleep(pollIntervalMs);
      }

      throw new Error(`waitForText: "${text}" not found within ${timeout}ms.\nTerminal content:\n${buffer}`);
    },

    async waitForNoText(text: string, timeoutMs?: number): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      const startTime = Date.now();
      const pollIntervalMs = 100;

      while (Date.now() - startTime < timeout) {
        if (!buffer.includes(text)) {
          return;
        }
        await sleep(pollIntervalMs);
      }

      throw new Error(`waitForNoText: "${text}" still present after ${timeout}ms.\nTerminal content:\n${buffer}`);
    },

    snapshot(): string {
      return buffer;
    },

    getLine(lineNumber: number): string {
      const lines = buffer.split("\n");
      if (lineNumber < 0 || lineNumber >= lines.length) {
        throw new Error(`getLine: line ${lineNumber} out of range (0-${lines.length - 1})`);
      }
      return lines[lineNumber];
    },

    async resize(newCols: number, newRows: number): Promise<void> {
      currentCols = newCols;
      currentRows = newRows;
      proc.kill("SIGWINCH");
      await sleep(200);
    },

    async terminate(): Promise<void> {
      try {
        proc.kill();
      } catch {
        // Best-effort
      }
      const configDir = env.CODEPLANE_CONFIG_DIR;
      if (configDir) {
        try {
          rmSync(configDir, { recursive: true, force: true });
        } catch {
          // Best-effort
        }
      }
    },
  };

  // Give process a bit of time to spin up
  await sleep(100);

  return instance;
}

// ── Subprocess helpers (preserved from existing stub) ────────────────────────

export async function run(
  cmd: string[],
  opts: { cwd?: string; env?: Record<string, string>; timeout?: number } = {}
) {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? TUI_ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...(process.env as Record<string, string>), ...opts.env },
  });

  const timeout = opts.timeout ?? 30_000;
  const timer = setTimeout(() => proc.kill(), timeout);

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timer);

  return { exitCode, stdout, stderr };
}

export async function bunEval(expression: string) {
  return run([BUN, "-e", expression]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}