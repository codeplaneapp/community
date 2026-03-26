# Engineering Specification: `tui-nav-chrome-eng-06`

## E2E Test Infrastructure: `helpers.ts` and App-Shell Test Scaffold

---

## 1. Overview

This ticket establishes the foundational E2E test infrastructure for TUI testing. It delivers two primary files and one configuration file:

1. **`e2e/tui/helpers.ts`** — The shared test harness providing `TUITestInstance`, `launchTUI()`, credential/env helpers, subprocess utilities, and shared constants.
2. **`e2e/tui/app-shell.test.ts`** — The comprehensive test scaffold for all `TUI_APP_SHELL` features (13 features, 38 top-level describe blocks, 479 tests).
3. **`e2e/tui/bunfig.toml`** — Bun test runner configuration.

**Dependency:** `tui-bootstrap-and-renderer` — The TUI entry point (`apps/tui/src/index.tsx`) and core providers must exist for `launchTUI()` to spawn a working process.

---

## 2. Implementation Plan

### Step 1: Implement `TUITestInstance` Interface and Core Types

**File:** `e2e/tui/helpers.ts`

The `TUITestInstance` interface is the contract that all E2E tests consume. It abstracts the underlying `@microsoft/tui-test` terminal so tests are decoupled from spawn mechanics.

```typescript
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
  /** Resize the virtual terminal. Triggers SIGWINCH in the TUI process. */
  resize(cols: number, rows: number): Promise<void>
  /** Terminate the TUI process and clean up resources. */
  terminate(): Promise<void>
  /** Current terminal height in rows. */
  rows: number
  /** Current terminal width in columns. */
  cols: number
}

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
```

**Status:** ✅ Implemented.

**Implementation details:**

- `sendKeys()` resolves each key string through `resolveKey()` which maps human-readable names ("Enter", "Escape", "ctrl+c", "j", etc.) to either `terminal.keyPress()` calls with appropriate Key enum values and modifier flags, or dedicated Terminal methods (`keyUp()`, `keyDown()`, `keyLeft()`, `keyRight()`, `keyCtrlC()`, `keyCtrlD()`) for arrow keys and common ctrl combinations. A 50ms delay is inserted between key presses for terminal processing.
- `sendText()` calls `terminal.write(text)` directly for literal text input.
- `waitForText()` / `waitForNoText()` poll the terminal buffer via `getViewableBuffer()` every 100ms until the condition is met or the timeout (default 10s) expires. On timeout, the error message includes the current terminal buffer content for debugging.
- `snapshot()` calls `getViewableBuffer()` which returns a 2D array of characters representing the visible terminal grid, then joins each row and concatenates with newlines.
- `getLine()` returns a single row from the viewable buffer with bounds checking.
- `resize()` calls `terminal.resize(cols, rows)` and waits 200ms for the TUI to respond to SIGWINCH.
- `terminate()` calls `terminal.kill()` and cleans up the temporary `CODEPLANE_CONFIG_DIR`.

### Step 2: Implement `launchTUI()` — Process Spawning

**File:** `e2e/tui/helpers.ts`

The launcher creates a fresh, isolated TUI process for each test via `@microsoft/tui-test`'s `spawn()` function.

```typescript
export async function launchTUI(
  options?: LaunchTUIOptions,
): Promise<TUITestInstance>
```

**Status:** ✅ Implemented.

**Implementation details:**

1. **Dynamic imports.** `@microsoft/tui-test/lib/terminal/term.js` and `@microsoft/tui-test/lib/terminal/shell.js` are imported dynamically to avoid top-level import issues when the native library is not available.

2. **Terminal dimensions.** Default to `TERMINAL_SIZES.standard` (120×40). Overridable via `cols`/`rows` options.

3. **Process isolation.** Each call creates a fresh `mkdtempSync` directory under `os.tmpdir()` for `CODEPLANE_CONFIG_DIR`. This directory is cleaned up on `terminate()`.

4. **Deterministic environment.** The following env vars are set by default and merged with any user-provided overrides:

| Variable | Value | Purpose |
|---|---|---|
| `TERM` | `xterm-256color` | Ensures 256-color baseline |
| `COLORTERM` | `truecolor` | Enables truecolor detection |
| `LANG` | `en_US.UTF-8` | Unicode support |
| `NO_COLOR` | `undefined` (deleted) | Explicitly does not disable color |
| `CODEPLANE_TOKEN` | `e2e-test-token` | Bypasses auth flow |
| `CODEPLANE_CONFIG_DIR` | `<tempdir>` | Isolates from user config |
| `CODEPLANE_API_URL` | `API_URL` constant | Test server URL |

5. **Startup wait.** After spawning, waits 500ms for the process to initialize and render its first frame.

6. **PTY backend.** Uses `Shell.Bash` with `@microsoft/tui-test`'s `spawn()` which creates a real PTY via `node-pty` (or `pty-bun` for Bun) wrapped with `@xterm/headless` for terminal emulation. This provides proper cursor tracking, buffer management, and ANSI sequence parsing.

7. **Spawn command.** Spawns `bun run apps/tui/src/index.tsx [args]` with the TUI entry point path resolved from `TUI_ENTRY`. Additional CLI arguments from `options.args` are appended.

### Step 3: Implement Key Resolution System

**File:** `e2e/tui/helpers.ts`

The `resolveKey()` internal function maps human-readable key names to `@microsoft/tui-test` Terminal API calls. This allows tests to use readable key sequences like `sendKeys("g", "r")` or `sendKeys("ctrl+c")`.

**Status:** ✅ Implemented.

**Supported key categories:**

| Category | Examples | Resolution Strategy |
|---|---|---|
| Named keys | `Enter`, `Escape`, `Tab`, `Space`, `Backspace`, `Delete`, `Home`, `End`, `PageUp`, `PageDown`, `Insert` | `terminal.keyPress(Key.X)` |
| Arrow keys | `Up`, `Down`, `Left`, `Right`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` | Dedicated methods: `terminal.keyUp()`, etc. |
| Function keys | `F1`–`F12` | `terminal.keyPress(Key.FN)` |
| Ctrl combos | `ctrl+c`, `ctrl+d` | Dedicated methods: `terminal.keyCtrlC()`, etc. |
| Dynamic ctrl | `ctrl+b`, `ctrl+s`, etc. | `terminal.keyPress(char, { ctrl: true })` |
| Shift combos | `shift+Tab`, `shift+X` | `terminal.keyPress(key, { shift: true })` |
| Alt combos | `alt+X` | `terminal.keyPress(char, { alt: true })` |
| Single chars | `j`, `k`, `q`, `?`, `:`, `/`, `G`, etc. | `terminal.keyPress(char)` — direct passthrough |

**Key resolution data flow:**

```
sendKeys("ctrl+b", "j", "Enter")
  → resolveKey("ctrl+b")  → { type: "press", key: "b", modifiers: { ctrl: true } }
  → resolveKey("j")       → { type: "press", key: "j" }
  → resolveKey("Enter")   → { type: "press", key: "Enter" }
