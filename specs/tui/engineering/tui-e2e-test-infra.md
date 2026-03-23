# Engineering Specification: tui-e2e-test-infra

## Set up TUI E2E test infrastructure with @microsoft/tui-test helpers

**Ticket ID:** `tui-e2e-test-infra`  
**Type:** Engineering  
**Depends on:** `tui-foundation-scaffold` (completed)  
**Estimate:** 6 hours  

---

## 1. Current State Analysis

### What exists today

| File | State | Lines | Notes |
|------|-------|-------|-------|
| `e2e/tui/helpers.ts` | Stub | 92 | Exports `TUITestInstance` interface, path constants (`TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`), server config constants (`API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`), `TERMINAL_SIZES` breakpoints, `run()` subprocess helper, `bunEval()` helper. **`launchTUI()` is a stub that throws `"Not yet implemented"`**. No credential store helper, no mock API helper. No key mapping. |
| `e2e/tui/app-shell.test.ts` | Working | 221 | 3 describe blocks: `TUI_APP_SHELL — Package scaffold` (19 tests), `TUI_APP_SHELL — TypeScript compilation` (3 tests), `TUI_APP_SHELL — Dependency resolution` (6 tests). Tests validate package.json, tsconfig.json, directory structure, dependency resolution. Does NOT use `launchTUI()`. Uses `run()`, `bunEval()`, `existsSync()`. |
| `e2e/tui/agents.test.ts` | Failing | 4,331 | Imports `launchTUI` and `TUITestInstance` from `./helpers`. Contains fixture interfaces, fixture data, and extensive test cases for agent sessions, chat, SSE streaming. All tests fail because `launchTUI()` throws "Not yet implemented". |
| `e2e/tui/diff.test.ts` | Broken | 216 | **Imports `createTestTui` from `@microsoft/tui-test`** — this package does NOT exist in the workspace. Contains 4 describe blocks for diff syntax highlighting tests. All test bodies are comment-only stubs (no actual assertions). Module resolution fails at import. |
| `apps/tui/package.json` | Working | 22 | Has `@opentui/core: "0.1.90"`, `@opentui/react: "0.1.90"`, `react: "19.2.4"`, `@codeplane/sdk: "workspace:*"` in dependencies. **Does NOT have `@microsoft/tui-test` in devDependencies**. Has `dev` and `check` scripts but no `test:e2e` script. |
| `apps/tui/src/index.tsx` | Stub | 17 | Type-only entry point that re-exports `CliRenderer` and `Root` types. Not functional — no bootstrap sequence, no `assertTTY()`, no `createCliRenderer()`, no `createRoot()`, no provider stack. |
| `packages/tui-test/` | **Does not exist** | — | No `packages/tui-test/` directory. The spec references this but it was never created. |
| `e2e/tui/bunfig.toml` | **Does not exist** | — | No bunfig.toml for test configuration. |
| `e2e/tui/helpers/` | **Does not exist** | — | No helpers subdirectory. All helpers are in the single `helpers.ts` file. |
| `e2e/tui/__snapshots__/` | **Does not exist** | — | No snapshots directory. |

### Available tooling

**Real `@microsoft/tui-test` v0.0.3** is available in the specs cache at `specs/tui/.bun-cache/@microsoft/tui-test@0.0.3@@@1/`. It provides:
- `Terminal` class with PTY-backed terminal emulation via `@xterm/headless`
- `spawn()` to create Terminal instances with PTY
- `Key` enum (Home, End, Tab, Enter, Escape, F1-F12, etc.)
- `Locator` pattern with `getByText()`, `toBeVisible()`, `toHaveBgColor()`, `toHaveFgColor()`
- `toMatchSnapshot()` for terminal serialization
- `getBuffer()`, `getViewableBuffer()`, `serialize()` for screen state
- `keyPress()`, `keyUp()`, `keyDown()`, `write()`, `submit()`, `resize()`, etc.
- `test.use()` for per-file/group configuration (shell, rows, columns, env, program)
- Bun PTY backend at `lib/terminal/pty-bun.js`

**`@opentui/react/test-utils`** is available in node_modules. It provides:
- `testRender(node, options)` — in-process React component testing with virtual terminal
- Returns `{ renderer, mockInput, mockMouse, renderOnce, captureCharFrame, captureSpans, resize }`
- `MockInput` with `pressKey()`, `typeText()`, `pressEnter()`, `pressEscape()`, `pressTab()`, `pressBackspace()`, `pressArrow()`, `pressCtrlC()`, `pasteBracketedText()`
- `CapturedFrame` with structured span data (text, fg, bg, attributes)
- `captureCharFrame()` returns clean grid-formatted text string

### Analysis: Which testing approach to use

The TUI has **two distinct testing needs**:

1. **Out-of-process E2E tests** — Launch the actual TUI binary with a real PTY, interact via key sequences, assert on rendered terminal output. This is the primary E2E testing path. `@microsoft/tui-test` v0.0.3 provides exactly this via its `Terminal` class with PTY backend (`pty-bun.js` for Bun support).

2. **In-process component tests** — Render individual React components in a virtual terminal, assert on layout and content without launching a subprocess. `@opentui/react/test-utils`'s `testRender()` provides this.

