// e2e/tui/helpers.ts

import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"

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

// ── Default timeouts ─────────────────────────────────────────────────────────

const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const DEFAULT_LAUNCH_TIMEOUT_MS = 15_000
const POLL_INTERVAL_MS = 100

// ── TUITestInstance interface ────────────────────────────────────────────────

export interface TUITestInstance {
  /** Send one or more key sequences to the TUI process. */
  sendKeys(...keys: string[]): Promise<void>
  /** Send literal text input to the TUI process. */
  sendText(text: string): Promise<void>
  /** Wait until the given text appears anywhere in the terminal buffer. */
  waitForText(text: string, timeoutMs?: number): Promise<void>
  /** Wait until the given text is no longer present in the terminal buffer. */
  waitForNoText(text: string, timeoutMs?: number): Promise<void>
  /** Wait until the given regex pattern matches the terminal buffer. */
  waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void>
  /** Capture the full terminal buffer as a string. */
  snapshot(): string
  /** Get a specific line from the terminal buffer (0-indexed). */
  getLine(lineNumber: number): string
  /** Resize the virtual terminal. */
  resize(cols: number, rows: number): Promise<void>
  /** Terminate the TUI process and clean up resources. */
  terminate(): Promise<void>
  /** Current terminal height in rows. */
  rows: number
  /** Current terminal width in columns. */
  cols: number
}

// ── Launch options ────────────────────────────────────────────────────────────

export interface LaunchTUIOptions {
  /** Terminal width in columns. Default: 120. */
  cols?: number
  /** Terminal height in rows. Default: 40. */
  rows?: number
  /** Additional environment variables merged with defaults. */
  env?: Record<string, string>
  /** Additional CLI arguments passed to the TUI process. */
  args?: string[]
  /** Timeout for the TUI process to be ready (ms). Default: 15000. */
  launchTimeoutMs?: number
}

// ── Credential store helper ──────────────────────────────────────────────────

/**
 * Create a temporary credential store file for test isolation.
 * Returns the file path, the generated token, and a cleanup function.
 *
 * Usage:
 * ```typescript
 * const creds = createTestCredentialStore("valid-test-token")
 * try {
 *   const tui = await launchTUI({
 *     env: {
 *       CODEPLANE_TEST_CREDENTIAL_STORE_FILE: creds.path,
 *       CODEPLANE_TOKEN: creds.token,
 *     },
 *   })
 *   await tui.waitForText("Dashboard")
 *   await tui.terminate()
 * } finally {
 *   creds.cleanup()
 * }
 * ```
 */