```

For `type: "special"` actions (arrow keys, `ctrl+c`, `ctrl+d`), the Terminal's dedicated methods are called directly via `(terminal as any)[resolved.method]()`. For `type: "press"` actions, `terminal.keyPress(resolved.key, resolved.modifiers)` is called.

### Step 4: Implement Credential and API Environment Helpers

**File:** `e2e/tui/helpers.ts`

```typescript
export function createTestCredentialStore(token?: string): {
  path: string
  token: string
  cleanup: () => void
}

export function createMockAPIEnv(options?: {
  apiBaseUrl?: string
  token?: string
  disableSSE?: boolean
}): Record<string, string>
```

**Status:** ✅ Implemented.

**`createTestCredentialStore` behavior:**
- Creates a temp directory via `mkdtempSync(join(tmpdir(), "codeplane-tui-test-"))`
- Writes `credentials.json` with `{ version: 1, tokens: [{ host: "localhost", token, created_at }] }`
- If no token provided, generates one: `codeplane_test_{timestamp}_{random}`
- Returns `{ path, token, cleanup }` where `cleanup` removes the temp directory via `rmSync(dir, { recursive: true, force: true })`
- Cleanup is best-effort — errors are silently caught

**`createMockAPIEnv` behavior:**
- Returns a `Record<string, string>` with `CODEPLANE_API_URL` (default: `http://localhost:13370`), `CODEPLANE_TOKEN` (default: `test-token-for-e2e`)
- If `disableSSE: true`, adds `CODEPLANE_DISABLE_SSE=1`
- Does NOT start a server — only configures environment

### Step 5: Implement Subprocess Utilities

**File:** `e2e/tui/helpers.ts`

```typescript
export async function run(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): Promise<{ exitCode: number; stdout: string; stderr: string }>

export async function bunEval(
  expression: string
): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

**Status:** ✅ Implemented.

**`run()` behavior:**
- Spawns a subprocess via `Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe", env })`
- Default cwd: `TUI_ROOT`
- Default timeout: 30 seconds (kills process on timeout via `setTimeout(() => proc.kill(), timeout)`)
- Captures stdout and stderr as strings via `new Response(proc.stdout).text()`
- Returns `{ exitCode, stdout, stderr }` after `await proc.exited`

**`bunEval()` behavior:**
- Convenience wrapper: `run([BUN, "-e", expression])`
- Runs the expression in the TUI package context (inherits `TUI_ROOT` cwd)
- Used extensively for verifying runtime import resolution without launching the full TUI

### Step 6: Implement Shared Fixture Constants

**File:** `e2e/tui/helpers.ts`

```typescript
export const TUI_ROOT: string      // join(import.meta.dir, "../../apps/tui")
export const TUI_SRC: string       // join(TUI_ROOT, "src")
export const TUI_ENTRY: string     // join(TUI_SRC, "index.tsx")
export const BUN: string           // Bun.which("bun") ?? process.execPath

// Server config (shared with CLI e2e tests)
export const API_URL: string       // process.env.API_URL ?? "http://localhost:3000"
export const WRITE_TOKEN: string   // process.env.CODEPLANE_WRITE_TOKEN ?? "codeplane_deadbeef..."
export const READ_TOKEN: string    // process.env.CODEPLANE_READ_TOKEN ?? "codeplane_feedface..."
export const OWNER: string         // process.env.CODEPLANE_E2E_OWNER ?? "alice"
export const ORG: string           // process.env.CODEPLANE_E2E_ORG ?? "acme"

// Standard terminal sizes for snapshot tests (matches design.md § 8.1)
export const TERMINAL_SIZES = {
  minimum:  { width: 80,  height: 24 },
  standard: { width: 120, height: 40 },
  large:    { width: 200, height: 60 },
} as const
```

**Status:** ✅ Implemented. All constants are exported.

**Note on naming:** `TERMINAL_SIZES` uses `width`/`height` rather than `cols`/`rows` to match the `@opentui/react` `useTerminalDimensions()` hook convention. The `launchTUI()` function accepts `cols`/`rows` in its options interface for consistency with `@microsoft/tui-test`'s `spawn()` API. Both represent the same values.

### Step 7: Implement Internal Timeout Constants

**File:** `e2e/tui/helpers.ts`

```typescript
// Internal, not exported
const DEFAULT_WAIT_TIMEOUT_MS = 10_000   // waitForText/waitForNoText timeout
const DEFAULT_LAUNCH_TIMEOUT_MS = 15_000 // launchTUI startup timeout
const POLL_INTERVAL_MS = 100              // polling interval for wait loops
```

**Status:** ✅ Implemented. These are module-scoped constants used internally by `waitForText()`, `waitForNoText()`, and `launchTUI()`.

### Step 8: Configure Bun Test Runner

**File:** `e2e/tui/bunfig.toml`

```toml
[test]
timeout = 30000
```

**Status:** ✅ Implemented.

- **timeout = 30000** — 30-second timeout per test. TUI process launch + initial render + key interaction can take several seconds, especially on CI.
- **preload** — Not specified; defaults to none. No preload scripts needed.

### Step 9: Scaffold `app-shell.test.ts` with All Feature Groups

**File:** `e2e/tui/app-shell.test.ts`

The test file is organized into 38 top-level `describe` blocks mapping to the 13 `TUI_APP_SHELL` features from `specs/tui/features.ts`. Each feature maps to one or more describe blocks containing categorized tests: snapshot tests, keyboard interaction tests, integration tests, pure function tests, and edge case tests.

**Status:** ✅ Implemented with 479 tests across 38 top-level describe blocks (5,438 lines).