The `launchTUI()` helper in `e2e/tui/helpers.ts` serves the out-of-process path. It should wrap `@microsoft/tui-test`'s `Terminal` class (which uses a real PTY via `@xterm/headless`) to provide the `TUITestInstance` interface.

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Install the real `@microsoft/tui-test` v0.0.3 as a devDependency in `apps/tui/package.json`. |
| G2 | Implement `launchTUI()` in `e2e/tui/helpers.ts` by wrapping `@microsoft/tui-test`'s PTY-backed `Terminal` class to provide full terminal emulation with proper key input, screen buffer capture, and resize support. |
| G3 | Add `createTestCredentialStore()` helper for test-isolated auth token setup. |
| G4 | Add `createMockAPIEnv()` helper for configuring test API server connections. |
| G5 | Create `e2e/tui/bunfig.toml` for test runner configuration (timeout, preload). |
| G6 | Add `test:e2e` script to `apps/tui/package.json`. |
| G7 | Add infrastructure verification tests to `e2e/tui/app-shell.test.ts` validating that the test helpers work correctly. |
| G8 | Fix `e2e/tui/diff.test.ts` import to use the installed `@microsoft/tui-test` (currently broken). |
| G9 | Preserve all existing exports from `helpers.ts` unchanged. No test body modifications to `agents.test.ts` or any other test file. |
| G10 | Tests that fail due to unimplemented backends or missing TUI runtime remain failing — never skipped or commented out. |

---

## 3. Implementation Plan

### Step 1: Install `@microsoft/tui-test` as a devDependency

**File:** `apps/tui/package.json`

Add `@microsoft/tui-test` to devDependencies. The real package at v0.0.3 provides PTY-backed terminal testing with `@xterm/headless` for screen emulation.

```json
{
  "devDependencies": {
    "@microsoft/tui-test": "^0.0.3",
    "typescript": "^5",
    "@types/react": "^19.0.0",
    "bun-types": "^1.3.11"
  },
  "scripts": {
    "dev": "bun run src/index.tsx",
    "check": "tsc --noEmit",
    "test:e2e": "bun test ../../e2e/tui/ --timeout 30000"
  }
}
```

**Rationale:** Use the real npm package rather than a workspace stub. The `^0.0.3` range allows patch updates. The `test:e2e` script standardizes test invocation with a 30-second timeout per the architecture doc.

**Verification:**
- `bun install` succeeds without resolution errors
- `import { test, expect, Key, Shell } from "@microsoft/tui-test"` resolves
- `import { Terminal } from "@microsoft/tui-test/lib/terminal/term.js"` resolves (internal, used by helpers)

---

### Step 2: Create `e2e/tui/bunfig.toml`

**File:** `e2e/tui/bunfig.toml` — new

```toml
[test]
timeout = 30000
```

**Rationale:** Terminal interaction tests need longer timeouts than unit tests. The 30s timeout matches the `--timeout 30000` in the `test:e2e` script and provides a safety net for PTY spawn time, process initialization, and screen rendering.

---

### Step 3: Implement `e2e/tui/helpers.ts` — full `launchTUI()` with PTY

**File:** `e2e/tui/helpers.ts`

The current file exports constants, `run()`, `bunEval()`, the `TUITestInstance` interface, and a stub `launchTUI()`. The upgrade:

1. Implements `launchTUI()` using `@microsoft/tui-test`'s PTY-backed `Terminal` class
2. Adds `createTestCredentialStore()` for isolated auth token setup
3. Adds `createMockAPIEnv()` for test API configuration
4. Preserves all existing exports identically

#### Complete `e2e/tui/helpers.ts`