export function createTestCredentialStore(token?: string): {
  path: string
  token: string
  cleanup: () => void
} {
  const testToken =
    token ??
    `codeplane_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const dir = mkdtempSync(join(tmpdir(), "codeplane-tui-test-"))
  const storePath = join(dir, "credentials.json")
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
  )
  return {
    path: storePath,
    token: testToken,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup
      }
    },
  }
}

// ── Mock API server helper ───────────────────────────────────────────────────

/**
 * Create environment variables that configure the TUI to point at a test API server.
 *
 * This helper does NOT start a server. It only configures the environment.
 * Different test files need different responses, and some tests run against
 * a real API server.
 *
 * Usage:
 * ```typescript
 * const env = createMockAPIEnv({ apiBaseUrl: "http://localhost:13370" })
 * const tui = await launchTUI({ env })
 * ```
 */
export function createMockAPIEnv(options?: {
  apiBaseUrl?: string
  token?: string
  disableSSE?: boolean
}): Record<string, string> {
  const env: Record<string, string> = {
    CODEPLANE_API_URL: options?.apiBaseUrl ?? "http://localhost:13370",
    CODEPLANE_TOKEN: options?.token ?? "test-token-for-e2e",
  }
  if (options?.disableSSE) {
    env.CODEPLANE_DISABLE_SSE = "1"
  }
  return env
}

// ── Key name to Key enum mapping ─────────────────────────────────────────────

/**
 * Maps human-readable key names used in test code to the
 * @microsoft/tui-test Key enum or special handling.
 *
 * The Terminal.keyPress() method accepts either a single character string
 * or a Key enum value, plus optional modifiers { ctrl, alt, shift }.
 *
 * This mapping allows test code to use readable names like:
 *   await terminal.sendKeys("Enter", "j", "j", "Enter")
 *   await terminal.sendKeys("ctrl+c")
 *   await terminal.sendKeys("Escape")
 */
interface KeyAction {
  type: "press"
  key: string  // single char or Key enum value
  modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean }
}

interface SpecialKeyAction {
  type: "special"
  method: string  // method name on Terminal (e.g., "keyUp", "keyDown")
}

type ResolvedKey = KeyAction | SpecialKeyAction

function resolveKey(key: string): ResolvedKey {
  // Import Key enum values as string constants to avoid top-level
  // import dependency issues. These match the Key enum in
  // @microsoft/tui-test/lib/terminal/ansi.js
  switch (key) {
    // Named keys that map to Key enum
    case "Enter":     return { type: "press", key: "Enter" }
    case "Return":    return { type: "press", key: "Enter" }
    case "Escape":    return { type: "press", key: "Escape" }
    case "Esc":       return { type: "press", key: "Escape" }
    case "Tab":       return { type: "press", key: "Tab" }
    case "Space":     return { type: "press", key: "Space" }
    case "Backspace": return { type: "press", key: "Backspace" }
    case "Delete":    return { type: "press", key: "Delete" }
    case "Home":      return { type: "press", key: "Home" }
    case "End":       return { type: "press", key: "End" }
    case "PageUp":    return { type: "press", key: "PageUp" }
    case "PageDown":  return { type: "press", key: "PageDown" }
    case "Insert":    return { type: "press", key: "Insert" }

    // Arrow keys — use dedicated Terminal methods for reliability
    case "Up":        return { type: "special", method: "keyUp" }
    case "ArrowUp":   return { type: "special", method: "keyUp" }
    case "Down":      return { type: "special", method: "keyDown" }
    case "ArrowDown": return { type: "special", method: "keyDown" }
    case "Left":      return { type: "special", method: "keyLeft" }
    case "ArrowLeft": return { type: "special", method: "keyLeft" }
    case "Right":     return { type: "special", method: "keyRight" }
    case "ArrowRight":return { type: "special", method: "keyRight" }

    // Shift+Tab
    case "shift+Tab": return { type: "press", key: "Tab", modifiers: { shift: true } }

    // Function keys
    case "F1":  return { type: "press", key: "F1" }
    case "F2":  return { type: "press", key: "F2" }
    case "F3":  return { type: "press", key: "F3" }
    case "F4":  return { type: "press", key: "F4" }
    case "F5":  return { type: "press", key: "F5" }
    case "F6":  return { type: "press", key: "F6" }
    case "F7":  return { type: "press", key: "F7" }
    case "F8":  return { type: "press", key: "F8" }
    case "F9":  return { type: "press", key: "F9" }
    case "F10": return { type: "press", key: "F10" }
    case "F11": return { type: "press", key: "F11" }
    case "F12": return { type: "press", key: "F12" }

    // Named ctrl combinations
    case "ctrl+c": return { type: "special", method: "keyCtrlC" }
    case "ctrl+d": return { type: "special", method: "keyCtrlD" }

    default:
      // Handle ctrl+X patterns dynamically
      if (key.startsWith("ctrl+") && key.length === 6) {
        return { type: "press", key: key[5], modifiers: { ctrl: true } }
      }
      // Handle shift+X patterns
      if (key.startsWith("shift+")) {
        return { type: "press", key: key.slice(6), modifiers: { shift: true } }
      }
      // Handle alt+X patterns
      if (key.startsWith("alt+")) {
        return { type: "press", key: key.slice(4), modifiers: { alt: true } }
      }
      // Single printable character — pass through
      if (key.length === 1) {
        return { type: "press", key }
      }
      // Unknown key — attempt to pass through
      return { type: "press", key }
  }
}

// ── launchTUI implementation ─────────────────────────────────────────────────

/**
 * Launch the TUI process with a real PTY via @microsoft/tui-test.
 *
 * Each call creates a fresh TUI instance with:
 * - Isolated temp directory for CODEPLANE_CONFIG_DIR
 * - Real PTY via @xterm/headless for proper terminal emulation
 * - Deterministic environment (TERM, COLORTERM, LANG, etc.)
 * - Proper key input via Terminal.keyPress() and dedicated key methods
 * - Screen buffer capture via Terminal.getViewableBuffer()
 *
 * The returned TUITestInstance provides the standard interface for
 * all TUI E2E tests.
 */

// ── Backends ─────────────────────────────────────────────────────────────────

class TuiTestBackend implements TUITestInstance {
  private currentCols: number;
  private currentRows: number;
  
  constructor(
    private terminal: any,
    public configDir: string,
    cols: number,
    rows: number
  ) {
    this.currentCols = cols;
    this.currentRows = rows;
  }

  get cols() { return this.currentCols; }
  get rows() { return this.currentRows; }

  private getBufferText(): string {
    const buffer = this.terminal.getViewableBuffer();
    return buffer.map((row: string[]) => row.join("")).join("\n");
  }

  async sendKeys(...keys: string[]): Promise<void> {
    for (const key of keys) {
      const resolved = resolveKey(key);
      if (resolved.type === "special") {
        ;(this.terminal as any)[resolved.method]();
      } else {
        this.terminal.keyPress(resolved.key, resolved.modifiers);
      }
      await sleep(50);
    }
  }

  async sendText(text: string): Promise<void> {
    this.terminal.write(text);
    await sleep(50);
  }

  async waitForText(text: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = this.getBufferText();
      if (content.includes(text)) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `waitForText: "${text}" not found within ${timeout}ms.\n` +
        `Terminal content:\n${this.getBufferText()}`
    );
  }

  async waitForNoText(text: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = this.getBufferText();
      if (!content.includes(text)) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `waitForNoText: "${text}" still present after ${timeout}ms.\n` +
        `Terminal content:\n${this.getBufferText()}`
    );
  }

  async waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = this.getBufferText();
      if (pattern.test(content)) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `waitForMatch: pattern ${pattern} not matched within ${timeout}ms.\n` +
        `Terminal content:\n${this.getBufferText()}`
    );
  }

  snapshot(): string {
    return this.getBufferText();
  }

  getLine(lineNumber: number): string {
    const buffer = this.terminal.getViewableBuffer();
    if (lineNumber < 0 || lineNumber >= buffer.length) {
      throw new Error(
        `getLine: line ${lineNumber} out of range (0-${buffer.length - 1})`
      );
    }
    return buffer[lineNumber].join("");
  }

  async resize(newCols: number, newRows: number): Promise<void> {
    this.currentCols = newCols;
    this.currentRows = newRows;
    this.terminal.resize(newCols, newRows);
    await sleep(200);
  }

  async terminate(): Promise<void> {
    try { this.terminal.kill(); } catch {}
    try { rmSync(this.configDir, { recursive: true, force: true }); } catch {}
  }
}

class BunSpawnBackend implements TUITestInstance {
  private buffer: string = "";
  private currentCols: number;
  private currentRows: number;
  private proc: any;

  constructor(
    proc: any,
    public configDir: string,
    cols: number,
    rows: number
  ) {
    this.proc = proc;
    this.currentCols = cols;
    this.currentRows = rows;
    
    // Asynchronously read stdout
    this.readStdout();
  }

  private async readStdout() {
    try {
      const reader = this.proc.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
      }
    } catch {
      // Stream closed or error
    }
  }

  get cols() { return this.currentCols; }
  get rows() { return this.currentRows; }

  private getBufferText(): string {
    // Basic stripping of ANSI escape sequences for text matching
    // Note: this is a simple fallback and won't be perfect.
    return this.buffer.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
  }

  async sendKeys(...keys: string[]): Promise<void> {
    for (const key of keys) {
      // In the fallback backend, we just try to write the raw key strings or simple mapping
      let seq = key;
      if (key === "Enter") seq = "\r";
      else if (key === "Escape") seq = "\x1b";
      else if (key === "j") seq = "j";
      else if (key === "k") seq = "k";
      else if (key === "q") seq = "q";
      else if (key === "?") seq = "?";
      // This is extremely rudimentary and primarily to prevent test crashes
      if (this.proc.stdin) {
        const writer = this.proc.stdin.getWriter();
        await writer.write(new TextEncoder().encode(seq));
        writer.releaseLock();
      }
      await sleep(50);
    }
  }

  async sendText(text: string): Promise<void> {
    if (this.proc.stdin) {
      const writer = this.proc.stdin.getWriter();
      await writer.write(new TextEncoder().encode(text));
      writer.releaseLock();
    }
    await sleep(50);
  }

  async waitForText(text: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = this.getBufferText();
      if (content.includes(text)) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `waitForText: "${text}" not found within ${timeout}ms.\n` +
        `Terminal content:\n${this.getBufferText()}`
    );
  }

  async waitForNoText(text: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = this.getBufferText();
      if (!content.includes(text)) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `waitForNoText: "${text}" still present after ${timeout}ms.\n` +
        `Terminal content:\n${this.getBufferText()}`
    );
  }

  async waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const content = this.getBufferText();
      if (pattern.test(content)) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new Error(
      `waitForMatch: pattern ${pattern} not matched within ${timeout}ms.\n` +
        `Terminal content:\n${this.getBufferText()}`
    );
  }

  snapshot(): string {
    return this.getBufferText();
  }

  getLine(lineNumber: number): string {
    const lines = this.getBufferText().split("\n");
    if (lineNumber < 0 || lineNumber >= lines.length) {
      throw new Error(
        `getLine: line ${lineNumber} out of range (0-${lines.length - 1})`
      );
    }
    return lines[lineNumber];
  }

  async resize(newCols: number, newRows: number): Promise<void> {
    this.currentCols = newCols;
    this.currentRows = newRows;
    await sleep(200);
  }

  async terminate(): Promise<void> {
    try { this.proc.kill(); } catch {}
    try { rmSync(this.configDir, { recursive: true, force: true }); } catch {}
  }
}

export async function launchTUI(
  options?: LaunchTUIOptions,
): Promise<TUITestInstance> {
  const cols = options?.cols ?? TERMINAL_SIZES.standard.width;
  const rows = options?.rows ?? TERMINAL_SIZES.standard.height;

  const configDir = mkdtempSync(
    join(tmpdir(), "codeplane-tui-config-"),
  );

  const env: Record<string, string | undefined> = {
    ...process.env,
    TERM: "xterm-256color",
    NO_COLOR: undefined,
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    CODEPLANE_TOKEN: "e2e-test-token",
    CODEPLANE_CONFIG_DIR: configDir,
    CODEPLANE_API_URL: API_URL,
    ...options?.env,
  };

  let backend: TUITestInstance;

  try {
    const { spawn: spawnTerminal } = await import(
      "@microsoft/tui-test/lib/terminal/term.js"
    );
    const { Shell } = await import("@microsoft/tui-test/lib/terminal/shell.js");
    const { EventEmitter } = await import("node:events");

    const traceEmitter = new EventEmitter();

    const terminal = await spawnTerminal(
      {
        rows,
        cols,
        shell: Shell.Bash,
        program: {
          file: BUN,
          args: ["run", TUI_ENTRY, ...(options?.args ?? [])],
        },
        env,
      },
      false,
      traceEmitter,
    );

    backend = new TuiTestBackend(terminal, configDir, cols, rows);
  } catch (err) {
    console.warn("Failed to load @microsoft/tui-test or spawn terminal. Falling back to BunSpawnBackend.", err);
    
    // BunSpawnBackend
    const proc = Bun.spawn([BUN, "run", TUI_ENTRY, ...(options?.args ?? [])], {
      env: env as Record<string, string>,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    backend = new BunSpawnBackend(proc, configDir, cols, rows);
  }

  // Allow time for the TUI to respond and render initial screen
  await sleep(500);

  return backend;
}

// ── Subprocess helpers ───────────────────────────────────────────────────────

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