---

## 3. File Inventory

### `e2e/tui/helpers.ts` — Complete Export Surface (492 lines)

```typescript
// ── Path Constants ─────────────────────────────────────────────────────
export const TUI_ROOT: string        // absolute path to apps/tui
export const TUI_SRC: string         // absolute path to apps/tui/src
export const TUI_ENTRY: string       // absolute path to apps/tui/src/index.tsx
export const BUN: string             // bun binary path

// ── Server Config Constants ───────────────────────────────────────────
export const API_URL: string         // http://localhost:3000 (or env override)
export const WRITE_TOKEN: string     // codeplane_deadbeef... (or env override)
export const READ_TOKEN: string      // codeplane_feedface... (or env override)
export const OWNER: string           // "alice" (or env override)
export const ORG: string             // "acme" (or env override)

// ── Terminal Size Constants ───────────────────────────────────────────
export const TERMINAL_SIZES: {
  minimum:  { width: 80;  height: 24 }
  standard: { width: 120; height: 40 }
  large:    { width: 200; height: 60 }
}

// ── Types ─────────────────────────────────────────────────────────────
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

export interface LaunchTUIOptions {
  cols?: number
  rows?: number
  env?: Record<string, string>
  args?: string[]
  launchTimeoutMs?: number
}

// ── Core Launcher ─────────────────────────────────────────────────────
export async function launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance>

// ── Credential Helpers ────────────────────────────────────────────────
export function createTestCredentialStore(token?: string): {
  path: string; token: string; cleanup: () => void
}
export function createMockAPIEnv(options?: {
  apiBaseUrl?: string; token?: string; disableSSE?: boolean
}): Record<string, string>

// ── Subprocess Utilities ──────────────────────────────────────────────
export async function run(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): Promise<{ exitCode: number; stdout: string; stderr: string }>
export async function bunEval(
  expression: string
): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

### `e2e/tui/app-shell.test.ts` — Complete Test Structure (5,438 lines)

Imports:
```typescript
import { describe, test, expect, afterEach } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TUI_ROOT, TUI_SRC, BUN, run, bunEval, createTestCredentialStore, createMockAPIEnv, launchTUI } from "./helpers.ts"
```

#### Feature-to-Describe-Block Mapping

| TUI_APP_SHELL Feature | Describe Block(s) | Line Range | Test Count |
|---|---|---|---|
| `TUI_BOOTSTRAP_AND_RENDERER` | "Package scaffold", "TypeScript compilation", "Dependency resolution" | 10–226 | 27 |
| `TUI_AUTH_TOKEN_LOADING` | "TUI_AUTH_TOKEN_LOADING" (9 nested describes) | 2931–3389 | 33 |
| `TUI_SCREEN_ROUTER` | 7 describe blocks (navigation stack, breadcrumb, deep link, placeholder, registry, snapshots, go-to) | 4089–4473 | 34 |
| `TUI_HEADER_BAR` | Covered within theme snapshot and breadcrumb tests | — | (indirect) |
| `TUI_STATUS_BAR` | Covered within keybinding and theme tests | — | (indirect) |
| `TUI_COMMAND_PALETTE` | "TUI_OVERLAY_MANAGER" | 5160–5438 | 22 |
| `TUI_HELP_OVERLAY` | "TUI_OVERLAY_MANAGER" | 5160–5438 | (shared) |
| `TUI_THEME_AND_COLOR_TOKENS` | "Color capability detection", "Theme token definitions", "ThemeProvider and useTheme hook", 7 TUI_THEME_AND_COLOR_TOKENS blocks | 317–2319 | 115+ |
| `TUI_RESPONSIVE_LAYOUT` | "getBreakpoint pure function", "useLayout computed values", "Layout module resolution", "Responsive layout E2E", "useBreakpoint hook", "useResponsiveValue hook", "resolveSidebarVisibility", "useLayout sidebar integration", "sidebar toggle E2E" | 1339–5159 | 88 |
| `TUI_DEEP_LINK_LAUNCH` | "TUI_SCREEN_ROUTER — deep link launch" | 4229–4300 | 6 |
| `TUI_ERROR_BOUNDARY` | "TUI_ERROR_BOUNDARY" (5 nested), "TUI_ERROR_BOUNDARY — Unit Tests" (2 nested) | 2320–2930 | 51 |
| `TUI_LOADING_STATES` | "TUI_LOADING_STATES" (11 nested describes) | 3390–4088 | 67 |
| `TUI_GOTO_KEYBINDINGS` | "TUI_SCREEN_ROUTER — go-to context validation", "KeybindingProvider — Priority Dispatch" | 4436–4762 | 35 |
| *Infrastructure self-tests* | "TUI_APP_SHELL — E2E test infrastructure" | 227–316 | 12 |
| *Spinner hook* | "TUI_APP_SHELL — useSpinner hook scaffold" | 1238–1338 | 8 |

#### Complete Describe Block Index

```
   10: describe("TUI_APP_SHELL — Package scaffold")
  135: describe("TUI_APP_SHELL — TypeScript compilation")
  161: describe("TUI_APP_SHELL — Dependency resolution")
  227: describe("TUI_APP_SHELL — E2E test infrastructure")
  317: describe("TUI_APP_SHELL — Color capability detection")
  650: describe("TUI_APP_SHELL — Theme token definitions")
  983: describe("TUI_APP_SHELL — ThemeProvider and useTheme hook")
 1238: describe("TUI_APP_SHELL — useSpinner hook scaffold")
 1339: describe("TUI_APP_SHELL — getBreakpoint pure function")
 1433: describe("TUI_APP_SHELL — useLayout computed values")
 1562: describe("TUI_APP_SHELL — Layout module resolution")
 1658: describe("TUI_APP_SHELL — Responsive layout E2E")
 1797: describe("TUI_THEME_AND_COLOR_TOKENS — Color Detection")
 1849: describe("TUI_THEME_AND_COLOR_TOKENS — Theme Token Application")
 1925: describe("TUI_THEME_AND_COLOR_TOKENS — NO_COLOR and TERM=dumb")
 1958: describe("TUI_THEME_AND_COLOR_TOKENS — Keyboard Interaction")
 2017: describe("TUI_THEME_AND_COLOR_TOKENS — Responsive Size")
 2092: describe("TUI_THEME_AND_COLOR_TOKENS — Error States")
 2144: describe("TUI_THEME_AND_COLOR_TOKENS — Consistency")
 2221: describe("TUI_THEME_AND_COLOR_TOKENS — Token System Unit Tests")
 2320: describe("TUI_ERROR_BOUNDARY")
 2821: describe("TUI_ERROR_BOUNDARY — Unit Tests")
 2931: describe("TUI_AUTH_TOKEN_LOADING")
 3390: describe("TUI_LOADING_STATES")
 4089: describe("TUI_SCREEN_ROUTER — navigation stack")
 4182: describe("TUI_SCREEN_ROUTER — breadcrumb rendering")
 4229: describe("TUI_SCREEN_ROUTER — deep link launch")
 4301: describe("TUI_SCREEN_ROUTER — placeholder screen")
 4343: describe("TUI_SCREEN_ROUTER — registry completeness")
 4386: describe("TUI_SCREEN_ROUTER — snapshot tests")
 4436: describe("TUI_SCREEN_ROUTER — go-to context validation")
 4474: describe("KeybindingProvider — Priority Dispatch")
 4763: describe("TUI_APP_SHELL — useBreakpoint hook")
 4808: describe("TUI_APP_SHELL — useResponsiveValue hook")
 4913: describe("TUI_APP_SHELL — resolveSidebarVisibility pure function")
 5023: describe("TUI_APP_SHELL — useLayout sidebar integration")
 5094: describe("TUI_APP_SHELL — sidebar toggle E2E")
 5160: describe("TUI_OVERLAY_MANAGER — overlay mutual exclusion")