```typescript
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
export async function launchTUI(
  options?: LaunchTUIOptions,
): Promise<TUITestInstance> {
  // Dynamic import to avoid top-level import issues when
  // @microsoft/tui-test is not installed yet
  const { spawn: spawnTerminal } = await import(
    "@microsoft/tui-test/lib/terminal/term.js"
  )
  const { Shell } = await import("@microsoft/tui-test/lib/terminal/shell.js")
  const { EventEmitter } = await import("node:events")

  const cols = options?.cols ?? TERMINAL_SIZES.standard.width
  const rows = options?.rows ?? TERMINAL_SIZES.standard.height

  const configDir = mkdtempSync(
    join(tmpdir(), "codeplane-tui-config-"),
  )

  const env: Record<string, string | undefined> = {
    ...process.env,
    TERM: "xterm-256color",
    NO_COLOR: undefined, // ensure color is enabled
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    CODEPLANE_TOKEN: "e2e-test-token",
    CODEPLANE_CONFIG_DIR: configDir,
    CODEPLANE_API_URL: API_URL,
    ...options?.env,
  }

  const traceEmitter = new EventEmitter()

  // @microsoft/tui-test's spawn() creates a real PTY via node-pty
  // (or pty-bun for Bun), wraps it with @xterm/headless for
  // terminal emulation, and returns a Terminal instance.
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
    false, // trace disabled
    traceEmitter,
  )

  let currentCols = cols
  let currentRows = rows

  /**
   * Get the full terminal buffer as a flat string.
   * Uses getViewableBuffer() which returns the visible terminal grid.
   */
  function getBufferText(): string {
    const buffer = terminal.getViewableBuffer()
    return buffer.map((row: string[]) => row.join("")).join("\n")
  }

  const instance: TUITestInstance = {
    get cols() {
      return currentCols
    },
    get rows() {
      return currentRows
    },

    async sendKeys(...keys: string[]): Promise<void> {
      for (const key of keys) {
        const resolved = resolveKey(key)
        if (resolved.type === "special") {
          // Call dedicated Terminal method (keyUp, keyDown, etc.)
          ;(terminal as any)[resolved.method]()
        } else {
          terminal.keyPress(resolved.key, resolved.modifiers)
        }
        // Small delay between keys for terminal processing
        await sleep(50)
      }
    },

    async sendText(text: string): Promise<void> {
      terminal.write(text)
      await sleep(50)
    },

    async waitForText(
      text: string,
      timeoutMs?: number,
    ): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
      const startTime = Date.now()
      while (Date.now() - startTime < timeout) {
        const content = getBufferText()
        if (content.includes(text)) return
        await sleep(POLL_INTERVAL_MS)
      }
      throw new Error(
        `waitForText: "${text}" not found within ${timeout}ms.\n` +
          `Terminal content:\n${getBufferText()}`,
      )
    },

    async waitForNoText(
      text: string,
      timeoutMs?: number,
    ): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
      const startTime = Date.now()
      while (Date.now() - startTime < timeout) {
        const content = getBufferText()
        if (!content.includes(text)) return
        await sleep(POLL_INTERVAL_MS)
      }
      throw new Error(
        `waitForNoText: "${text}" still present after ${timeout}ms.\n` +
          `Terminal content:\n${getBufferText()}`,
      )
    },

    snapshot(): string {
      return getBufferText()
    },

    getLine(lineNumber: number): string {
      const buffer = terminal.getViewableBuffer()
      if (lineNumber < 0 || lineNumber >= buffer.length) {
        throw new Error(
          `getLine: line ${lineNumber} out of range (0-${buffer.length - 1})`,
        )
      }
      return buffer[lineNumber].join("")
    },

    async resize(
      newCols: number,
      newRows: number,
    ): Promise<void> {
      currentCols = newCols
      currentRows = newRows
      terminal.resize(newCols, newRows)
      // Allow time for the TUI to respond to SIGWINCH
      await sleep(200)
    },

    async terminate(): Promise<void> {
      try {
        terminal.kill()
      } catch {
        // Best-effort
      }
      try {
        rmSync(configDir, { recursive: true, force: true })
      } catch {
        // Best-effort cleanup
      }
    },
  }

  // Give the process time to start and render initial screen
  await sleep(500)

  return instance
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
```

**Key design decisions:**

| Decision | Rationale |
|----------|-----------|
| Use `@microsoft/tui-test`'s `spawn()` (not `Bun.spawn()`) | `spawn()` creates a real PTY via `node-pty`/`pty-bun` and wraps it with `@xterm/headless` for proper terminal emulation. This gives us a true 2D grid buffer via `getViewableBuffer()` instead of raw stdout bytes. |
| Use `terminal.keyPress()` for key input | `keyPress()` generates correct VT100/xterm escape sequences internally. No manual `mapKeyToSequence()` needed — the Terminal class handles it. |
| Use `terminal.getViewableBuffer()` for screen capture | Returns a `string[][]` (rows × cols) representing the visible terminal grid. This is what `@xterm/headless` renders — proper terminal emulation, not raw ANSI byte accumulation. |
| Dynamic import of `@microsoft/tui-test` | Avoids top-level import failures when the package is being installed. Also allows the module to be loaded only when `launchTUI()` is called, not when helpers are imported for structural tests. |
| `resolveKey()` maps to Key enum + modifiers | The `Terminal.keyPress()` method accepts `Key` enum values (strings like `"Enter"`, `"Escape"`) or single characters, plus optional `{ ctrl, alt, shift }`. `resolveKey()` maps our human-readable key names to this format. |
| `sleep(500)` after spawn | The PTY-backed process needs time to start the Bun runtime, initialize OpenTUI, and render the first frame. 500ms is generous but safe. |
| Use `Shell.Bash` with `program` option | `@microsoft/tui-test` allows specifying a program to run instead of an interactive shell. We set `program.file = bun` and `program.args = ["run", TUI_ENTRY, ...]`. |

**All existing exports preserved:**
- `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN` (path constants)
- `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG` (server config constants)
- `TERMINAL_SIZES` (breakpoint dimensions)
- `TUITestInstance` (interface — unchanged)
- `launchTUI()` (function — same signature, now implemented)
- `run()`, `bunEval()` (subprocess helpers — unchanged)

**New exports:**
- `LaunchTUIOptions` (interface — for typed options)
- `createTestCredentialStore()` (credential helper)
- `createMockAPIEnv()` (mock API env helper)

---

### Step 4: Add infrastructure verification tests to `app-shell.test.ts`

**File:** `e2e/tui/app-shell.test.ts`

Append a new describe block that validates the E2E test infrastructure. These tests verify that the helpers work without actually testing TUI functionality.

