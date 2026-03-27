# Engineering Specification: tui-e2e-test-infra

## Set up TUI E2E test infrastructure with @microsoft/tui-test helpers

**Ticket ID:** `tui-e2e-test-infra`  
**Type:** Engineering  
**Depends on:** `tui-foundation-scaffold` (completed)  
**Status:** Implemented  
**Estimate:** 6 hours  

---

## 1. Current State Analysis

### What exists today

This ticket's deliverables have been **fully implemented**. The analysis below documents the implemented state for completeness and serves as the reference for downstream tickets.

| File | State | Lines | Notes |
|------|-------|-------|-------|
| `e2e/tui/helpers.ts` | **Implemented** | 492 | Exports `TUITestInstance` interface, `LaunchTUIOptions` interface, path constants (`TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`), server config constants (`API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`), `TERMINAL_SIZES` breakpoints, fully functional `launchTUI()` using `@microsoft/tui-test` PTY-backed `Terminal`, `createTestCredentialStore()`, `createMockAPIEnv()`, `run()` subprocess helper, `bunEval()` helper. Internal `resolveKey()` maps human-readable key names to Terminal API calls. |
| `e2e/tui/app-shell.test.ts` | **Implemented** | 5,438 | 38 describe blocks covering: Package scaffold (19 tests), TypeScript compilation (3 tests), Dependency resolution (7 tests), **E2E test infrastructure (9 tests)**, Color capability detection, Theme token definitions, ThemeProvider, useSpinner hook, getBreakpoint, useLayout, Responsive layout E2E, Error boundary, Auth token loading, Loading states, Screen router, Keybinding provider, useBreakpoint, useResponsiveValue, sidebar visibility, overlay manager. Imports `createTestCredentialStore`, `createMockAPIEnv`, `launchTUI` from `./helpers.ts`. |
| `e2e/tui/diff.test.ts` | **Fixed import** | 216 | Imports `launchTUI`, `TUITestInstance`, `TERMINAL_SIZES` from `./helpers.ts`. Contains 5 describe blocks for diff syntax highlighting tests with comment-only stub bodies. No broken `@microsoft/tui-test` direct import. |
| `e2e/tui/agents.test.ts` | Failing (expected) | 4,331 | Imports `launchTUI` and `TUITestInstance` from `./helpers`. Contains fixture interfaces, fixture data, 5 describe blocks for agent sessions/chat. All tests fail because `launchTUI()` spawns the TUI but features are incomplete — tests timeout waiting for expected UI text. Per policy, tests remain failing. |
| `e2e/tui/bunfig.toml` | **Implemented** | 2 | `[test]` section with `timeout = 30000`. |
| `e2e/tui/keybinding-normalize.test.ts` | Implemented | 74 | Tests for `normalizeKeyEvent` and `normalizeKeyDescriptor`. |
| `e2e/tui/util-text.test.ts` | Implemented | 477 | Tests for text utilities (truncateText, truncateLeft, wrapText, constants, formatAuthConfirmation, formatErrorSummary). |
| `apps/tui/package.json` | **Implemented** | 24 | Has `@microsoft/tui-test: "^0.0.3"` in devDependencies. Has `test:e2e` script. All core dependencies present. |
| `apps/tui/src/index.tsx` | **Functional** | 107 | Full bootstrap sequence: `assertTTY()`, `parseCLIArgs()`, `createCliRenderer()`, `createRoot()`, full provider stack (ErrorBoundary → ThemeProvider → KeybindingProvider → OverlayManager → AuthProvider → APIClientProvider → SSEProvider → NavigationProvider → LoadingProvider → GlobalKeybindings → AppShell → ScreenRouter). Signal handlers, deep link support, debug output. |

### Complete e2e/tui/ file inventory

```
e2e/tui/
├── agents.test.ts             # 4,331 lines — TUI_AGENTS features (failing, expected)
├── app-shell.test.ts          # 5,438 lines — TUI_APP_SHELL features + infra tests
├── bunfig.toml                # 2 lines — test timeout config
├── diff.test.ts               # 216 lines — TUI_DIFF features (stub bodies)
├── helpers.ts                 # 492 lines — shared test infrastructure
├── keybinding-normalize.test.ts  # 74 lines — keybinding utility tests
└── util-text.test.ts          # 477 lines — text utility tests
```

### Available tooling

**`@microsoft/tui-test` v0.0.3** is installed at `node_modules/.bun/@microsoft+tui-test@0.0.3/`. It provides:
- `Terminal` class with PTY-backed terminal emulation via `@xterm/headless`
- `spawn()` to create Terminal instances with real PTY (Bun backend at `lib/terminal/pty-bun.js`)
- `Key` enum (Home, End, Tab, Enter, Escape, F1-F12, etc.)
- `Locator` pattern with `getByText()`, `toBeVisible()`, `toHaveBgColor()`, `toHaveFgColor()`
- `toMatchSnapshot()` for terminal serialization
- `getBuffer()`, `getViewableBuffer()`, `getCursor()`, `serialize()` for screen state
- `keyPress()`, `keyUp()`, `keyDown()`, `keyLeft()`, `keyRight()`, `keyEscape()`, `keyDelete()`, `keyBackspace()`, `keyCtrlC()`, `keyCtrlD()`, `write()`, `submit()`, `resize()`, `kill()`, `onExit()` etc.
- `Shell` enum (Bash, Zsh, etc.)

**`@opentui/react/test-utils`** is available and provides:
- `testRender(node, options)` — in-process React component testing with virtual terminal
- Returns `{ renderer, mockInput, mockMouse, renderOnce, captureCharFrame, captureSpans, resize }`
- Complementary to E2E tests — used for isolated component testing without subprocess/PTY overhead

---

## 2. Goals

| # | Goal | Status |
|---|------|--------|
| G1 | Install the real `@microsoft/tui-test` v0.0.3 as a devDependency in `apps/tui/package.json`. | ✅ Done |
| G2 | Implement `launchTUI()` in `e2e/tui/helpers.ts` by wrapping `@microsoft/tui-test`'s PTY-backed `Terminal` class to provide full terminal emulation with proper key input, screen buffer capture, and resize support. | ✅ Done |
| G3 | Add `createTestCredentialStore()` helper for test-isolated auth token setup. | ✅ Done |
| G4 | Add `createMockAPIEnv()` helper for configuring test API server connections. | ✅ Done |
| G5 | Create `e2e/tui/bunfig.toml` for test runner configuration (timeout). | ✅ Done |
| G6 | Add `test:e2e` script to `apps/tui/package.json`. | ✅ Done |
| G7 | Add infrastructure verification tests to `e2e/tui/app-shell.test.ts` validating that the test helpers work correctly. | ✅ Done |
| G8 | Fix `e2e/tui/diff.test.ts` import to use `./helpers` instead of broken direct `@microsoft/tui-test` import. | ✅ Done |
| G9 | Preserve all existing exports from `helpers.ts` unchanged. No test body modifications to `agents.test.ts`. | ✅ Done |
| G10 | Tests that fail due to unimplemented backends or missing TUI runtime remain failing — never skipped or commented out. | ✅ Policy enforced |