```

### `e2e/tui/bunfig.toml` — Bun Test Configuration (2 lines)

```toml
[test]
timeout = 30000
```

---

## 4. Integration with `@microsoft/tui-test`

### Architecture

The TUI E2E tests use `@microsoft/tui-test` v0.0.3 (installed as `devDependencies` in `apps/tui/package.json`) as the terminal emulation backend. We use `bun:test` as the test runner — NOT `@microsoft/tui-test`'s own `test()` function.

**What we use from `@microsoft/tui-test`:**

| Module | Import | Used For |
|---|---|---|
| `@microsoft/tui-test/lib/terminal/term.js` | `{ spawn: spawnTerminal }` | PTY-backed terminal spawning |
| `@microsoft/tui-test/lib/terminal/shell.js` | `{ Shell }` | `Shell.Bash` shell configuration |

**What the `Terminal` instance provides:**

| Method | Used Via | Purpose |
|---|---|---|
| `terminal.getViewableBuffer()` | `snapshot()`, `getLine()`, `waitForText()`, `waitForNoText()` | 2D character array of visible terminal grid |
| `terminal.keyPress(key, modifiers?)` | `sendKeys()` | Key input with optional ctrl/alt/shift modifiers |
| `terminal.keyUp()`, `keyDown()`, `keyLeft()`, `keyRight()` | `sendKeys()` for arrow keys | Dedicated arrow key methods for reliability |
| `terminal.keyCtrlC()`, `keyCtrlD()` | `sendKeys()` for ctrl+c, ctrl+d | Dedicated ctrl combo methods |
| `terminal.write(text)` | `sendText()` | Raw text input |
| `terminal.resize(cols, rows)` | `resize()` | Terminal resize (triggers SIGWINCH) |
| `terminal.kill()` | `terminate()` | Process termination |

**Dynamic import pattern:** Both `@microsoft/tui-test` modules are imported dynamically inside `launchTUI()` to avoid top-level import failures when the native library is not yet built:

```typescript
const { spawn: spawnTerminal } = await import("@microsoft/tui-test/lib/terminal/term.js")
const { Shell } = await import("@microsoft/tui-test/lib/terminal/shell.js")
```

### How `TUITestInstance` Maps to `Terminal`

| `TUITestInstance` method | `@microsoft/tui-test` Terminal method |
|---|---|
| `sendKeys(...keys)` | For each key: `resolveKey()` → `terminal.keyPress()` or `terminal.keyUp()` etc., with 50ms delay between keys |
| `sendText(text)` | `terminal.write(text)` + 50ms delay |
| `waitForText(text)` | Polls `terminal.getViewableBuffer()` every 100ms, throws with buffer content on timeout |
| `waitForNoText(text)` | Polls `terminal.getViewableBuffer()` every 100ms, throws with buffer content on timeout |
| `snapshot()` | `terminal.getViewableBuffer()` → `row.join("")` per row → `join("\n")` |
| `getLine(n)` | `terminal.getViewableBuffer()[n].join("")` with bounds checking |
| `resize(cols, rows)` | `terminal.resize(cols, rows)` + 200ms delay |
| `terminate()` | `terminal.kill()` + `rmSync(configDir, { recursive: true, force: true })` |

### PTY Lifecycle Per Test

```
test starts
  → launchTUI() called
    → mkdtempSync creates isolated config dir
    → spawn() creates PTY with Shell.Bash
    → Process: bun run apps/tui/src/index.tsx [args]
    → 500ms startup wait
    → TUITestInstance returned
  → test body executes
    → sendKeys/waitForText/snapshot interactions
  → afterEach or finally block
    → terminal.terminate()
      → terminal.kill() (PTY process killed)
      → rmSync(configDir) (temp config cleaned)