```typescript
// Append to end of e2e/tui/app-shell.test.ts

import { createTestCredentialStore, createMockAPIEnv, launchTUI } from "./helpers.ts"
import { readFileSync } from "node:fs"

// ---------------------------------------------------------------------------
// TUI_APP_SHELL — E2E test infrastructure
// ---------------------------------------------------------------------------

describe("TUI_APP_SHELL — E2E test infrastructure", () => {
  test("createTestCredentialStore creates valid credential file", () => {
    const creds = createTestCredentialStore("test-token-123")
    try {
      const content = JSON.parse(readFileSync(creds.path, "utf-8"))
      expect(content.version).toBe(1)
      expect(content.tokens).toBeArray()
      expect(content.tokens[0].token).toBe("test-token-123")
      expect(content.tokens[0].host).toBe("localhost")
      expect(creds.token).toBe("test-token-123")
    } finally {
      creds.cleanup()
    }
  })

  test("createTestCredentialStore generates random token when none provided", () => {
    const creds = createTestCredentialStore()
    try {
      expect(creds.token).toMatch(/^codeplane_test_/)
      const content = JSON.parse(readFileSync(creds.path, "utf-8"))
      expect(content.tokens[0].token).toBe(creds.token)
    } finally {
      creds.cleanup()
    }
  })

  test("createTestCredentialStore cleanup removes files", () => {
    const creds = createTestCredentialStore()
    const path = creds.path
    creds.cleanup()
    expect(existsSync(path)).toBe(false)
  })

  test("createMockAPIEnv returns correct default values", () => {
    const env = createMockAPIEnv()
    expect(env.CODEPLANE_API_URL).toBe("http://localhost:13370")
    expect(env.CODEPLANE_TOKEN).toBe("test-token-for-e2e")
    expect(env.CODEPLANE_DISABLE_SSE).toBeUndefined()
  })

  test("createMockAPIEnv respects custom options", () => {
    const env = createMockAPIEnv({
      apiBaseUrl: "http://custom:9999",
      token: "custom-token",
      disableSSE: true,
    })
    expect(env.CODEPLANE_API_URL).toBe("http://custom:9999")
    expect(env.CODEPLANE_TOKEN).toBe("custom-token")
    expect(env.CODEPLANE_DISABLE_SSE).toBe("1")
  })

  test("launchTUI is a function", () => {
    expect(typeof launchTUI).toBe("function")
  })

  test("@microsoft/tui-test is importable", async () => {
    const result = await bunEval(
      "import('@microsoft/tui-test').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  test("TUITestInstance interface matches expected shape", async () => {
    // Verify the launchTUI return type is a TUITestInstance
    // by checking it has all required methods/properties.
    // This is a type-level check using bunEval to compile TypeScript.
    const result = await bunEval([
      "import type { TUITestInstance } from '../../e2e/tui/helpers.ts';",
      "const check: TUITestInstance = {} as TUITestInstance;",
      "const methods: (keyof TUITestInstance)[] = [",
      "  'sendKeys', 'sendText', 'waitForText', 'waitForNoText',",
      "  'snapshot', 'getLine', 'resize', 'terminate', 'rows', 'cols',",
      "];",
      "console.log(methods.length);",
    ].join(" "))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("10")
  })

  test("TERMINAL_SIZES matches design.md breakpoints", async () => {
    const { TERMINAL_SIZES: sizes } = await import("./helpers.ts")
    expect(sizes.minimum).toEqual({ width: 80, height: 24 })
    expect(sizes.standard).toEqual({ width: 120, height: 40 })
    expect(sizes.large).toEqual({ width: 200, height: 60 })
  })
})
```

**Note:** The `existsSync` import already exists at the top of the file. The `createTestCredentialStore`, `createMockAPIEnv`, and `launchTUI` imports are added alongside the existing imports from `./helpers.ts`.

---

### Step 5: Fix `diff.test.ts` import

**File:** `e2e/tui/diff.test.ts`

The file currently has:
```typescript
import { createTestTui } from "@microsoft/tui-test"
```

The real `@microsoft/tui-test` v0.0.3 does NOT export `createTestTui`. It exports `test`, `expect`, `Shell`, `Key`, `MouseKey`, and `defineConfig`.

Since the diff test bodies are comment-only stubs (no actual code uses `createTestTui`), the import should be removed or replaced. The import is dead code — none of the test functions reference `createTestTui`.

**Change:** Replace the unused import with the correct import that will be needed when tests are implemented:

```typescript
// Before:
import { createTestTui } from "@microsoft/tui-test"

// After:
import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers"
```

**Rationale:** When diff tests are implemented, they will use `launchTUI()` (the standard helper) to launch the TUI and navigate to diff screens. This matches the pattern used by `agents.test.ts`.

---

### Step 6: Verify all test file imports resolve

After implementation, verify import resolution:

| File | Import | Expected |
|------|--------|----------|
| `e2e/tui/helpers.ts` | `@microsoft/tui-test/lib/terminal/term.js` (dynamic) | ✅ Resolves to installed package |
| `e2e/tui/helpers.ts` | `@microsoft/tui-test/lib/terminal/shell.js` (dynamic) | ✅ Resolves |
| `e2e/tui/app-shell.test.ts` | `./helpers.ts` | ✅ Resolves (existing + new exports) |
| `e2e/tui/agents.test.ts` | `./helpers` | ✅ Resolves. `launchTUI`, `TUITestInstance` exported. |
| `e2e/tui/diff.test.ts` | `./helpers` (after fix) | ✅ Resolves |

---

## 4. File Inventory

### Modified files

| File path | Change |
|-----------|--------|
| `apps/tui/package.json` | Add `@microsoft/tui-test: "^0.0.3"` to devDependencies. Add `test:e2e` script. |
| `e2e/tui/helpers.ts` | Replace stub `launchTUI()` with PTY-backed implementation. Add `LaunchTUIOptions` interface. Add `createTestCredentialStore()`. Add `createMockAPIEnv()`. Add `resolveKey()` internal function. Add imports for `tmpdir`, `mkdtempSync`, `writeFileSync`, `rmSync`. |
| `e2e/tui/app-shell.test.ts` | Add 4th describe block `TUI_APP_SHELL — E2E test infrastructure` with 9 infrastructure validation tests. Add imports for `createTestCredentialStore`, `createMockAPIEnv`, `launchTUI`, `readFileSync`. |
| `e2e/tui/diff.test.ts` | Replace broken `import { createTestTui } from "@microsoft/tui-test"` with `import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers"`. No test body changes. |