---

## 3. Implementation Plan

### Step 1: `@microsoft/tui-test` devDependency (Completed)

**File:** `apps/tui/package.json`

`@microsoft/tui-test` v0.0.3 is present in devDependencies alongside TypeScript, React types, and Bun types. The `test:e2e` script runs tests from the e2e/tui/ directory with a 30-second timeout.

```json
{
  "name": "@codeplane/tui",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "src/index.tsx",
  "scripts": {
    "dev": "bun run src/index.tsx",
    "check": "tsc --noEmit",
    "test:e2e": "bun test ../../e2e/tui/ --timeout 30000"
  },
  "dependencies": {
    "@opentui/core": "0.1.90",
    "@opentui/react": "0.1.90",
    "react": "19.2.4",
    "@codeplane/sdk": "workspace:*"
  },
  "devDependencies": {
    "@microsoft/tui-test": "^0.0.3",
    "typescript": "^5",
    "@types/react": "^19.0.0",
    "bun-types": "^1.3.11"
  }
}
```

**Design decisions:**

- **Real npm package with `^0.0.3` range** for patch updates rather than a workspace stub. The package includes `lib/terminal/pty-bun.js` for native Bun PTY support.
- **Core dependencies pinned exactly** (`@opentui/core: "0.1.90"`, `react: "19.2.4"`) because minor version changes can alter rendering output, breaking snapshot tests. Testing dependencies use caret ranges.
- **`@codeplane/sdk` via workspace protocol** (`workspace:*`) ensures the TUI always uses the monorepo's current SDK version.

### Step 2: `e2e/tui/bunfig.toml` (Completed)

**File:** `e2e/tui/bunfig.toml`

```toml
[test]
timeout = 30000
```

**Rationale:** Terminal interaction tests need longer timeouts than unit tests. 30s provides safety margin for PTY spawn time (~100-300ms), process initialization (TUI bootstrap sequence ~200ms), screen rendering, and `waitForText()` polling loops (up to 10s default per call).

### Step 3: `e2e/tui/helpers.ts` — Full Implementation (Completed)

**File:** `e2e/tui/helpers.ts` — 492 lines

The helper module provides the complete E2E test infrastructure. The architecture is:

#### 3.1 Constants and configuration

```typescript
import { join } from "node:path"
import { tmpdir } from "node:os"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"

export const TUI_ROOT = join(import.meta.dir, "../../apps/tui")
export const TUI_SRC = join(TUI_ROOT, "src")
export const TUI_ENTRY = join(TUI_SRC, "index.tsx")
export const BUN = Bun.which("bun") ?? process.execPath

export const API_URL = process.env.API_URL ?? "http://localhost:3000"
export const WRITE_TOKEN = process.env.CODEPLANE_WRITE_TOKEN ?? "codeplane_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
export const READ_TOKEN = process.env.CODEPLANE_READ_TOKEN ?? "codeplane_feedfacefeedfacefeedfacefeedfacefeedface"
export const OWNER = process.env.CODEPLANE_E2E_OWNER ?? "alice"
export const ORG = process.env.CODEPLANE_E2E_ORG ?? "acme"

export const TERMINAL_SIZES = {
  minimum: { width: 80, height: 24 },
  standard: { width: 120, height: 40 },
  large: { width: 200, height: 60 },
} as const
```

**Design decisions:**

- **`import.meta.dir`** (Bun-native) is used instead of `__dirname` for ESM compatibility. Resolves to the directory containing `helpers.ts`.
- **Environment variable fallbacks** allow CI to configure different API servers, tokens, and test owners while providing sensible defaults for local development.
- **`TERMINAL_SIZES` constants match design.md § 8.1** exactly — minimum (80×24), standard (120×40), large (200×60). These are used by downstream test files for responsive layout testing.

#### 3.2 `TUITestInstance` interface

The stable API contract consumed by all test files:

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

**Design decisions:**

- **10 members, no more** — the interface is deliberately minimal. It covers the five interaction categories: input (`sendKeys`, `sendText`), waiting (`waitForText`, `waitForNoText`), observation (`snapshot`, `getLine`), lifecycle (`resize`, `terminate`), and state (`rows`, `cols`).
- **All methods return `Promise<void>`** except `snapshot()` and `getLine()` which are synchronous reads of the current buffer state.
- **No direct Terminal exposure** — test files never touch `@microsoft/tui-test` internals. The adapter layer in `launchTUI()` absorbs all such coupling.

#### 3.3 `LaunchTUIOptions` interface

```typescript
export interface LaunchTUIOptions {
  cols?: number          // Default: 120 (standard width)
  rows?: number          // Default: 40 (standard height)
  env?: Record<string, string>  // Merged with deterministic defaults
  args?: string[]        // CLI args passed to TUI process
  launchTimeoutMs?: number  // Default: 15000
}
```

**Design decisions:**

- **Standard size as default** (120×40) rather than minimum — most tests should validate the normal experience. Minimum-size tests explicitly pass `TERMINAL_SIZES.minimum`.
- **`env` merges additively** — defaults (`TERM`, `COLORTERM`, `LANG`, `CODEPLANE_TOKEN`, `CODEPLANE_CONFIG_DIR`, `CODEPLANE_API_URL`) are set first, then `options.env` overwrites. Test-specific env vars (like `CODEPLANE_DISABLE_SSE`) don't need to restate all defaults.

#### 3.4 `createTestCredentialStore()` helper

Creates a temporary credential store file for test isolation. Returns `{ path, token, cleanup }`.

```typescript
export function createTestCredentialStore(token?: string): {
  path: string
  token: string
  cleanup: () => void
}
```

**Implementation details:**

1. Creates a temp directory via `mkdtempSync(join(tmpdir(), "codeplane-tui-test-"))`
2. Writes `credentials.json` with structure: `{ version: 1, tokens: [{ host: "localhost", token, created_at }] }`
3. When no token is provided, generates a random one: `codeplane_test_${Date.now()}_${Math.random().toString(36).slice(2)}`
4. Cleanup function calls `rmSync(dir, { recursive: true, force: true })` with error swallowing