test ends
```

---

## 5. Unit & Integration Tests

All tests are in **`e2e/tui/app-shell.test.ts`** (5,438 lines). Tests use `bun:test` (`describe`, `test`, `expect`, `afterEach`) and import from `e2e/tui/helpers.ts`.

### Test Categories

#### 5.1 Package Structure and Build Validation Tests (Lines 10–226)

These tests validate that the TUI package is correctly configured without launching a TUI process.

**Package scaffold (20 tests):**
- `package.json` exists with correct `name` (`@codeplane/tui`), `type` (`module`), `private` (`true`) fields
- `@opentui/core` and `@opentui/react` are exact-pinned at `0.1.90`
- `react` is exact-pinned at `19.x.x` (currently `19.2.4`)
- `@codeplane/sdk` uses `workspace:*` protocol
- `typescript`, `@types/react`, `bun-types` dev dependencies exist
- `check` script runs `tsc --noEmit`
- `tsconfig.json` configures `jsx: "react-jsx"` with `jsxImportSource: "@opentui/react"`
- `tsconfig.json` configures `bun-types`, `isolatedModules`, no DOM lib
- Source entry point exists at `src/index.tsx`
- `verify-imports.ts` exists
- Source directories exist with barrel exports: `providers/`, `components/`, `hooks/`, `theme/`, `screens/`, `lib/`, `util/`

**TypeScript compilation (3 tests):**
- `tsc --noEmit` passes on full TUI source
- Diff-syntax module compiles
- Agent screen module compiles

**Dependency resolution (11 tests):**
- `@opentui/core` is importable at runtime via `bunEval()`
- `@opentui/react` is importable at runtime
- `createCliRenderer` is a function
- `createRoot` is a function
- OpenTUI React hooks (`useKeyboard`, `useTerminalDimensions`, `useOnResize`, `useTimeline`, `useRenderer`) are importable
- React 19.x is resolved with correct version
- `@codeplane/sdk` resolves via workspace protocol

#### 5.2 E2E Infrastructure Self-Tests (Lines 227–316, 9 tests)

Verify the test infrastructure itself works correctly.

```typescript
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
```

Tests cover:
- `createTestCredentialStore` creates valid credential files with correct JSON structure
- `createTestCredentialStore` generates random tokens with `codeplane_test_` prefix when none provided
- `createTestCredentialStore` cleanup removes the temp directory
- `createMockAPIEnv` returns correct defaults (`http://localhost:13370`, `test-token-for-e2e`)
- `createMockAPIEnv` respects custom `apiBaseUrl`, `token`, and `disableSSE` options
- `launchTUI` is exported as a function
- `@microsoft/tui-test` is importable at runtime
- `TUITestInstance` interface has the expected 10 members (sendKeys, sendText, waitForText, waitForNoText, snapshot, getLine, resize, terminate, rows, cols)
- `TERMINAL_SIZES` matches design.md breakpoints exactly (80×24, 120×40, 200×60)

#### 5.3 Color & Theme Tests (Lines 317–2319, 115+ tests)

Pure function tests for `detectColorCapability()` and `isUnicodeSupported()` from `apps/tui/src/theme/detect.ts`, plus theme token creation and application tests.

**Color capability detection (40 tests):**
- File structure: `theme/detect.ts` exists, exports `detectColorCapability` and `isUnicodeSupported` with zero React/OpenTUI imports
- `NO_COLOR` priority: non-empty string → `ansi16`
- `TERM=dumb` → `ansi16`
- `COLORTERM=truecolor` / `24bit` (case-insensitive) → `truecolor`
- `TERM` containing `256color` → `ansi256`
- Default fallback → `ansi256`
- Unicode support: platform detection (Darwin/Linux/Windows), terminal type checks (screen, tmux, xterm), `FORCE_UTF8` override

**Theme token definitions (32 tests):**
- `createTheme()` returns 12 semantic tokens
- Tokens are RGBA instances with `Float32Array` buffers
- Theme object is frozen (immutable) — `Object.isFrozen(theme) === true`
- Identity stability: same color tier → same object reference
- Status-to-token mapping for issue/landing states
- TextAttributes bitwise flags
- All three tiers (truecolor, ansi256, ansi16) create themes without throwing

**ThemeProvider and useTheme hook (27 tests):**
- File existence and export validation
- Provider rendering behavior via `bunEval()`
- `useTheme()` hook error handling and return types
- Import validation
- TypeScript compilation
- Snapshot tests with color output

**E2E theme tests across 7 `TUI_THEME_AND_COLOR_TOKENS` describe blocks (25 tests):**
- Color detection at runtime with different `COLORTERM` and `TERM` values
- Theme token application in header, status bar, list items, modals, badges
- `NO_COLOR=1` and `TERM=dumb` rendering behavior
- Keyboard interaction with themed elements (focused items, navigation)
- Responsive sizing behavior (theme at different terminal dimensions)
- Error state theming (error boundary renders with error color token)
- Consistency checks: no hardcoded ANSI codes in source, all colors via tokens

#### 5.4 Spinner Hook Tests (Lines 1238–1338, 8 tests)

- File existence and export validation for `useSpinner` hook
- Pure function tests for spinner frame rotation logic
- TypeScript compilation validation

#### 5.5 Responsive Layout Tests (Lines 1339–5159, 88 tests across 9 describe blocks)

**`getBreakpoint` pure function (10 tests):**
- Dimensions → breakpoint mapping for all edge cases
- Below minimum returns `"unsupported"`
- Exact boundary values (80×24, 120×40, 200×60)

**`useLayout` computed values (12 tests):**
- `contentHeight` = `height - 2` (header + status bar)
- `sidebarVisible` = `false` at minimum breakpoint
- `sidebarWidth` = `"30%"` at large, `"25%"` at standard
- `modalWidth`/`modalHeight` = `"90%"` at minimum, `"60%"` at standard, `"50%"` at large

**Layout module resolution (9 tests):**
- Runtime importability of layout hooks
- TypeScript compilation verification

**Responsive layout E2E (14 tests):**
- TUI renders correctly at 80×24, 120×40, 200×60 with snapshot comparison
- Dynamic resize between breakpoints
- Below-minimum terminal size displays "Terminal too small" message

**`useBreakpoint` hook (5 tests):**
- Importability, compilation, memoization behavior

**`useResponsiveValue` hook (9 tests):**
- Value selection per breakpoint with correct fallback behavior

**`resolveSidebarVisibility` pure function (12 tests):**
- Visibility logic per breakpoint (hidden at minimum, visible at standard/large)

**`useLayout` sidebar integration (7 tests):**
- Sidebar state integrates correctly with layout context

**Sidebar toggle E2E (6 tests):**
- `Ctrl+B` toggles sidebar visibility at different breakpoints

#### 5.6 Error Boundary Tests (Lines 2320–2930, 51 tests)

**Snapshot tests (11 tests):**
- Error screen renders at 80×24, 120×40, 200×60
- Error message and stack trace display
- Recovery hints visible ("Press `r` to restart", "Press `q` to quit")

**Keyboard interaction tests (14 tests):**
- `r` restarts after error
- `q` quits from error screen
- `Ctrl+C` quits immediately
- `s` toggles stack trace expansion/collapse
- Stack trace scrolling with `j`/`k`, `G` (jump to bottom), `g g` (jump to top)
- `Ctrl+D` / `Ctrl+U` for page down/up
- `?` opens help overlay from error screen
- Rapid restart handling (no double-restart)