### New files

| File path | Purpose |
|-----------|--------|
| `e2e/tui/bunfig.toml` | Bun test runner configuration with 30s timeout. |

### Unchanged files

| File path | Reason |
|-----------|--------|
| `e2e/tui/agents.test.ts` | 4,331 lines. No modifications. Uses `launchTUI()` which now works. |
| `apps/tui/src/**/*` | No source code changes. |

---

## 5. Dependencies

| Package | Version | Location | Type | Reason |
|---------|---------|----------|------|--------|
| `@microsoft/tui-test` | `^0.0.3` | `apps/tui/package.json` devDeps | devDependency | Real PTY-backed terminal testing framework. Provides `Terminal` class with `@xterm/headless`, `Key` enum, `Locator` pattern, `toMatchSnapshot()`. |
| `@xterm/headless` | (transitive via tui-test) | — | transitive | Terminal emulation engine. Provides the virtual terminal buffer that `getViewableBuffer()` and `getBuffer()` read from. |
| `node-pty` | (transitive via tui-test, optional) | — | optional transitive | PTY backend for Node.js. `@microsoft/tui-test` also ships `pty-bun.js` for Bun runtime support. |

### Dependency validation

1. **`@microsoft/tui-test` v0.0.3 confirmed.** Package exists in cache at `specs/tui/.bun-cache/@microsoft/tui-test@0.0.3@@@1/`. Exports `test`, `expect`, `Shell`, `Key`, `MouseKey`, `defineConfig` from entry point. Internal `lib/terminal/term.js` exports `Terminal` class and `spawn()` function.

2. **`Terminal` API confirmed.** Methods: `write()`, `submit()`, `keyPress(key, opts?)`, `keyUp()`, `keyDown()`, `keyLeft()`, `keyRight()`, `keyEscape()`, `keyDelete()`, `keyBackspace()`, `keyCtrlC()`, `keyCtrlD()`, `mouseDown()`, `mouseUp()`, `mousePress()`, `mouseTo()`, `getBuffer()`, `getViewableBuffer()`, `getCursor()`, `getByText()`, `serialize()`, `resize()`, `kill()`, `onExit()`.

3. **`Key` enum confirmed.** Values: `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Delete`, `Backspace`, `Tab`, `Enter`, `Space`, `Escape`, `F1`-`F12`.

4. **Bun PTY backend confirmed.** `lib/terminal/pty-bun.js` exists in the package, providing native PTY support for Bun runtime.

5. **`TestFunction` signature confirmed.** Tests receive `({ terminal: Terminal }) => void | Promise<void>`. This is for tests authored with tui-test's own `test()` function. Our tests use `bun:test` and `launchTUI()` instead, which wraps `Terminal` into `TUITestInstance`.

---

## 6. `launchTUI()` Architecture Details

### Terminal lifecycle

```
launchTUI(options)
  │
  ├── Create temp directory for CODEPLANE_CONFIG_DIR
  ├── Merge environment variables (TERM, COLORTERM, LANG, token, ...)
  │
  ├── Dynamic import @microsoft/tui-test/lib/terminal/term.js
  │   └── spawn(options)
  │       ├── Detect PTY backend (node-pty or pty-bun)
  │       ├── Create PTY with rows × cols
  │       ├── Spawn [bun, run, index.tsx, ...args] in PTY
  │       ├── Create @xterm/headless instance connected to PTY
  │       └── Return Terminal instance
  │
  ├── Wrap Terminal → TUITestInstance adapter
  │   ├── sendKeys() → resolveKey() → terminal.keyPress() / terminal.keyUp() etc.
  │   ├── sendText() → terminal.write()
  │   ├── waitForText() → poll getViewableBuffer() until text found
  │   ├── waitForNoText() → poll getViewableBuffer() until text gone
  │   ├── snapshot() → getViewableBuffer() → join rows
  │   ├── getLine() → getViewableBuffer()[n].join("")
  │   ├── resize() → terminal.resize()
  │   └── terminate() → terminal.kill() + rmSync(configDir)
  │
  └── sleep(500ms) for initial render
      └── Return TUITestInstance
```

### Key mapping

The `resolveKey()` function maps human-readable key names to `Terminal.keyPress()` calls or dedicated methods:

| Key name | Method called | Notes |
|----------|--------------|-------|
| `"j"`, `"k"`, `"q"`, `":"`, `"?"`, `"/"`, `"G"` | `keyPress(char)` | Single printable characters |
| `"Enter"` / `"Return"` | `keyPress("Enter")` | Key enum value |
| `"Escape"` / `"Esc"` | `keyPress("Escape")` | Key enum value |
| `"Tab"` | `keyPress("Tab")` | Key enum value |
| `"Backspace"` | `keyPress("Backspace")` | Key enum value |
| `"Space"` | `keyPress("Space")` | Key enum value |
| `"Up"` / `"ArrowUp"` | `keyUp()` | Dedicated method |
| `"Down"` / `"ArrowDown"` | `keyDown()` | Dedicated method |
| `"Left"` / `"ArrowLeft"` | `keyLeft()` | Dedicated method |
| `"Right"` / `"ArrowRight"` | `keyRight()` | Dedicated method |
| `"ctrl+c"` | `keyCtrlC()` | Dedicated method |
| `"ctrl+d"` | `keyCtrlD()` | Dedicated method |
| `"ctrl+b"` | `keyPress("b", { ctrl: true })` | Dynamic ctrl pattern |
| `"ctrl+s"` | `keyPress("s", { ctrl: true })` | Dynamic ctrl pattern |
| `"ctrl+u"` | `keyPress("u", { ctrl: true })` | Dynamic ctrl pattern |
| `"shift+Tab"` | `keyPress("Tab", { shift: true })` | Explicit mapping |
| `"F1"`–`"F12"` | `keyPress("F1")` ... `keyPress("F12")` | Key enum values |
| `"Home"`, `"End"`, `"PageUp"`, `"PageDown"` | `keyPress("Home")` etc. | Key enum values |
| `"Delete"`, `"Insert"` | `keyPress("Delete")` etc. | Key enum values |