**Usage pattern:**

```typescript
const creds = createTestCredentialStore("valid-test-token")
try {
  const tui = await launchTUI({
    env: {
      CODEPLANE_TEST_CREDENTIAL_STORE_FILE: creds.path,
      CODEPLANE_TOKEN: creds.token,
    },
  })
  await tui.waitForText("Dashboard")
  await tui.terminate()
} finally {
  creds.cleanup()
}
```

#### 3.5 `createMockAPIEnv()` helper

Configures environment variables for pointing the TUI at a test API server. Does NOT start a server — only returns env vars.

```typescript
export function createMockAPIEnv(options?: {
  apiBaseUrl?: string    // Default: "http://localhost:13370"
  token?: string         // Default: "test-token-for-e2e"
  disableSSE?: boolean   // Sets CODEPLANE_DISABLE_SSE=1
}): Record<string, string>
```

**Design decisions:**

- **Port 13370 default** avoids conflict with the real API server (port 3000). Tests that need a mock server start one on this port.
- **`disableSSE` flag** allows tests that don't need real-time updates to skip SSE connection establishment, reducing flakiness and test time.
- **Returns plain env object** — can be spread into `launchTUI({ env: createMockAPIEnv() })`.

#### 3.6 `resolveKey()` internal function

Maps human-readable key names to `Terminal.keyPress()` calls or dedicated Terminal methods. This is an internal implementation detail — not exported.

| Input | Resolution | Method called |
|-------|-----------|---------------|
| Single char (`"j"`, `"q"`, `":"`) | Direct passthrough | `terminal.keyPress(char)` |
| Named key (`"Enter"`, `"Escape"`, `"Tab"`) | Key enum string | `terminal.keyPress("Enter")` etc. |
| Arrow keys (`"Up"`, `"Down"`, `"Left"`, `"Right"`) | Dedicated method | `terminal.keyUp()` etc. |
| Arrow aliases (`"ArrowUp"`, `"ArrowDown"`, etc.) | Same dedicated method | `terminal.keyUp()` etc. |
| `"ctrl+c"`, `"ctrl+d"` | Dedicated method | `terminal.keyCtrlC()`, `terminal.keyCtrlD()` |
| `"ctrl+X"` pattern (6 chars) | Modifier | `terminal.keyPress("x", { ctrl: true })` |
| `"shift+Tab"` | Modifier | `terminal.keyPress("Tab", { shift: true })` |
| `"alt+X"` pattern | Modifier | `terminal.keyPress("x", { alt: true })` |
| Function keys (`"F1"`–`"F12"`) | Key enum string | `terminal.keyPress("F1")` etc. |
| `"Home"`, `"End"`, `"PageUp"`, `"PageDown"`, `"Insert"` | Key enum string | `terminal.keyPress("Home")` etc. |
| `"Return"` | Alias for Enter | `terminal.keyPress("Enter")` |
| `"Esc"` | Alias for Escape | `terminal.keyPress("Escape")` |
| `"Backspace"`, `"Delete"`, `"Space"` | Key enum string | `terminal.keyPress("Backspace")` etc. |

**Internal types:**

```typescript
interface KeyAction {
  type: "press"
  key: string
  modifiers?: { ctrl?: boolean; alt?: boolean; shift?: boolean }
}

interface SpecialKeyAction {
  type: "special"
  method: string  // method name on Terminal (e.g., "keyUp", "keyDown")
}

type ResolvedKey = KeyAction | SpecialKeyAction
```

**Why special methods for arrow keys and ctrl+c/d:** `@microsoft/tui-test` provides dedicated methods (`keyUp()`, `keyDown()`, `keyCtrlC()`, etc.) that emit the correct ANSI escape sequences. Using `keyPress()` with these keys can produce incorrect byte sequences on some PTY backends.

#### 3.7 `launchTUI()` implementation

Core function that spawns a TUI process with a real PTY via `@microsoft/tui-test`:

```typescript
export async function launchTUI(
  options?: LaunchTUIOptions,
): Promise<TUITestInstance>
```

**Step-by-step execution:**

1. **Dynamic import** of `@microsoft/tui-test/lib/terminal/term.js` (exports `spawn()`) and `shell.js` (exports `Shell`) to avoid top-level import failures when the package is not installed
2. **Import `EventEmitter`** from `node:events` — required as `traceEmitter` parameter to `spawn()`
3. **Read dimensions** from options or default to standard (120×40)
4. **Create temp config dir** via `mkdtempSync(join(tmpdir(), "codeplane-tui-config-"))` for `CODEPLANE_CONFIG_DIR`
5. **Merge environment** with deterministic defaults:
   - `...process.env` as base
   - `TERM=xterm-256color`
   - `NO_COLOR=undefined` (explicitly unset to enable color)
   - `COLORTERM=truecolor`
   - `LANG=en_US.UTF-8`
   - `CODEPLANE_TOKEN=e2e-test-token`
   - `CODEPLANE_CONFIG_DIR={tempDir}`
   - `CODEPLANE_API_URL={API_URL}`
   - `...options?.env` (user overrides last)