**Responsive tests (5 tests):**
- Error layout adapts to terminal size
- Dynamic resize during error display

**Crash loop tests (3 tests):**
- Crash loop detection after repeated restarts
- Double fault handling

**Integration tests (4 tests):**
- Auth state interaction with error boundary
- SSE reconnect behavior during error

**Unit tests (10 tests):**
- `CrashLoopDetector`: restart recording, ring buffer cap at 5 entries, configurable window/threshold, timestamp aging
- `normalizeError`: Error passthrough, string wrapping, null/undefined → "Unknown error", object message extraction, non-Error thrown values

#### 5.7 Auth Token Loading Tests (Lines 2931–3389, 33 tests)

9 nested describe blocks covering:
- Loading screen display (6 tests): spinner, "Authenticating" text, API host display
- No-token error screen (4 tests): error message, `codeplane auth login` hint, keyboard hint
- Expired-token error screen (3 tests): "Session expired" message
- Offline mode (2 tests): "⚠ offline" indicator, optimistic proceed
- Successful authentication flow (8 tests): status bar confirmation, user identity display
- Security (1 test): token not displayed in terminal buffer
- Keyboard interactions during auth (7 tests): `q` to quit, `Ctrl+C` to quit, `r` to retry
- Responsive layout (2 tests): auth screens at different terminal sizes
- Token resolution edge cases

#### 5.8 Loading States Tests (Lines 3390–4088, 67 tests)

11 nested describe blocks covering:
- Full-screen loading spinner (6 tests): centered display, animation frames
- Skeleton rendering (5 tests): list outlines before data
- Inline pagination loading (3 tests): "Loading more..." at scroll end
- Action loading (2 tests): button spinner during operations
- Full-screen error (4 tests): error screen with retry hint
- Optimistic UI revert (1 test): local state reverts on server error
- No-color terminal (2 tests): loading states render without color codes
- Loading timeout (1 test): timeout behavior for slow loads
- Keyboard interactions during loading (11 tests): limited key handling during load
- Responsive behavior (8 tests): loading states at different breakpoints with snapshot comparison

#### 5.9 Screen Router Tests (Lines 4089–4473, 34 tests)

7 describe blocks covering:

**Navigation stack (9 tests):**
- `NAV-001`: TUI launches with Dashboard as default root screen
- `NAV-002`: go-to navigation (`g r`) renders target screen and updates breadcrumb
- `NAV-003`: `q` pops current screen and returns to previous
- `NAV-004`: `q` on root screen exits TUI
- `NAV-005`: reset clears stack — `q` after go-to returns to Dashboard
- `NAV-006`: duplicate go-to is silently ignored (no stack growth)
- `NAV-007`: multiple sequential go-to navigations build correct stacks
- `NAV-008`: placeholder screen displays screen name
- `NAV-009`: placeholder screen shows "not yet implemented" message

**Breadcrumb rendering (3 tests):**
- Breadcrumb displays current screen name
- Deep stack breadcrumb trail
- Breadcrumb truncation at minimum terminal size

**Deep link launch (6 tests):**
- `--screen issues --repo owner/repo` opens directly to Issues
- `--screen landings` with repo context
- Stack pre-population from deep link args
- Invalid screen name handling
- Missing required repo context handling

**Placeholder screen (4 tests):**
- Placeholder renders with screen name
- Shows params for parameterized screens

**Registry completeness (4 tests):**
- Screen registry has expected number of entries
- Each entry has a `breadcrumbLabel`
- Each entry has a `component` function

**Snapshot tests (5 tests):**
- Dashboard at minimum/standard/large sizes
- Agents screen at standard/large sizes

**Go-to context validation (3 tests):**
- Repo-requiring screens need repo context
- Go-to mode timeout cancels after 1500ms

#### 5.10 Keybinding Provider Tests (Lines 4474–4762, 35 tests)

- Status bar hints snapshots (4 tests): keybinding hints display at different breakpoints
- Key dispatch priority (23 tests): global priority, modal scope override, screen scope, text input capture, scope lifecycle (push on mount / pop on unmount)
- Help overlay integration (1 test): `?` toggles help overlay showing all current keybindings
- Edge cases (3 tests): unhandled keys are silently ignored, rapid key presses, scope removal during dispatch
- Responsive keybindings (4 tests): hint display truncation at minimum size

#### 5.11 Overlay Manager Tests (Lines 5160–5438, 22 tests)

- `OVERLAY-001`–`OVERLAY-004`: Help overlay toggle with `?` — opens, closes, shows keybinding list, scrollable content
- `OVERLAY-005`–`OVERLAY-007`: Command palette toggle with `:` — opens, closes, shows search input
- `OVERLAY-008`–`OVERLAY-010`: Mutual exclusion — opening help closes command palette and vice versa
- `OVERLAY-011`–`OVERLAY-012`: Keybinding suppression while overlay is open — `g r` does not navigate
- `OVERLAY-013`–`OVERLAY-014`: Go-to mode suppression while overlay is open
- `OVERLAY-015`–`OVERLAY-017`: Responsive sizing — 90% at 80×24, 60% at 120×40, 50% at 200×60
- `OVERLAY-018`: Escape from both overlays restores normal keybinding handling
- `OVERLAY-019`: Ctrl+C exits even with overlay open
- `OVERLAY-020`: Closing overlay after screen navigation restores correct screen
- `OVERLAY-021`: Overlay renders with border and surface background color (snapshot)
- `OVERLAY-022`: Multiple open-close cycles work correctly (3 cycles)

### Test Execution

```bash
# Run all TUI E2E tests
bun test e2e/tui/ --timeout 30000

# Run only app-shell tests
bun test e2e/tui/app-shell.test.ts --timeout 30000

# Run from apps/tui via script
cd apps/tui && bun run test:e2e
```

### Test Pattern: `afterEach` Cleanup

E2E tests that launch TUI instances use a consistent cleanup pattern:

```typescript
describe("Screen tests", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("example", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // ... assertions ...
  });
});
```

This ensures the PTY process and temp config directory are always cleaned up, even if the test throws.

### Tests Left Intentionally Failing