### Test isolation guarantees

Each `launchTUI()` call creates:

1. **Fresh temp directory** for `CODEPLANE_CONFIG_DIR` via `mkdtempSync()` — unique per invocation
2. **Fresh PTY + process** — `spawn()` creates a new PTY and process
3. **Deterministic environment** — `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8`
4. **Known auth token** — `CODEPLANE_TOKEN=e2e-test-token` unless overridden via `env`
5. **Process cleanup** — `terminate()` calls `terminal.kill()` AND removes the temp config dir

### Screen buffer vs raw stdout

| Approach | What you get | Our implementation |
|----------|-------------|--------------------|
| `Bun.spawn()` stdout pipe | Raw ANSI byte stream — cursor movement sequences mixed with content. Not a 2D grid. | ❌ Previous approach (broken) |
| `@xterm/headless` via tui-test | Proper VT100 terminal emulation. `getViewableBuffer()` returns a `string[][]` grid matching what a user would see. Cursor movement, alternate screen buffer, line wrapping all handled correctly. | ✅ Our implementation |

---

## 7. Unit & Integration Tests

### Infrastructure tests in `app-shell.test.ts`

The new `TUI_APP_SHELL — E2E test infrastructure` describe block adds 9 tests:

| Test | ID | What it validates |
|------|----|-------------------|
| `createTestCredentialStore creates valid credential file` | INFRA-001 | File exists, JSON parses, has version/tokens structure, token matches input |
| `createTestCredentialStore generates random token when none provided` | INFRA-002 | Token starts with `codeplane_test_`, stored in file |
| `createTestCredentialStore cleanup removes files` | INFRA-003 | Temp dir and file removed after `cleanup()` |
| `createMockAPIEnv returns correct default values` | INFRA-004 | Default API URL, token, no SSE disable flag |
| `createMockAPIEnv respects custom options` | INFRA-005 | Custom URL, token, SSE disable flag |
| `launchTUI is a function` | INFRA-006 | `typeof launchTUI === "function"` |
| `@microsoft/tui-test is importable` | INFRA-007 | Dynamic import resolves successfully |
| `TUITestInstance interface matches expected shape` | INFRA-008 | TypeScript compiles with all 10 required members |
| `TERMINAL_SIZES matches design.md breakpoints` | INFRA-009 | minimum=80×24, standard=120×40, large=200×60 |

### Expected test state after this ticket

**Tests that should PASS:**

| Test file | Tests | Why |
|-----------|-------|-----|
| `e2e/tui/app-shell.test.ts` — Package scaffold | 19 | Validates file existence, package.json, tsconfig |
| `e2e/tui/app-shell.test.ts` — TypeScript compilation | 3 | Runs `tsc --noEmit` |
| `e2e/tui/app-shell.test.ts` — Dependency resolution | 6 | Runtime import checks |
| `e2e/tui/app-shell.test.ts` — E2E test infrastructure | 9 (new) | Validates helpers work |

**Tests that will FAIL (expected, per policy):**

| Test file | Tests | Reason |
|-----------|-------|--------|
| `e2e/tui/agents.test.ts` | ~200+ | `launchTUI()` now runs but TUI process exits immediately because `apps/tui/src/index.tsx` is a type-only stub (no bootstrap, no renderer, no screen rendering). The process starts in the PTY but produces no meaningful output. `waitForText()` calls will timeout. |
| `e2e/tui/diff.test.ts` | 30 | Test bodies are comment-only stubs — no assertions. After import fix, tests will pass vacuously (empty test bodies) OR fail if `bun:test` requires at least one assertion. However, these tests also need `launchTUI()` functionality which depends on a working TUI runtime. |

Per project policy and `feedback_failing_tests.md`, these tests are **never skipped or commented out**. They remain as failing signals that track progress toward full E2E coverage. When `apps/tui/src/index.tsx` gains a real bootstrap sequence (renderer, provider stack, screen rendering), these tests will begin to pass incrementally.

---