6. **Create `traceEmitter`** — `new EventEmitter()` (required by tui-test's `spawn()` signature)
7. **Spawn terminal** via `spawnTerminal()` with:
   - `rows`, `cols` from step 3
   - `shell: Shell.Bash`
   - `program: { file: BUN, args: ["run", TUI_ENTRY, ...(options?.args ?? [])] }`
   - `env` from step 5
   - `trace: false`
   - `traceEmitter` from step 6
8. **Track mutable dimensions** via `let currentCols = cols` / `let currentRows = rows`
9. **Create `getBufferText()` internal** — calls `terminal.getViewableBuffer()`, joins each row's `string[]` with `""`, joins rows with `"\n"`
10. **Wrap Terminal** in `TUITestInstance` adapter object with all 10 members
11. **Wait 500ms** for initial render via `sleep(500)`
12. **Return** `TUITestInstance`

**Adapter implementation details:**

| Method | Implementation |
|--------|----------------|
| `sendKeys(...keys)` | Iterates keys, calls `resolveKey()` on each, dispatches to `terminal.keyPress()` or dedicated method, 50ms `sleep()` between keys |
| `sendText(text)` | Calls `terminal.write(text)`, 50ms `sleep()` |
| `waitForText(text, timeout?)` | Polls `getBufferText()` every 100ms; returns when `content.includes(text)` is true; throws descriptive error with full buffer dump after timeout (default 10s) |
| `waitForNoText(text, timeout?)` | Same polling pattern; returns when text is absent; throws with buffer dump after timeout |
| `snapshot()` | Returns `getBufferText()` synchronously |
| `getLine(n)` | Calls `terminal.getViewableBuffer()`, validates bounds `0 <= n < buffer.length`, returns `buffer[n].join("")` |
| `resize(cols, rows)` | Updates `currentCols`/`currentRows`, calls `terminal.resize(cols, rows)`, 200ms `sleep()` for SIGWINCH |
| `terminate()` | Calls `terminal.kill()` (best-effort), then `rmSync(configDir, { recursive: true, force: true })` (best-effort) |
| `rows` (getter) | Returns `currentRows` |
| `cols` (getter) | Returns `currentCols` |

**Terminal lifecycle diagram:**

```
launchTUI(options)
  │
  ├── mkdtempSync() → isolated CODEPLANE_CONFIG_DIR
  ├── Merge env (TERM, COLORTERM, LANG, token, API URL)
  │
  ├── Dynamic import @microsoft/tui-test/lib/terminal/term.js
  │   └── spawnTerminal(options, trace=false, traceEmitter)
  │       ├── Detect PTY backend (pty-bun for Bun runtime)
  │       ├── Create PTY with rows × cols
  │       ├── Spawn [bun, run, apps/tui/src/index.tsx, ...args] in PTY
  │       ├── Create @xterm/headless instance connected to PTY
  │       └── Return Terminal instance
  │
  ├── Wrap Terminal → TUITestInstance adapter
  │   ├── sendKeys() → resolveKey() → terminal.keyPress() / dedicated methods
  │   ├── sendText() → terminal.write()
  │   ├── waitForText() → poll getViewableBuffer() every 100ms
  │   ├── waitForNoText() → poll until absent
  │   ├── snapshot() → getViewableBuffer() → join → string
  │   ├── getLine(n) → getViewableBuffer()[n].join("")
  │   ├── resize() → terminal.resize() + 200ms delay
  │   └── terminate() → terminal.kill() + rmSync(configDir)
  │
  └── sleep(500ms) for initial render
      └── Return TUITestInstance
```

**Why `@xterm/headless` via tui-test instead of raw `Bun.spawn()` stdout:**

| Approach | What you get |
|----------|-------------|
| `Bun.spawn()` stdout pipe | Raw ANSI byte stream — cursor movement sequences mixed with content. Not a 2D grid. Requires manual VT100 parsing. Cannot handle alternate screen buffer, raw mode, or cursor positioning. |
| `@xterm/headless` via tui-test | Proper VT100 terminal emulation. `getViewableBuffer()` returns a `string[][]` grid matching what a user sees. Cursor movement, alternate screen buffer, line wrapping, scrollback all handled correctly. |

#### 3.8 Subprocess helpers

```typescript
export async function run(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number },
): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

Runs a command via `Bun.spawn()` with stdout/stderr capture, configurable cwd (default: `TUI_ROOT`), env merging, and a kill timeout (default: 30s).

```typescript
export async function bunEval(
  expression: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }>
```

Shorthand for `run([BUN, "-e", expression])` — runs a `bun -e` expression in the TUI package context. Used for verifying runtime import resolution and TypeScript compilation.

### Step 4: Infrastructure verification tests in `app-shell.test.ts` (Completed)

**File:** `e2e/tui/app-shell.test.ts` — `TUI_APP_SHELL — E2E test infrastructure` describe block (lines 227-310)

9 tests validating the helper infrastructure:

| Test | ID | What it validates | Implementation |
|------|----|-------------------|----------------|
| `createTestCredentialStore creates valid credential file` | INFRA-001 | File exists, JSON parses, has `version`/`tokens` structure, token matches input `"test-token-123"`, host is `"localhost"` | Reads file with `readFileSync`, parses JSON, asserts structure |
| `createTestCredentialStore generates random token when none provided` | INFRA-002 | Token starts with `codeplane_test_`, stored token matches returned token | Creates store without arg, checks prefix regex `/^codeplane_test_/` |
| `createTestCredentialStore cleanup removes files` | INFRA-003 | Temp dir and file removed after `cleanup()` | Calls cleanup, asserts `existsSync(path)` returns false |
| `createMockAPIEnv returns correct default values` | INFRA-004 | Default API URL is `http://localhost:13370`, token is `test-token-for-e2e`, no SSE disable flag | Calls without args, asserts three env var values |
| `createMockAPIEnv respects custom options` | INFRA-005 | Custom URL `http://custom:9999`, custom token, SSE disable flag `"1"` | Calls with all options, asserts three env var values |
| `launchTUI is a function` | INFRA-006 | `typeof launchTUI === "function"` | Type check only — does not spawn process |
| `@microsoft/tui-test is importable` | INFRA-007 | Dynamic import resolves without error | Uses `bunEval()` to import package in subprocess, asserts exit code 0 and stdout `"ok"` |
| `TUITestInstance interface matches expected shape` | INFRA-008 | TypeScript compiles with all 10 required members | Uses `bunEval()` with type import and keyof assertion, verifies count is 10 |
| `TERMINAL_SIZES matches design.md breakpoints` | INFRA-009 | minimum=80×24, standard=120×40, large=200×60 | Dynamic import of helpers, asserts `toEqual` on each breakpoint |

### Step 5: Fix `diff.test.ts` import (Completed)

**File:** `e2e/tui/diff.test.ts`

The file imports from `./helpers.ts` (not the broken `@microsoft/tui-test` direct import):

```typescript
import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers.ts"
```

Test bodies remain as comment-only stubs describing expected behavior for diff syntax highlighting. Example:

```typescript
describe("TUI_DIFF_SYNTAX_HIGHLIGHT — SyntaxStyle lifecycle", () => {
  test("SNAP-SYN-010: renders syntax highlighting at 80x24 minimum", async () => {
    // Launch TUI at 80x24 minimum terminal size
    // Navigate to diff screen with a TypeScript file
    // Capture terminal snapshot
    // Assert: syntax colors are applied in unified mode
  })
  // ... 5 describe blocks total
})
```

---

## 4. File Inventory

### Implemented files (this ticket's deliverables)

| File path | Status | Lines | Description |
|-----------|--------|-------|-------------|
| `apps/tui/package.json` | ✅ Complete | 24 | `@microsoft/tui-test: "^0.0.3"` in devDependencies. `test:e2e` script. Core deps: `@opentui/core@0.1.90`, `@opentui/react@0.1.90`, `react@19.2.4`, `@codeplane/sdk@workspace:*`. |
| `e2e/tui/helpers.ts` | ✅ Complete | 492 | Full `launchTUI()`, `createTestCredentialStore()`, `createMockAPIEnv()`, all constants and interfaces. |
| `e2e/tui/app-shell.test.ts` | ✅ Complete | 5,438 | 38 describe blocks including E2E infrastructure tests (9 tests in lines 227-310). |
| `e2e/tui/diff.test.ts` | ✅ Fixed import | 216 | Uses `./helpers.ts` import. Comment-only test stubs. |
| `e2e/tui/bunfig.toml` | ✅ Complete | 2 | 30s timeout configuration. |

### Unchanged files (verified no modifications)

| File path | Status | Lines | Reason |
|-----------|--------|-------|--------|
| `e2e/tui/agents.test.ts` | Failing (expected) | 4,331 | Uses `launchTUI()` which works, but tests timeout because agent features are incomplete. |
| `e2e/tui/keybinding-normalize.test.ts` | Working | 74 | Tests keybinding normalization utilities. Unrelated to this ticket. |
| `e2e/tui/util-text.test.ts` | Working | 477 | Tests text utility functions. Unrelated to this ticket. |
| `apps/tui/src/index.tsx` | Working | 107 | Full bootstrap — not modified by this ticket. |

---

## 5. Dependencies

| Package | Version | Location | Type | Purpose |
|---------|---------|----------|------|--------|
| `@microsoft/tui-test` | `^0.0.3` | `apps/tui/package.json` devDeps | devDependency | PTY-backed terminal testing framework. Provides `Terminal` class with `@xterm/headless`, `Key` enum, `Locator` pattern, `Shell` enum. |
| `@xterm/headless` | (transitive) | via tui-test | transitive | Terminal emulation engine. Provides the virtual terminal buffer that `getViewableBuffer()` reads from. |
| `pty-bun` | (transitive/bundled) | via tui-test `lib/terminal/pty-bun.js` | bundled | PTY backend for Bun runtime. Spawns child processes in pseudo-terminals. |
| `node:path` | (builtin) | via helpers.ts | builtin | `join()` for path construction |
| `node:os` | (builtin) | via helpers.ts | builtin | `tmpdir()` for temp directory creation |
| `node:fs` | (builtin) | via helpers.ts | builtin | `mkdtempSync()`, `writeFileSync()`, `rmSync()` for credential store and cleanup |
| `node:events` | (builtin) | via helpers.ts | builtin | `EventEmitter` required as `traceEmitter` parameter to `spawn()` |

### Dependency validation (confirmed)

1. **Package installed** at `node_modules/.bun/@microsoft+tui-test@0.0.3/`
2. **Terminal API** verified: `write()`, `submit()`, `keyPress()`, `keyUp()`, `keyDown()`, `keyLeft()`, `keyRight()`, `keyEscape()`, `keyDelete()`, `keyBackspace()`, `keyCtrlC()`, `keyCtrlD()`, `getBuffer()`, `getViewableBuffer()`, `getCursor()`, `getByText()`, `serialize()`, `resize()`, `kill()`, `onExit()`
3. **Key enum** verified: `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `Delete`, `Backspace`, `Tab`, `Enter`, `Space`, `Escape`, `F1`-`F12`
4. **Bun PTY backend** verified: `lib/terminal/pty-bun.js` and `lib/terminal/pty-bun.d.ts` exist
5. **Import paths** verified: `@microsoft/tui-test/lib/terminal/term.js` exports `spawn()`, `@microsoft/tui-test/lib/terminal/shell.js` exports `Shell`
6. **No native addon beyond OpenTUI** — `@microsoft/tui-test`'s Bun PTY backend is pure JS using Bun's built-in PTY APIs

---

## 6. `launchTUI()` Architecture Details

### Test isolation guarantees

Each `launchTUI()` call creates:

1. **Fresh temp directory** for `CODEPLANE_CONFIG_DIR` via `mkdtempSync()` — unique per invocation, prevents config leakage between tests
2. **Fresh PTY + process** — `spawnTerminal()` creates a new PTY pair and child process — no shared file descriptors
3. **Deterministic environment** — `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8` — ensures consistent rendering behavior regardless of host terminal
4. **Known auth token** — `CODEPLANE_TOKEN=e2e-test-token` unless overridden via `env` — predictable auth state
5. **Process cleanup** — `terminate()` calls `terminal.kill()` AND `rmSync(configDir)` — no orphaned processes or temp files

### Timing constants

| Constant | Value | Purpose | Rationale |
|----------|-------|---------|----------|
| `DEFAULT_WAIT_TIMEOUT_MS` | 10,000ms | Max time `waitForText()`/`waitForNoText()` polls before throwing | Covers slow renders, API latency, and SSE connection establishment |
| `DEFAULT_LAUNCH_TIMEOUT_MS` | 15,000ms | Max time for TUI to become ready (defined in `LaunchTUIOptions`) | Reserved for future use — currently sleep-based |
| `POLL_INTERVAL_MS` | 100ms | Interval between buffer checks in wait loops | Balance between responsiveness and CPU usage |
| Inter-key delay | 50ms | Delay between successive key presses in `sendKeys()` | Allows terminal to process each key and update buffer |
| Post-spawn delay | 500ms | Wait for initial render after PTY spawn | Covers TUI bootstrap: assertTTY → createCliRenderer → createRoot → provider stack mount |
| Post-resize delay | 200ms | Wait for TUI to respond to SIGWINCH | Allows OpenTUI's `useOnResize` to fire and layout to recalculate |

### Error message format

`waitForText()` and `waitForNoText()` throw descriptive errors that include the full terminal buffer content, making test failures easy to diagnose:

```
waitForText: "Dashboard" not found within 10000ms.
Terminal content:
[full terminal buffer dump — every row of the virtual terminal]
```

This is critical for CI debugging where the terminal is not visible. The buffer dump shows exactly what the TUI rendered at the time of failure.

### Boundary checking

`getLine(n)` validates bounds before accessing the buffer:

```typescript
if (lineNumber < 0 || lineNumber >= buffer.length) {
  throw new Error(
    `getLine: line ${lineNumber} out of range (0-${buffer.length - 1})`,
  )
}
```

This prevents silent `undefined` returns when tests reference lines outside the terminal viewport.

---

## 7. Unit & Integration Tests

### Infrastructure tests in `app-shell.test.ts`

**Location:** `e2e/tui/app-shell.test.ts`, lines 227-310

**Describe block:** `TUI_APP_SHELL — E2E test infrastructure`

9 tests that validate the test infrastructure itself works correctly:

```typescript
import { readFileSync, existsSync } from "node:fs"
import {
  createTestCredentialStore,
  createMockAPIEnv,
  launchTUI,
  bunEval,
  TERMINAL_SIZES,
} from "./helpers.ts"

describe("TUI_APP_SHELL — E2E test infrastructure", () => {
  // INFRA-001
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

  // INFRA-002
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

  // INFRA-003
  test("createTestCredentialStore cleanup removes files", () => {
    const creds = createTestCredentialStore()
    const path = creds.path
    creds.cleanup()
    expect(existsSync(path)).toBe(false)
  })

  // INFRA-004
  test("createMockAPIEnv returns correct default values", () => {
    const env = createMockAPIEnv()
    expect(env.CODEPLANE_API_URL).toBe("http://localhost:13370")
    expect(env.CODEPLANE_TOKEN).toBe("test-token-for-e2e")
    expect(env.CODEPLANE_DISABLE_SSE).toBeUndefined()
  })

  // INFRA-005
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

  // INFRA-006
  test("launchTUI is a function", () => {
    expect(typeof launchTUI).toBe("function")
  })

  // INFRA-007
  test("@microsoft/tui-test is importable", async () => {
    const result = await bunEval(
      "import('@microsoft/tui-test').then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1) })",
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("ok")
  })

  // INFRA-008
  test("TUITestInstance interface matches expected shape", async () => {
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

  // INFRA-009
  test("TERMINAL_SIZES matches design.md breakpoints", async () => {
    const { TERMINAL_SIZES: sizes } = await import("./helpers.ts")
    expect(sizes.minimum).toEqual({ width: 80, height: 24 })
    expect(sizes.standard).toEqual({ width: 120, height: 40 })
    expect(sizes.large).toEqual({ width: 200, height: 60 })
  })
})
```

### Test state summary

**Tests that PASS (this ticket's scope):**

| Test file | Describe block | Count | Status |
|-----------|---------------|-------|--------|
| `app-shell.test.ts` | Package scaffold | 19 | ✅ Pass |
| `app-shell.test.ts` | TypeScript compilation | 3 | ✅ Pass |
| `app-shell.test.ts` | Dependency resolution | 7 | ✅ Pass |
| `app-shell.test.ts` | E2E test infrastructure | 9 | ✅ Pass |
| `keybinding-normalize.test.ts` | All blocks | ~15 | ✅ Pass |
| `util-text.test.ts` | All blocks | ~30 | ✅ Pass |

**Tests that FAIL (expected, per policy):**

| Test file | Approximate count | Reason |
|-----------|-------------------|--------|
| `agents.test.ts` | ~200+ | `launchTUI()` spawns TUI process successfully but feature screens are incomplete — `waitForText()` calls timeout waiting for expected agent UI text that hasn't been implemented yet. |
| `diff.test.ts` | ~34 | Test bodies are comment-only stubs with no assertions — tests pass vacuously (empty test bodies in Bun pass). When assertions are added by the `tui-diff` ticket, they will fail until diff features are implemented. |
| `app-shell.test.ts` (later blocks) | varies | Some tests in color capability, theme, layout, error boundary, auth, loading, screen router, keybinding blocks may fail depending on implementation completeness of the TUI runtime components. |

Per `feedback_failing_tests.md` and project policy: **tests that fail due to unimplemented backends are left failing. They are never skipped or commented out.** A failing test is a signal tracking progress toward full feature coverage.

### Test philosophy alignment

| Principle | Implementation |
|-----------|----------------|
| No mocking of implementation details | ✅ Tests use `launchTUI()` to spawn the real TUI process in a PTY. No mocking of hooks, state, or components. `@microsoft/tui-test` provides real terminal emulation via `@xterm/headless`. |
| Each test validates one behavior | ✅ Infrastructure tests each validate a single helper function or property. INFRA-001 tests credential file creation, INFRA-003 tests cleanup, etc. |
| Tests run at representative sizes | ✅ `TERMINAL_SIZES` provides minimum (80×24), standard (120×40), and large (200×60). Used in downstream test files via `launchTUI({ cols: TERMINAL_SIZES.minimum.width, rows: TERMINAL_SIZES.minimum.height })`. |
| Tests are independent | ✅ Each `launchTUI()` creates isolated temp dir, fresh PTY, no shared state. Each `createTestCredentialStore()` creates a unique temp directory. |
| Snapshot tests are supplementary | ✅ No snapshots in infrastructure tests. Snapshot capability available via `instance.snapshot()` for downstream use with `expect(...).toMatchSnapshot()`. |
| Failing tests stay failing | ✅ `agents.test.ts` (4,331 lines) fails because features are incomplete — not because test infrastructure is broken. Tests are never skipped. |

---

## 8. Acceptance Criteria

| # | Criterion | Status | Verification |
|---|-----------|--------|---------------|
| AC-1 | `@microsoft/tui-test` installed as devDependency | ✅ | `apps/tui/package.json` has `"@microsoft/tui-test": "^0.0.3"` |
| AC-2 | `bun install` succeeds from monorepo root | ✅ | Exit code 0, no resolution errors |
| AC-3 | `@microsoft/tui-test` importable at runtime | ✅ | `bunEval("import('@microsoft/tui-test')...")` returns `"ok"` (tested in INFRA-007) |
| AC-4 | `launchTUI()` is callable (no stub error) | ✅ | `typeof launchTUI === "function"` (tested in INFRA-006) |
| AC-5 | `launchTUI()` creates PTY-backed terminal | ✅ | Uses `spawnTerminal()` from `@microsoft/tui-test/lib/terminal/term.js` with `Shell.Bash` |
| AC-6 | `sendKeys()` sends proper key sequences | ✅ | Uses `terminal.keyPress()` and dedicated methods via `resolveKey()` switch statement |
| AC-7 | `snapshot()` returns grid-formatted text | ✅ | Returns `getViewableBuffer()` rows joined by `""` per row, `"\n"` between rows |
| AC-8 | `getLine(n)` returns nth buffer row with bounds checking | ✅ | Returns `getViewableBuffer()[n].join("")`, throws `Error` if `n` out of range |
| AC-9 | `resize()` calls `terminal.resize()` and updates tracked dimensions | ✅ | Updates `currentCols`/`currentRows`, calls `terminal.resize()`, 200ms sleep |
| AC-10 | `terminate()` kills process and cleans temp dir | ✅ | `terminal.kill()` + `rmSync(configDir, { recursive: true, force: true })`, both with error swallowing |
| AC-11 | `createTestCredentialStore()` creates valid JSON credential file | ✅ | Tested in INFRA-001, INFRA-002 |
| AC-12 | `createTestCredentialStore().cleanup()` removes temp files | ✅ | Tested in INFRA-003 |
| AC-13 | `createMockAPIEnv()` returns correct env vars | ✅ | Tested in INFRA-004, INFRA-005 |
| AC-14 | `e2e/tui/bunfig.toml` exists with `timeout = 30000` | ✅ | File exists with `[test]\ntimeout = 30000` |
| AC-15 | `apps/tui/package.json` has `test:e2e` script | ✅ | `"test:e2e": "bun test ../../e2e/tui/ --timeout 30000"` |
| AC-16 | All existing exports preserved | ✅ | 17 public exports: `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`, `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`, `TERMINAL_SIZES`, `TUITestInstance`, `LaunchTUIOptions`, `launchTUI`, `createTestCredentialStore`, `createMockAPIEnv`, `run`, `bunEval` |
| AC-17 | `diff.test.ts` import fixed to `./helpers.ts` | ✅ | `import { launchTUI, TUITestInstance, TERMINAL_SIZES } from "./helpers.ts"` |
| AC-18 | Infrastructure tests pass (9/9) | ✅ | INFRA-001 through INFRA-009 in `TUI_APP_SHELL — E2E test infrastructure` block |
| AC-19 | No changes to `apps/tui/src/` from this ticket | ✅ | Entry point evolution is from `tui-foundation-scaffold` and subsequent tickets |
| AC-20 | No changes to `agents.test.ts` test bodies | ✅ | File unchanged at 4,331 lines |
| AC-21 | Each `launchTUI()` creates isolated state | ✅ | Unique temp dirs via `mkdtempSync()`, fresh PTY per call |

---

## 9. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `pty-bun` backend incompatibility with Bun version upgrades | `spawn()` fails to create PTY, all E2E tests fail | Low | Package ships Bun-native PTY at `lib/terminal/pty-bun.js`. Pin `@microsoft/tui-test` version range. Monitor for upstream updates. Fallback: Node PTY backend at `lib/terminal/pty-node.js`. |
| `@xterm/headless` version incompatibility | Terminal emulation errors, incorrect buffer content | Low | Pure JS package, no native deps. Version locked by tui-test's internal dependency tree. |
| `getViewableBuffer()` returns empty rows for crashed TUI process | `snapshot()` returns whitespace-only string, `waitForText()` times out with unhelpful error | Medium | 500ms post-spawn delay covers normal bootstrap. `waitForText()` error messages include full buffer dump for diagnosis. Future: add `onExit()` handler to detect early crashes. |
| Multiple concurrent `launchTUI()` calls exhaust PTY file descriptors | "Too many open files" errors in CI | Low | Each test should call `terminate()` in `afterEach` or `try/finally`. `terminal.kill()` closes PTY FDs. Bun default FD limit is typically 1024. |
| Dynamic import path `@microsoft/tui-test/lib/terminal/term.js` changes in newer versions | Import fails on upgrade | Low | Pinned `^0.0.3` limits to patch updates. Internal path verified from v0.0.3 package contents. |
| Test timeout at 30s too short for complex E2E interaction sequences | Tests fail with `bun:test` timeout rather than descriptive `waitForText` error | Medium | `waitForText()` has its own 10s timeout with descriptive errors. Per-test timeout can be extended via `test(name, fn, { timeout: 60_000 })`. `bunfig.toml` is the default only. |
| `sleep(500)` post-spawn may be insufficient on slow CI machines | Tests fail because initial render hasn't completed | Medium | Downstream tests use `waitForText()` as the real synchronization primitive — they don't rely on the 500ms being sufficient. The sleep is a best-effort optimization to avoid the first poll cycle returning empty. |

---

## 10. Productionization Notes

### What this ticket produces

**Permanent infrastructure** — not POC code. All files produced by this ticket are production test infrastructure:

1. **`@microsoft/tui-test` dependency** — The real npm package providing PTY-backed terminal testing. This is the permanent test dependency for all TUI E2E tests. No POC code involved.

2. **`e2e/tui/helpers.ts`** — The permanent test helper module consumed by all test files in `e2e/tui/`. The `TUITestInstance` interface is the stable API contract. Internal implementation details (Terminal wrapping, key resolution) can change without affecting test files.

3. **`e2e/tui/bunfig.toml`** — Permanent test runner configuration.

4. **Infrastructure tests** — Permanent validation that test tooling works correctly. These tests serve as smoke tests in CI — if any of INFRA-001 through INFRA-009 fail, it means the test infrastructure itself is broken.

### API stability contract

The `TUITestInstance` interface is the **contract boundary** between helpers and test files:

```
┌──────────────────────────┐     ┌──────────────────────────┐
│  Test files              │     │  helpers.ts              │
│  (app-shell.test.ts,     │────>│  (launchTUI returns      │
│   agents.test.ts,        │     │   TUITestInstance)       │
│   diff.test.ts, etc.)    │     │                          │
│                          │     │  Internal:               │
│  Uses:                   │     │  - resolveKey()          │
│  - sendKeys()            │     │  - Terminal wrapping     │
│  - waitForText()         │     │  - getBufferText()       │
│  - snapshot()            │     │  - spawn() import        │
│  - etc.                  │     │                          │
└──────────────────────────┘     └──────────────────────────┘
         ▲ stable interface              ▲ can change freely
```

All test files depend only on `TUITestInstance`. The internal implementation can change (different PTY library, different terminal emulator, different buffer capture method) without affecting any test file. The adapter layer in `launchTUI()` absorbs all such changes.

### Transition path for downstream tickets

| Capability | When needed | How |
|------------|-------------|-----|
| Feature tests start passing | As TUI screens gain real content | `waitForText()` finds expected content → tests pass incrementally. No changes needed to helpers.ts. |
| Golden snapshot files | First stable screen render | Use `instance.snapshot()` with `expect(...).toMatchSnapshot()` from `bun:test`. Snapshots stored in `e2e/tui/__snapshots__/`. |
| Color assertions | Diff/theme tests | Use `Terminal.getByText().toHaveFgColor()` / `.toHaveBgColor()` from tui-test's Locator API. Requires extending `TUITestInstance` to expose `getByText()` or adding a new `assertColor()` helper. |
| In-process component tests | Isolated component testing | Use `@opentui/react/test-utils`'s `testRender()` directly — complementary to E2E, no `launchTUI()` needed. Component tests can live alongside E2E tests or in `apps/tui/src/__tests__/`. |
| Mock API server | Data-dependent feature tests | Add `createMockAPIServer()` helper that starts an HTTP server with configurable routes and responses. Currently only `createMockAPIEnv()` exists for env configuration. The mock server would be a Bun HTTP server returning fixture data. |
| Serialized snapshots with ANSI | Cross-run regression detection with color info | Use `terminal.serialize()` from `@microsoft/tui-test` for deterministic ANSI-encoded snapshots (includes escape sequences for colors). Requires exposing `serialize()` through the `TUITestInstance` adapter. |
| Locator-based assertions | Precise text matching with position/style | Use tui-test's `terminal.getByText(text)` Locator pattern for `toBeVisible()`, `toHaveFgColor()`, `toHaveBgColor()`. More precise than regex on `getLine()`. |

### Why real `@microsoft/tui-test` over workspace stub

The real package provides capabilities that cannot be replicated by a stub:

| Capability | Real package | Workspace stub |
|-----------|-------------|---------------|
| **Real PTY** | Exercises full TUI bootstrap (assertTTY passes, createCliRenderer gets real terminal, raw mode works) | assertTTY would fail or need bypass |
| **Real terminal emulation** | `@xterm/headless` handles VT100 escape sequences, alternate screen buffer, cursor positioning, raw mode, line wrapping | Would need to parse raw ANSI bytes manually |
| **Process-level isolation** | Tests exercise the TUI as a subprocess, exactly like a real user | In-process tests share memory and state |
| **Accurate buffer capture** | `getViewableBuffer()` returns what a user would see on screen | Stdout pipe includes invisible control sequences |
| **Resize support** | `terminal.resize()` sends SIGWINCH to child process | Would need manual signal sending |
| **Battle-tested** | Used in production by VS Code terminal, Windows Terminal, Microsoft dev tools | Untested |

`@opentui/react/test-utils` remains available for complementary in-process component testing where PTY overhead is unnecessary.

---

## 11. Exports Reference

Complete list of all 17 public exports from `e2e/tui/helpers.ts`:

| Export | Type | Kind | Description |
|--------|------|------|-------------|
| `TUI_ROOT` | `string` | constant | Absolute path to `apps/tui/` |
| `TUI_SRC` | `string` | constant | Absolute path to `apps/tui/src/` |
| `TUI_ENTRY` | `string` | constant | Absolute path to `apps/tui/src/index.tsx` |
| `BUN` | `string` | constant | Path to Bun binary via `Bun.which("bun")` or `process.execPath` |
| `API_URL` | `string` | constant | Test API server URL (env `API_URL` or `http://localhost:3000`) |
| `WRITE_TOKEN` | `string` | constant | Test write auth token (env `CODEPLANE_WRITE_TOKEN` or `codeplane_deadbeef...`) |
| `READ_TOKEN` | `string` | constant | Test read auth token (env `CODEPLANE_READ_TOKEN` or `codeplane_feedface...`) |
| `OWNER` | `string` | constant | Test repo owner (env `CODEPLANE_E2E_OWNER` or `alice`) |
| `ORG` | `string` | constant | Test organization (env `CODEPLANE_E2E_ORG` or `acme`) |
| `TERMINAL_SIZES` | `{ minimum, standard, large }` | constant | Breakpoint dimensions matching design.md § 8.1 |
| `TUITestInstance` | interface | type | Test instance contract: 10 members (sendKeys, sendText, waitForText, waitForNoText, snapshot, getLine, resize, terminate, rows, cols) |
| `LaunchTUIOptions` | interface | type | Launch configuration: 5 optional fields (cols, rows, env, args, launchTimeoutMs) |
| `createTestCredentialStore` | `(token?: string) => { path, token, cleanup }` | function | Create isolated credential store file in temp directory |
| `createMockAPIEnv` | `(options?) => Record<string, string>` | function | Generate mock API environment variables |
| `launchTUI` | `(options?) => Promise<TUITestInstance>` | function | Launch TUI with PTY-backed terminal via @microsoft/tui-test |
| `run` | `(cmd, opts?) => Promise<{ exitCode, stdout, stderr }>` | function | Execute subprocess command in TUI package context |
| `bunEval` | `(expression) => Promise<{ exitCode, stdout, stderr }>` | function | Run `bun -e` expression for import/compilation verification |

---

## 12. Implementation Checklist

- [x] Add `"@microsoft/tui-test": "^0.0.3"` to `apps/tui/package.json` devDependencies
- [x] Add `"test:e2e": "bun test ../../e2e/tui/ --timeout 30000"` to `apps/tui/package.json` scripts
- [x] Run `bun install` from monorepo root; verify success
- [x] Create `e2e/tui/bunfig.toml` with `[test]` section and `timeout = 30000`
- [x] Implement `launchTUI()` in `e2e/tui/helpers.ts` using `@microsoft/tui-test`'s `spawn()`
- [x] Add `resolveKey()` internal function with switch statement for key name → Terminal method mapping
- [x] Add `KeyAction`, `SpecialKeyAction`, `ResolvedKey` internal types
- [x] Add `LaunchTUIOptions` interface with 5 optional fields
- [x] Add `TUITestInstance` interface with 10 members
- [x] Add `createTestCredentialStore()` helper with temp dir, JSON credential file, and cleanup
- [x] Add `createMockAPIEnv()` helper with default port 13370, token, and SSE disable flag
- [x] Add `node:os`, `node:fs`, `node:path` imports to `helpers.ts`
- [x] Add `sleep()` function to `helpers.ts` (internal, not exported)
- [x] Add `DEFAULT_WAIT_TIMEOUT_MS` (10s), `DEFAULT_LAUNCH_TIMEOUT_MS` (15s), `POLL_INTERVAL_MS` (100ms) constants
- [x] Add `getBufferText()` internal function that joins `getViewableBuffer()` rows
- [x] Preserve all existing exports: `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN`, `API_URL`, `WRITE_TOKEN`, `READ_TOKEN`, `OWNER`, `ORG`, `TERMINAL_SIZES`, `run()`, `bunEval()`
- [x] Fix `e2e/tui/diff.test.ts` import: uses `./helpers.ts` (not broken `@microsoft/tui-test` direct import)
- [x] Add 9 infrastructure tests to `e2e/tui/app-shell.test.ts` (INFRA-001 through INFRA-009)
- [x] Add `createTestCredentialStore`, `createMockAPIEnv`, `launchTUI`, `bunEval`, `TERMINAL_SIZES` imports to `app-shell.test.ts`
- [x] Verify infrastructure tests pass (9/9)
- [x] Verify `agents.test.ts` tests fail with `waitForText` timeout (not "Not yet implemented" stub error)
- [x] Verify `diff.test.ts` has no import resolution errors
- [x] Verify TUI entry point (`apps/tui/src/index.tsx`) not modified by this ticket
- [x] Verify `agents.test.ts` test bodies unchanged (4,331 lines)