Per project policy, tests that fail due to unimplemented backend features are **never** skipped, commented out, or mocked. The following test categories may fail until their dependent backends are implemented:

- **Navigation E2E tests** that launch `launchTUI()` — fail if the TUI process crashes during startup due to missing providers or unimplemented screens
- **Deep-link tests** that depend on `--screen` and `--repo` CLI argument parsing being wired through
- **SSE-dependent tests** (notification badges, connection status) — fail until SSE infrastructure is connected to a running server
- **Auth flow tests** — may fail until the auth token resolution path is fully connected to the CLI keychain
- **Command palette tests** — fail until the command registry is populated with real commands
- **Optimistic UI tests** — fail until mutation hooks are connected to real API endpoints

These failures are signals, not problems to hide.

---

## 6. Feature Coverage Analysis

All 13 `TUI_APP_SHELL` features from `specs/tui/features.ts` have test coverage:

| Feature | Coverage Level | Notes |
|---|---|---|
| `TUI_BOOTSTRAP_AND_RENDERER` | ✅ Direct | 27 tests: package scaffold, compilation, dependency resolution |
| `TUI_AUTH_TOKEN_LOADING` | ✅ Direct | 33 tests across 9 describe blocks |
| `TUI_SCREEN_ROUTER` | ✅ Direct | 34 tests across 7 describe blocks |
| `TUI_HEADER_BAR` | ⚠️ Indirect | Tested via breadcrumb and theme snapshot tests |
| `TUI_STATUS_BAR` | ⚠️ Indirect | Tested via keybinding hints and theme tests |
| `TUI_COMMAND_PALETTE` | ✅ Direct | 7+ tests in overlay manager block |
| `TUI_HELP_OVERLAY` | ✅ Direct | 8+ tests in overlay manager block |
| `TUI_THEME_AND_COLOR_TOKENS` | ✅ Direct | 115+ tests across 10 describe blocks |
| `TUI_RESPONSIVE_LAYOUT` | ✅ Direct | 88 tests across 9 describe blocks |
| `TUI_DEEP_LINK_LAUNCH` | ✅ Direct | 6 tests in dedicated block |
| `TUI_ERROR_BOUNDARY` | ✅ Direct | 51 tests across 2 top-level blocks |
| `TUI_LOADING_STATES` | ✅ Direct | 67 tests across 11 nested blocks |
| `TUI_GOTO_KEYBINDINGS` | ✅ Direct | 35+ tests via screen router and keybinding provider |

### Coverage Gaps and Recommended Additions

#### 6.1 `TUI_HEADER_BAR` — Needs Dedicated Tests

Currently tested indirectly through breadcrumb and theme tests. Recommend adding a dedicated describe block:

```typescript
describe("TUI_HEADER_BAR", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("HEADER-001: header bar renders on first line at standard size", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Dashboard/);
  });

  test("HEADER-002: header bar shows notification badge", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toBeDefined();
  });

  test("HEADER-003: breadcrumb updates on navigation", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    const headerLine = terminal.getLine(0);
    expect(headerLine).toMatch(/Repositories/);
  });

  test("HEADER-004: header truncates from left at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });
});
```

#### 6.2 `TUI_STATUS_BAR` — Needs Dedicated Tests

```typescript
describe("TUI_STATUS_BAR", () => {
  let terminal: import("./helpers.js").TUITestInstance;

  afterEach(async () => {
    if (terminal) await terminal.terminate();
  });

  test("STATUS-001: status bar renders on last line", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\?.*help/i);
  });

  test("STATUS-002: status bar shows keybinding hints at standard size", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/:.*command|\?.*help/i);
  });

  test("STATUS-003: status bar shows fewer hints at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("STATUS-004: status bar context-sensitive hints change per screen", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const dashboardStatus = terminal.getLine(terminal.rows - 1);
    await terminal.sendKeys("g", "n");
    await terminal.waitForText("Notifications");
    const notifStatus = terminal.getLine(terminal.rows - 1);
    expect(notifStatus).not.toBe(dashboardStatus);
  });
});
```

---

## 7. Productionization Path

### 7.1 `waitForMatch` Regex Support

**Current:** String-only matching via `buffer.includes(text)` in `waitForText()`.

**Target:** Add `waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void>` to the `TUITestInstance` interface.

```typescript
async waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void> {
  const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS
  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    if (pattern.test(getBufferText())) return
    await sleep(POLL_INTERVAL_MS)
  }
  throw new Error(
    `waitForMatch: pattern ${pattern} not matched within ${timeout}ms.\n` +
    `Terminal content:\n${getBufferText()}`
  )
}
```

**Migration:** Additive — does not change existing API. Tests that currently use `getLine()` + manual regex can migrate incrementally.

### 7.2 `withTUI` Convenience Wrapper

**Current:** Each test manually calls `launchTUI()` and `terminate()` with `afterEach` cleanup patterns.

**Target:** Add a `withTUI()` wrapper that guarantees cleanup:

```typescript
export async function withTUI(
  options: LaunchTUIOptions,
  fn: (terminal: TUITestInstance) => Promise<void>,
): Promise<void> {
  const terminal = await launchTUI(options)
  try {
    await fn(terminal)
  } finally {
    await terminal.terminate()
  }
}
```

**Migration:** Additive. Tests can choose either `launchTUI()` + manual cleanup or `withTUI()`. The `afterEach` pattern in existing tests remains valid.

### 7.3 Domain-Specific Navigation Helpers

As feature test files are added beyond `app-shell.test.ts`, common navigation patterns should be extracted:

```typescript
// Future addition to helpers.ts
export async function navigateTo(
  terminal: TUITestInstance,
  screen: string,
  goToKey: string,
  waitText: string,
): Promise<void> {
  await terminal.sendKeys("g", goToKey)
  await terminal.waitForText(waitText)
}

export async function navigateToIssues(terminal: TUITestInstance): Promise<void> {
  await navigateTo(terminal, "Issues", "i", "Issues")
}

export async function navigateToAgents(terminal: TUITestInstance): Promise<void> {
  await navigateTo(terminal, "Agents", "a", "Agents")
}
```

These helpers follow the pattern: `sendKeys("g", "<key>")` → `waitForText("<screen title>")`. They will be added as feature test files (`agents.test.ts`, `issues.test.ts`, etc.) mature.

### 7.4 Snapshot Format Enhancement