## 8. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `@microsoft/tui-test` installed as devDependency | `apps/tui/package.json` has `"@microsoft/tui-test": "^0.0.3"` in devDependencies |
| AC-2 | `bun install` succeeds from monorepo root | Exit code 0, no resolution errors |
| AC-3 | `@microsoft/tui-test` is importable at runtime | `bunEval("import('@microsoft/tui-test').then(() => console.log('ok'))")` returns `"ok"` |
| AC-4 | `launchTUI()` is a callable function (no longer throws stub error) | `typeof launchTUI === "function"` and calling it doesn't throw `"Not yet implemented"` |
| AC-5 | `launchTUI()` creates a PTY-backed terminal via `@microsoft/tui-test` | Process is spawned with real PTY; `getViewableBuffer()` returns a grid |
| AC-6 | `sendKeys()` sends proper key sequences via `Terminal.keyPress()` | `sendKeys("Enter")` calls `terminal.keyPress("Enter")`, not `write("Enter")` |
| AC-7 | `snapshot()` returns grid-formatted text from `getViewableBuffer()` | Returns string with rows joined by `\n`, each row being character cells joined |
| AC-8 | `getLine(n)` returns the nth row from the terminal buffer | Returns `getViewableBuffer()[n].join("")` |
| AC-9 | `resize()` calls `terminal.resize()` | Terminal dimensions update; TUI process receives SIGWINCH |
| AC-10 | `terminate()` kills the process AND cleans up temp dir | Process killed, config dir removed |
| AC-11 | `createTestCredentialStore()` creates valid credential JSON file | File parses as JSON with version and tokens array |
| AC-12 | `createTestCredentialStore().cleanup()` removes temp files | Directory and file deleted |
| AC-13 | `createMockAPIEnv()` returns correct env vars | CODEPLANE_API_URL, CODEPLANE_TOKEN, optional CODEPLANE_DISABLE_SSE |
| AC-14 | `e2e/tui/bunfig.toml` exists with `timeout = 30000` | File exists and has correct content |
| AC-15 | `apps/tui/package.json` has `test:e2e` script | `"test:e2e": "bun test ../../e2e/tui/ --timeout 30000"` |
| AC-16 | All existing exports from `helpers.ts` preserved | `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`, `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`, `TERMINAL_SIZES`, `TUITestInstance`, `launchTUI`, `run`, `bunEval` all exported |
| AC-17 | `diff.test.ts` import fixed — no longer references non-existent `createTestTui` | Imports from `./helpers` instead of `@microsoft/tui-test` |
| AC-18 | Infrastructure tests pass | 9 new tests in `TUI_APP_SHELL — E2E test infrastructure` pass |
| AC-19 | No changes to `apps/tui/src/` files | `git diff apps/tui/src/` shows no changes |
| AC-20 | No changes to `agents.test.ts` test bodies | File unchanged except possibly for CI-facing test count |
| AC-21 | Each `launchTUI()` call creates isolated state | Unique temp dirs via `mkdtempSync()`; no shared state between tests |

---

## 9. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `node-pty` unavailable in Bun runtime | `spawn()` fails to create PTY | Low — `@microsoft/tui-test` ships `pty-bun.js` backend | Package includes Bun-native PTY support. Verified `lib/terminal/pty-bun.js` exists. If issues arise, can fall back to Node.js PTY with Bun's Node compat. |
| `@xterm/headless` version incompatibility with Bun | Terminal emulation crashes or renders incorrectly | Low | `@xterm/headless` is a pure JS package (no native deps). It's a transitive dep of `@microsoft/tui-test` so versions are locked by tui-test's lockfile. |
| TUI process exits immediately in PTY (index.tsx is stub) | All `waitForText()` calls timeout; tests fail | Expected (known) | This is the expected behavior. `apps/tui/src/index.tsx` is a type-only stub. Tests are left failing per policy. When bootstrap is implemented, tests will start passing. |
| `getViewableBuffer()` returns empty rows for unrendered terminal | `snapshot()` returns whitespace-only string | Medium | The 500ms sleep after spawn provides time for initial render. If the process exits before rendering, the buffer will reflect what was rendered. For stub TUI, this means an empty or error screen — which is correct. |
| `terminal.keyPress()` with Key enum string doesn't match actual Key enum value | Keys not recognized by Terminal | Low | The Key enum uses string values (`"Enter"`, `"Escape"`, etc.) that match the strings we pass. `keyPress()` internally resolves these. Confirmed by reading `ansi.d.ts`. |
| Dynamic import path `@microsoft/tui-test/lib/terminal/term.js` changes in future versions | Import fails | Low | We pin `^0.0.3` which limits to patch updates. The internal path structure was verified from the v0.0.3 package. If it changes, only `helpers.ts` needs updating. |
| `spawn()` function signature changes | `launchTUI()` breaks | Low | `spawn(options, trace, traceEmitter)` verified from `term.d.ts`. Pinned version range limits exposure. |
| Test timeout at 30s too short for PTY spawn + TUI render | Tests fail with timeout instead of meaningful error | Medium | `waitForText()` has its own 10s timeout with descriptive error messages. The 30s bunfig timeout is the outer safety net. Can be increased per-test with `test(name, fn, timeout)`. |
| Multiple `launchTUI()` calls in one test file cause PTY resource exhaustion | Later tests fail with "too many open files" | Low | Each test should call `terminate()` in an `afterEach` or `finally` block. The `terminal.kill()` call closes the PTY file descriptors. |

---

## 10. Productionization Notes

### What this ticket produces

**Permanent infrastructure** — not POC code:

1. **`@microsoft/tui-test` dependency** — The real npm package providing PTY-backed terminal testing. This is the permanent test dependency for all TUI E2E tests. Unlike the previously considered workspace stub approach, this uses the battle-tested framework with proper `@xterm/headless` terminal emulation.

2. **`e2e/tui/helpers.ts`** — The permanent test helper module consumed by all test files in `e2e/tui/`. The `TUITestInstance` interface is the stable API contract. The internal implementation (wrapping `@microsoft/tui-test`'s `Terminal`) can change without affecting test files.

3. **`e2e/tui/bunfig.toml`** — Permanent test runner configuration.

4. **Infrastructure tests** — Permanent validation that test tooling works correctly.

### What this ticket does NOT produce

- No TUI runtime changes (no modifications to `apps/tui/src/`)
- No mock API server implementation (only env configuration helper)
- No golden snapshot files (no successful TUI renders to snapshot yet)
- No feature-level tests beyond what exists
- No in-process component testing path (that's a separate concern using `@opentui/react/test-utils`)

### Transition path

| What | When (ticket) | How |
|------|---------------|-----|
| Tests start passing | When `apps/tui/src/index.tsx` gains real bootstrap | TUI renders screens → `waitForText()` finds expected content → tests pass |
| Snapshot testing enabled | First passing render test | Use `terminal.serialize()` or `snapshot()` to capture golden files. Can also use `@microsoft/tui-test`'s `toMatchSnapshot()` matcher with tui-test's own `test()` framework. |
| Color assertions | Diff/theme tests | Use `Terminal.getByText().toHaveFgColor()` / `.toHaveBgColor()` from tui-test's Locator API |
| In-process component tests | When isolated component testing is needed | Use `@opentui/react/test-utils`'s `testRender()` directly (no `launchTUI()` needed). Complementary to E2E tests. |
| Mock API server | First data-dependent feature test | Add `createMockAPIServer()` that starts an HTTP server with configurable routes. Currently only `createMockAPIEnv()` exists for env configuration. |

### API stability contract

The `TUITestInstance` interface is the contract. All test files depend on it:

```typescript
export interface TUITestInstance {
  sendKeys(...keys: string[]): Promise<void>
  sendText(text: string): Promise<void>
  waitForText(text: string, timeoutMs?: number): Promise<void>
  waitForNoText(text: string, timeoutMs?: number): Promise<void>
  snapshot(): string
  getLine(lineNumber: number): string
  resize(cols: number, rows: number): Promise<void>
  terminate(): Promise<void>
  rows: number
  cols: number
}
```

The internal implementation can change (different PTY library, different terminal emulator, different buffer capture method) without affecting any test file. The adapter layer in `launchTUI()` absorbs all such changes.

### Why `@microsoft/tui-test` (real) over a workspace stub wrapping `@opentui/react/test-utils`

The previous spec proposed creating a `packages/tui-test/` workspace package that wraps `@opentui/react/test-utils`'s `testRender()`. This approach has critical limitations:

1. **`testRender()` is in-process** — It renders React components in a virtual buffer but does NOT spawn a process, create a PTY, or exercise the full TUI bootstrap sequence (`assertTTY()`, `createCliRenderer()`, `createRoot()`, provider stack).

2. **No real terminal emulation** — `testRender()`'s `captureCharFrame()` gives a text grid from OpenTUI's layout engine, but doesn't exercise the actual ANSI rendering, alternate screen buffer, cursor management, or raw mode that the real TUI uses.

3. **No process-level isolation** — E2E tests should exercise the TUI as a subprocess (like a user would run it), not as an in-process React tree.

The real `@microsoft/tui-test` provides PTY-backed testing with `@xterm/headless` terminal emulation — exactly what E2E tests need. In-process testing with `@opentui/react/test-utils` remains available for component-level tests without requiring any wrapper.

---

## 11. Implementation Checklist

- [ ] Add `"@microsoft/tui-test": "^0.0.3"` to `apps/tui/package.json` devDependencies
- [ ] Add `"test:e2e": "bun test ../../e2e/tui/ --timeout 30000"` to `apps/tui/package.json` scripts
- [ ] Run `bun install` from monorepo root; verify success
- [ ] Create `e2e/tui/bunfig.toml` with `[test]` section and `timeout = 30000`
- [ ] Implement `launchTUI()` in `e2e/tui/helpers.ts` using `@microsoft/tui-test`'s `spawn()`
- [ ] Add `resolveKey()` internal function for key name → Terminal method mapping
- [ ] Add `LaunchTUIOptions` interface
- [ ] Add `createTestCredentialStore()` helper
- [ ] Add `createMockAPIEnv()` helper
- [ ] Add `node:os`, `node:fs` imports to `helpers.ts`
- [ ] Add `sleep()` function to `helpers.ts`
- [ ] Add `DEFAULT_WAIT_TIMEOUT_MS`, `DEFAULT_LAUNCH_TIMEOUT_MS`, `POLL_INTERVAL_MS` constants
- [ ] Preserve all existing exports: `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`, `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`, `TERMINAL_SIZES`, `run()`, `bunEval()`
- [ ] Fix `e2e/tui/diff.test.ts` import: replace `@microsoft/tui-test` with `./helpers`
- [ ] Add 9 infrastructure tests to `e2e/tui/app-shell.test.ts`
- [ ] Add `createTestCredentialStore`, `createMockAPIEnv`, `launchTUI` imports to `app-shell.test.ts`
- [ ] Verify `bun test e2e/tui/app-shell.test.ts` — all 37 tests pass (28 existing + 9 new)
- [ ] Verify `bun test e2e/tui/agents.test.ts` — tests fail with timeout (not "Not yet implemented")
- [ ] Verify `bun test e2e/tui/diff.test.ts` — no import resolution errors
- [ ] Verify NO changes to any `apps/tui/src/` file
- [ ] Verify NO changes to `agents.test.ts` test bodies