**Current:** `snapshot()` returns `getViewableBuffer().map(row => row.join("")).join("\n")` — plain text without color information.

**Target:** Add a `snapshotWithColors()` method that preserves ANSI color information for more precise golden-file comparison. This would use `@microsoft/tui-test`'s `serialize()` method if available, falling back to the current plain text format.

**Timeline:** Post-stabilization. Current plain text snapshots are sufficient for layout verification. Color assertions can be added separately via `getLine()` + regex patterns matching ANSI escape codes.

### 7.5 Domain-Specific Helper Modules

**Current state:** The `e2e/tui/helpers/` subdirectory does NOT exist yet. All helpers are in the single `e2e/tui/helpers.ts` file.

**Planned structure:**
```
e2e/tui/
├── helpers.ts                  # Core infrastructure (current)
├── helpers/
│   ├── index.ts               # Barrel re-export
│   ├── workspaces.ts          # Workspace fixtures and navigation
│   └── workflows.ts           # Workflow fixtures and log streaming
```

**Timeline:** Create `helpers/` subdirectory when the first feature test file (`workspaces.test.ts` or `workflows.test.ts`) requires domain-specific fixtures that don't belong in the core `helpers.ts`.

### 7.6 CI Stability Improvements

**Retry on flaky PTY spawn:** In CI environments, PTY creation can occasionally fail due to resource contention. The `launchTUI()` function should add a single retry with a 1-second backoff:

```typescript
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    const terminal = await spawnTerminal(...)
    return terminal
  } catch (err) {
    if (attempt === 0) {
      await sleep(1000)
      continue
    }
    throw err
  }
}
```

**Timeout debug output:** When `waitForText()` times out, the error already includes the terminal buffer content. Consider adding the last 5 lines of stderr from the TUI process for startup crash debugging.

---

## 8. Configuration

### `e2e/tui/bunfig.toml`

```toml
[test]
timeout = 30000
```

- **timeout = 30000** — 30-second timeout per test. TUI process launch + initial render + key interaction can take several seconds, especially on CI. This timeout applies globally to all test files in the `e2e/tui/` directory when run with `bun test`.

### `apps/tui/package.json` Test Script

```json
{
  "scripts": {
    "dev": "bun run src/index.tsx",
    "check": "tsc --noEmit",
    "test:e2e": "bun test ../../e2e/tui/ --timeout 30000"
  }
}
```

### Environment Variables for Tests

| Variable | Default Value | Source | Purpose |
|---|---|---|---|
| `TERM` | `xterm-256color` | Set by `launchTUI()` | Ensures 256-color baseline |
| `COLORTERM` | `truecolor` | Set by `launchTUI()` | Enables truecolor detection |
| `LANG` | `en_US.UTF-8` | Set by `launchTUI()` | Unicode support |
| `NO_COLOR` | `undefined` (deleted) | Set by `launchTUI()` | Explicitly does not disable color |
| `CODEPLANE_TOKEN` | `e2e-test-token` | Set by `launchTUI()` | Bypasses auth flow |
| `CODEPLANE_CONFIG_DIR` | `<tempdir>` | Set by `launchTUI()` | Isolates from user config |
| `CODEPLANE_API_URL` | `API_URL` constant | Set by `launchTUI()` | Test server URL |
| `API_URL` | `http://localhost:3000` | Env or default | Shared server config |
| `CODEPLANE_WRITE_TOKEN` | `codeplane_deadbeef...` | Env or default | Write token for API tests |
| `CODEPLANE_READ_TOKEN` | `codeplane_feedface...` | Env or default | Read token for API tests |
| `CODEPLANE_E2E_OWNER` | `alice` | Env or default | Test repo owner |
| `CODEPLANE_E2E_ORG` | `acme` | Env or default | Test organization |
| `CODEPLANE_DISABLE_SSE` | `1` (optional) | Set via `createMockAPIEnv()` | Prevents SSE connection |

---

## 9. Dependencies

| Package | Version | Role |
|---|---|---|
| `@microsoft/tui-test` | `^0.0.3` (devDependency in apps/tui) | Terminal E2E testing framework: PTY spawning, terminal emulation via @xterm/headless, key input simulation |
| `bun:test` | Built-in | Test runner: `describe`, `test`, `expect`, `afterEach` |
| `node:path` | Built-in | Path construction for `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY` |
| `node:os` | Built-in | `tmpdir()` for test config isolation |
| `node:fs` | Built-in | `mkdtempSync`, `writeFileSync`, `rmSync`, `existsSync`, `readFileSync` |
| `node:events` | Built-in | `EventEmitter` for `@microsoft/tui-test` trace (disabled) |

No new dependencies are introduced by this ticket.

---

## 10. Acceptance Criteria

1. **`e2e/tui/helpers.ts`** (492 lines) exports all of:
   - Types: `TUITestInstance`, `LaunchTUIOptions`
   - Constants: `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`, `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`, `TERMINAL_SIZES`
   - Functions: `launchTUI()`, `createTestCredentialStore()`, `createMockAPIEnv()`, `run()`, `bunEval()`

2. **`e2e/tui/app-shell.test.ts`** (5,438 lines) contains 38 top-level `describe` blocks covering all 13 `TUI_APP_SHELL` features with categorized tests (snapshot, keyboard interaction, pure function, integration, edge case).

3. **`e2e/tui/bunfig.toml`** sets 30-second timeout.

4. **`launchTUI()`** uses `@microsoft/tui-test`'s `spawn()` with real PTY for proper terminal emulation, not raw `Bun.spawn` with string concatenation.

5. **`bun test e2e/tui/app-shell.test.ts`** executes without import errors. Tests may fail due to unimplemented backends — this is expected and correct.

6. **No tests are skipped or commented out.** Failing tests remain as signals.

7. **No mocking of implementation details.** Tests validate user-visible behavior through the terminal buffer. Pure function tests import the function directly and test inputs/outputs.

8. **Each E2E test launches a fresh TUI instance.** No shared state between tests. Test order does not matter.

9. **Environment isolation** is guaranteed: each `launchTUI()` call creates a fresh temporary `CODEPLANE_CONFIG_DIR` that is cleaned up on `terminate()`.

10. **All 13 `TUI_APP_SHELL` features** have at least indirect test coverage, with 11 of 13 having dedicated direct test blocks.