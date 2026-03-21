# Engineering Specification: tui-e2e-test-infra

## Set up TUI E2E test infrastructure with @microsoft/tui-test helpers

**Ticket ID:** `tui-e2e-test-infra`  
**Type:** Engineering  
**Depends on:** `tui-foundation-scaffold` (completed)  
**Estimate:** 4 hours  

---

## 1. Current State Analysis

### What exists today

| File | State | Notes |
|------|-------|-------|
| `e2e/tui/helpers.ts` | Implemented (buggy) | 353 lines. Exports `TUITestInstance` interface and `launchTUI()` using `Bun.spawn()` with raw stdout pipe buffering. Imports `createTestTui` from `@microsoft/tui-test` at line 6 but **never uses it** — the `launchTUI()` implementation uses `Bun.spawn()` directly. Three critical bugs: (1) `sendKeys()` writes literal key names to stdin, (2) no `COLUMNS`/`LINES` env vars, (3) `createTestTui` import is dead code. |
| `e2e/tui/app-shell.test.ts` | Populated | 875 lines, 2 top-level describe blocks: `TUI_LOADING_STATES` (45 tests across 8 sub-describes) and `KeybindingProvider — Priority Dispatch` (31 tests across 7 sub-describes). All tests use `launchTUI()` from `./helpers`. All fail because TUI process exits immediately or cannot connect to API. |
| `e2e/tui/agents.test.ts` | Populated | Imports from `./helpers`. Contains agent session, chat, and SSE streaming tests. |
| `e2e/tui/agents-registry.test.ts` | Populated | Agent navigation and registry tests. |
| `e2e/tui/organizations.test.ts` | Populated | Tab bar rendering, content display, filtering tests. |
| `e2e/tui/diff.test.ts` | Mixed | Imports pure functions from `../../apps/tui/src/lib/diff-parse`. Unit tests for diff parsing — does not depend on `@microsoft/tui-test`. |
| `e2e/tui/clipboard.test.ts` | Working | Unit-style tests using `bun:test` only — does not depend on `@microsoft/tui-test`. |
| `e2e/tui/workflows.test.ts` | Populated | Workflow feature tests. Imports from `./helpers.js`. |
| `e2e/tui/workflow-sse.test.ts` | Populated | Workflow SSE streaming tests. Imports from `./helpers.js` and `./helpers/workflows.js`. |
| `e2e/tui/workflow-utils.test.ts` | Populated | Workflow utility function unit tests. |
| `e2e/tui/workspaces.test.ts` | Populated | Workspace feature tests. Imports from `./helpers`. |
| `e2e/tui/workspaces-sse.test.ts` | Populated | Workspace SSE status streaming tests. Imports from `./helpers`. |
| `e2e/tui/keybinding-normalize.test.ts` | Populated | Key event normalization unit tests — no TUI launch. |
| `e2e/tui/streaming/sse-constants.test.ts` | Working | SSE constants validation. Imports from `apps/tui/src/streaming/types`. |
| `e2e/tui/streaming/event-deduplicator.test.ts` | Working | Event deduplication logic unit tests. |
| `e2e/tui/helpers/index.ts` | Working | 3 lines. Re-exports from `./workspaces.js` and `./workflows.js`. |
| `e2e/tui/helpers/workspaces.ts` | Working | 352 lines. Workspace fixtures (`WORKSPACE_IDS`, `WORKSPACE_FIXTURES`), `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()`, SSE injection helpers, assertion helpers (`assertWorkspaceRow()`, `stripAnsi()`, `hasReverseVideo()`). Imports `launchTUI`, `TUITestInstance`, `LaunchTUIOptions` from `../helpers.js`. |
| `e2e/tui/helpers/workflows.ts` | Working | 63 lines. `navigateToWorkflowRunDetail()`, `waitForLogStreaming()`, `createSSEInjectFile()`. |
| `e2e/tui/helpers/workspace-sse.ts` | Working | 83 lines. `createWorkspaceSSEEvent()`, `createSSEInjectionFile()`, `waitForWorkspaceStatus()`, `assertConnectionIndicator()`. Imports from `@codeplane/ui-core/types/workspaces`. |
| `e2e/tui/helpers/__tests__/workspaces.test.ts` | Working | 292 lines. Self-tests for the test infrastructure — validates fixtures, SSE events, injection files, string utilities. |
| `e2e/tui/bunfig.toml` | Working | Sets `timeout = 30000` for tests. |
| `e2e/tui/__snapshots__/` | Directory | Exists with `agents.test.ts.snap` (empty placeholder). |
| `packages/tui-test/package.json` | Stub | `{"name": "@microsoft/tui-test", "version": "0.3.0", "main": "index.js", "types": "index.d.ts"}` |
| `packages/tui-test/index.js` | Stub | `export async function createTestTui(opts) { return {}; }` |
| `packages/tui-test/index.d.ts` | Stub | `export declare function createTestTui(opts?: any): Promise<any>;` |
| `apps/tui/package.json` | Working | Has `@microsoft/tui-test: "workspace:*"` in devDependencies, `test:e2e` script: `bun test ../../e2e/tui/ --timeout 30000`. |
| `apps/tui/src/index.tsx` | Implemented | 88 lines. Full bootstrap: `assertTTY()`, `parseCLIArgs()`, `createCliRenderer()`, `createRoot()`, renders provider stack (ErrorBoundary → ThemeProvider → KeybindingProvider → AuthProvider → APIClientProvider → SSEProvider → NavigationProvider → LoadingProvider → GlobalKeybindings → AppShell). |

### Review findings (from `tui-e2e-test-infra-iteration-0.md`)

The P0 issues identified in the iteration-0 review:

1. **[P0] No PTY** — `launchTUI` uses `Bun.spawn` with `stdout: "pipe"`/`stdin: "pipe"` instead of a PTY, so rendered screen state is not properly captured. The raw stdout buffer accumulates ANSI cursor movement sequences without terminal emulation to reconstruct a 2D grid.

2. **[P0] Key simulation is wrong** — `sendKeys()` writes literal strings like `"Enter"` and `"Tab"` to stdin instead of terminal control sequences (`\r`, `\t`, `\x1b[A`, etc.).

3. **[P0] `@microsoft/tui-test` is a no-op** — `createTestTui()` returns `{}` with no methods.

4. **[P1] `launchTimeoutMs` is exposed but unused** — No timeout behavior is implemented.

5. **[P1] App bootstrap exists but needs PTY** — `index.tsx` has full runtime code (confirmed: 88 lines with `createCliRenderer()`, `createRoot()`, provider stack) but the test harness doesn't provide a PTY, so `assertTTY()` may fail or the renderer may detect non-TTY and behave differently.

### What's broken — root causes

1. **`@microsoft/tui-test` is a stub package.** `packages/tui-test/index.js` exports `createTestTui(opts) { return {}; }`. Any test depending on the returned object gets nothing.

2. **`helpers.ts` imports `createTestTui` but never uses it.** Line 6: `import { createTestTui } from "@microsoft/tui-test"` — the import resolves (stub package exists) but the symbol is dead code. The `launchTUI()` implementation on line 180 uses `Bun.spawn()` directly.

3. **The `Bun.spawn()` approach has no PTY.** Without a pseudo-terminal:
   - The TUI process may fail `assertTTY()` (line ~17 of `index.tsx`) and exit immediately.
   - OpenTUI's `createCliRenderer()` detects non-TTY stdout and may skip alternate screen buffer, cursor hiding, etc.
   - `snapshot()` returns raw accumulated stdout bytes — a stream of writes with cursor movement sequences, not a 2D terminal grid.
   - `resize()` sends `SIGWINCH` but without a PTY, the process cannot query new dimensions.
   - `getLine()` splits by `\n` on a non-grid buffer, producing unreliable results.

4. **Key mapping is missing.** `sendKeys("Enter")` writes the literal string `"Enter"` (5 characters) to stdin instead of `"\r"`. Same for `"Tab"`, `"Escape"`, arrow keys, etc. See line 232-237 of `helpers.ts`:
   ```typescript
   async sendKeys(...keys: string[]): Promise<void> {
     for (const key of keys) {
       if (proc.stdin) {
         proc.stdin.write(key);  // BUG: writes literal "Enter" not "\r"
       }
       await sleep(50);
     }
   },
   ```

5. **`@opentui/react/test-utils` exists but is unused.** OpenTUI ships `testRender()` which creates a proper in-process test renderer with `captureCharFrame()`, `captureSpans()`, `resize()`, and `MockInput` (with `typeText()`, `pressKey()`, `pressKeys()`, `pressEnter()`, `pressEscape()`, `pressTab()`, `pressBackspace()`, `pressArrow()`, `pressCtrlC()`, `pasteBracketedText()`). This is the correct tool for component-level and screen-level TUI testing.

### Verified OpenTUI test-utils API surface

The following was confirmed by reading the actual type declarations and implementation from `.bun-cache/@opentui/react@0.1.90@@@1/`:

**`testRender(node, options)` from `@opentui/react/test-utils`:**
```typescript
function testRender(
  node: ReactNode,
  testRendererOptions: TestRendererOptions
): Promise<{
  renderer: TestRenderer;
  mockInput: MockInput;
  mockMouse: MockMouse;
  renderOnce: () => Promise<void>;
  captureCharFrame: () => string;       // returns grid-formatted text string
  captureSpans: () => CapturedFrame;    // returns structured frame with color/attribute data
  resize: (width: number, height: number) => void;
}>;
```

**Implementation detail (from `test-utils.js`):**
```javascript
async function testRender(node, testRendererOptions) {
  let root = null;
  setIsReactActEnvironment(true);
  const testSetup = await createTestRenderer({
    ...testRendererOptions,
    onDestroy() {
      act(() => { if (root) { root.unmount(); root = null; } });
      testRendererOptions.onDestroy?.();
      setIsReactActEnvironment(false);
    }
  });
  root = createRoot(testSetup.renderer);
  act(() => { if (root) { root.render(node); } });
  return testSetup;
}
```

**`MockInput` methods (from `mock-keys.d.ts`):**
- `pressKeys(keys: KeyInput[], delayMs?: number): Promise<void>` — Send multiple keys with optional delay
- `pressKey(key: KeyInput, modifiers?: Modifiers): void` — Send a single key with optional modifiers
- `typeText(text: string, delayMs?: number): Promise<void>` — Type text character by character
- `pressEnter(modifiers?: Modifiers): void`
- `pressEscape(modifiers?: Modifiers): void`
- `pressTab(modifiers?: Modifiers): void`
- `pressBackspace(modifiers?: Modifiers): void`
- `pressArrow(direction: "up" | "down" | "left" | "right", modifiers?: Modifiers): void`
- `pressCtrlC(): void`
- `pasteBracketedText(text: string): Promise<void>`

**`Modifiers` interface:**
```typescript
interface Modifiers {
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  super?: boolean;
  hyper?: boolean;
}
```

**`KeyCodes` constants:**
```typescript
const KeyCodes = {
  RETURN: "\r", LINEFEED: "\n", TAB: "\t", BACKSPACE: "\b",
  DELETE: "\x1b[3~", HOME: "\x1b[H", END: "\x1b[F", ESCAPE: "\x1b",
  ARROW_UP: "\x1b[A", ARROW_DOWN: "\x1b[B", ARROW_RIGHT: "\x1b[C", ARROW_LEFT: "\x1b[D",
  F1: "\x1bOP", F2: "\x1bOQ", F3: "\x1bOR", F4: "\x1bOS",
  F5: "\x1b[15~", F6: "\x1b[17~", F7: "\x1b[18~", F8: "\x1b[19~",
  F9: "\x1b[20~", F10: "\x1b[21~", F11: "\x1b[23~", F12: "\x1b[24~"
};
```

**`CapturedFrame` structure (from `types.d.ts`):**
```typescript
interface CapturedFrame {
  cols: number;
  rows: number;
  cursor: [number, number];
  lines: CapturedLine[];
}

interface CapturedLine {
  spans: CapturedSpan[];
}

interface CapturedSpan {
  text: string;
  fg: RGBA;
  bg: RGBA;
  attributes: number;
  width: number;
}
```

---

## 2. Goals

| # | Goal |
|---|------|
| G1 | Replace the `packages/tui-test/` stub with a real `@microsoft/tui-test` implementation that wraps `@opentui/react/test-utils` to provide `createTestTui()` with full virtual terminal emulation for in-process rendering. |
| G2 | Upgrade `launchTUI()` in `e2e/tui/helpers.ts` to support a dual-mode architecture: in-process mode via `@opentui/react/test-utils`'s `testRender()` (high fidelity, virtual terminal buffer, proper keyboard simulation) and out-of-process mode via `Bun.spawn()` (improved with key sequence mapping and `COLUMNS`/`LINES` env vars). |
| G3 | Fix the key simulation bug by adding `mapKeyToSequence()` that converts human-readable key names to proper terminal escape sequences for the out-of-process path. |
| G4 | Preserve all existing helper exports and test files unchanged. No test body modifications. |
| G5 | Validate that all test files resolve imports correctly after the package upgrade. |
| G6 | Tests that fail due to unimplemented backend features or missing TUI runtime remain failing — never skipped or commented out. |

---

## 3. Implementation Plan

### Step 1: Implement the `@microsoft/tui-test` workspace package

**Files:**
- `packages/tui-test/package.json` — modify: add dependencies, change `main` to `index.ts`
- `packages/tui-test/index.ts` — new: real implementation wrapping `@opentui/react/test-utils`
- `packages/tui-test/index.d.ts` — modify: replace stub types with full declarations
- `packages/tui-test/index.js` — delete: replaced by `index.ts`

#### `packages/tui-test/package.json`

```json
{
  "name": "@microsoft/tui-test",
  "version": "0.3.0",
  "type": "module",
  "main": "index.ts",
  "types": "index.d.ts",
  "dependencies": {
    "@opentui/react": "0.1.90",
    "@opentui/core": "0.1.90",
    "react": "19.2.4"
  }
}
```

**Rationale:** Pin exact versions matching `apps/tui/package.json` to ensure rendering-critical dependency consistency per architecture doc ("Pin exact versions for rendering-critical dependencies"). Use `.ts` as main entry since Bun executes TypeScript directly without transpilation.

#### `packages/tui-test/index.ts`

This file wraps `@opentui/react/test-utils`'s `testRender()` to provide the `createTestTui()` API. The wrapper adapts the OpenTUI test-utils API surface into the `TestTuiInstance` contract consumed by `e2e/tui/helpers.ts`.

```typescript
import { testRender } from "@opentui/react/test-utils";
import type { ReactNode } from "react";

export interface CreateTestTuiOptions {
  /** Terminal width in columns. Default: 120. */
  cols?: number;
  /** Terminal height in rows. Default: 40. */
  rows?: number;
  /** React element to render in-process via testRender(). */
  node?: ReactNode;
  /** Executable path (for out-of-process mode — reserved, not implemented). */
  executable?: string;
  /** Command args (for out-of-process mode — reserved, not implemented). */
  args?: string[];
  /** Environment variables. */
  env?: Record<string, string>;
  /** Timeout in ms. Default: 15000. */
  timeout?: number;
}

export interface TestTuiInstance {
  /** Send a single key press. Accepts human-readable names
   * (Enter, Escape, Tab, ctrl+c, etc.) or single characters. */
  sendKey(key: string): Promise<void>;
  /** Type text character by character. */
  type(text: string): Promise<void>;
  /** Get full screen text. When includeAnsi is true, ANSI escape
   * codes are preserved via CapturedFrame span reconstruction. */
  getScreenText(options?: { includeAnsi?: boolean }): string;
  /** Resize the virtual terminal. */
  resize(cols: number, rows: number): Promise<void>;
  /** Dispose of the virtual terminal and clean up resources. */
  dispose(): Promise<void>;
  /** Force a render cycle and wait for it to complete. */
  renderOnce(): Promise<void>;
}

/**
 * Create a virtual terminal test instance wrapping @opentui/react test-utils.
 *
 * For in-process testing: pass `node` — a React element to render inside
 * testRender(). This gives you a virtual terminal buffer with proper layout,
 * input handling, and frame capture.
 *
 * For out-of-process testing: use `launchTUI()` from `e2e/tui/helpers.ts`
 * directly. The `executable`/`args` parameters are reserved for future use.
 */
export async function createTestTui(
  opts?: CreateTestTuiOptions
): Promise<TestTuiInstance> {
  const width = opts?.cols ?? 120;
  const height = opts?.rows ?? 40;

  if (opts?.node) {
    // testRender() internally:
    // 1. Creates a TestRenderer via createTestRenderer()
    // 2. Creates a React root via createRoot(renderer)
    // 3. Uses act() to render the provided node
    // 4. Returns { renderer, mockInput, mockMouse, renderOnce,
    //              captureCharFrame, captureSpans, resize }
    const result = await testRender(opts.node, { width, height });

    return {
      async sendKey(key: string): Promise<void> {
        const { mockInput } = result;
        // Map human-readable key names to MockInput methods.
        // MockInput uses OpenTUI's native key handling which
        // correctly generates the terminal sequences internally.
        switch (key) {
          case "Enter":
          case "Return":
            mockInput.pressEnter();
            break;
          case "Escape":
          case "Esc":
            mockInput.pressEscape();
            break;
          case "Tab":
            mockInput.pressTab();
            break;
          case "Backspace":
            mockInput.pressBackspace();
            break;
          case "Up":
          case "ArrowUp":
            mockInput.pressArrow("up");
            break;
          case "Down":
          case "ArrowDown":
            mockInput.pressArrow("down");
            break;
          case "Left":
          case "ArrowLeft":
            mockInput.pressArrow("left");
            break;
          case "Right":
          case "ArrowRight":
            mockInput.pressArrow("right");
            break;
          case "ctrl+c":
          case "\x03":
            mockInput.pressCtrlC();
            break;
          case "shift+Tab":
            mockInput.pressTab({ shift: true });
            break;
          default:
            // Handle ctrl+X patterns (e.g., ctrl+b, ctrl+d, ctrl+s)
            if (key.startsWith("ctrl+") && key.length === 6) {
              mockInput.pressKey(key[5], { ctrl: true });
            } else if (key.startsWith("shift+")) {
              mockInput.pressKey(key.slice(6), { shift: true });
            } else if (key.length === 1) {
              // Single character — typeText for printable chars.
              // typeText() is async but for single chars it's
              // effectively synchronous.
              mockInput.typeText(key);
            } else {
              // Fallback: try pressKey with the raw key string.
              // KeyInput accepts string | keyof typeof KeyCodes.
              mockInput.pressKey(key);
            }
        }
        // Flush the render pipeline so the screen reflects the key press.
        await result.renderOnce();
      },

      async type(text: string): Promise<void> {
        await result.mockInput.typeText(text);
        await result.renderOnce();
      },

      getScreenText(options?: { includeAnsi?: boolean }): string {
        if (options?.includeAnsi) {
          // captureSpans() returns a CapturedFrame with structured
          // color/attribute data per span per line.
          const frame = result.captureSpans();
          return frame.lines
            .map((line) =>
              line.spans.map((span) => span.text).join("")
            )
            .join("\n");
        }
        // captureCharFrame() returns a clean text string
        // representing the terminal grid — no ANSI codes.
        return result.captureCharFrame();
      },

      async resize(cols: number, rows: number): Promise<void> {
        result.resize(cols, rows);
        await result.renderOnce();
      },

      async dispose(): Promise<void> {
        // testRender() sets up an onDestroy callback that unmounts
        // the React root and resets the act environment.
        try {
          result.renderer.destroy();
        } catch {
          // Best-effort cleanup
        }
      },

      async renderOnce(): Promise<void> {
        await result.renderOnce();
      },
    };
  }

  // Out-of-process mode is not implemented in this package.
  // Use launchTUI() from e2e/tui/helpers.ts for out-of-process testing.
  throw new Error(
    "createTestTui: out-of-process mode (executable + args) is not yet implemented. " +
    "Use the launchTUI() helper from e2e/tui/helpers.ts for out-of-process testing, " +
    "or pass a React node for in-process testing."
  );
}
```

#### `packages/tui-test/index.d.ts`

Full type declarations replacing the single-line stub:

```typescript
import type { ReactNode } from "react";

export interface CreateTestTuiOptions {
  cols?: number;
  rows?: number;
  node?: ReactNode;
  executable?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export interface TestTuiInstance {
  sendKey(key: string): Promise<void>;
  type(text: string): Promise<void>;
  getScreenText(options?: { includeAnsi?: boolean }): string;
  resize(cols: number, rows: number): Promise<void>;
  dispose(): Promise<void>;
  renderOnce(): Promise<void>;
}

export declare function createTestTui(
  opts?: CreateTestTuiOptions
): Promise<TestTuiInstance>;
```

**Verification criteria:**
- `import { createTestTui } from "@microsoft/tui-test"` resolves to the new `.ts` file via workspace resolution.
- `typeof createTestTui === "function"` returns `true`.
- `createTestTui({ node: React.createElement("text", null, "hello"), cols: 80, rows: 24 })` returns a `TestTuiInstance` where `getScreenText()` includes `"hello"`.
- `createTestTui()` (no args, no node) throws the descriptive error about out-of-process mode.

---

### Step 2: Upgrade `e2e/tui/helpers.ts` — dual-mode `launchTUI()` with key mapping fix

**File:** `e2e/tui/helpers.ts`

The existing `launchTUI()` has three critical bugs to fix:
1. `sendKeys()` writes literal key names (`"Enter"`, `"Tab"`) to stdin instead of escape sequences
2. No `COLUMNS`/`LINES` environment variables for terminal dimension detection
3. The `createTestTui` import is dead code

The upgrade adds:
1. A `render` option in `LaunchTUIOptions` for in-process mode via `createTestTui()`
2. A `mapKeyToSequence()` function for proper key mapping in out-of-process mode
3. `COLUMNS`/`LINES` env vars in the spawned process environment
4. All existing exports preserved identically

#### Complete upgraded `e2e/tui/helpers.ts`

```typescript
// e2e/tui/helpers.ts

import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import {
  createTestTui,
  type TestTuiInstance as InternalTestTuiInstance,
} from "@microsoft/tui-test";
import type { ReactNode } from "react";

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

// ── Agent navigation helpers ─────────────────────────────────────────────────

export async function navigateToAgents(
  terminal: TUITestInstance,
): Promise<void> {
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}

export async function waitForSessionListReady(
  terminal: TUITestInstance,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < 10_000) {
    const content = terminal.snapshot();
    if (
      !content.includes("Loading sessions") &&
      (content.includes("sessions") || content.includes("No sessions"))
    ) {
      return;
    }
    await sleep(100);
  }
}

export async function navigateToAgentChat(
  terminal: TUITestInstance,
  sessionIndex: number = 0,
): Promise<void> {
  await navigateToAgents(terminal);
  await waitForSessionListReady(terminal);
  for (let i = 0; i < sessionIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("Enter");
  await waitForChatReady(terminal);
}

export async function waitForChatReady(
  terminal: TUITestInstance,
): Promise<void> {
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
  /**
   * Optional React node for in-process rendering via @opentui/react test-utils.
   * When provided, bypasses Bun.spawn() and uses testRender() directly.
   * This gives a high-fidelity virtual terminal with proper layout engine,
   * input handling, and grid-based screen capture.
   */
  render?: ReactNode;
}

// ── Credential store helper ──────────────────────────────────────────────────

export function createTestCredentialStore(token?: string): {
  path: string;
  token: string;
  cleanup: () => void;
} {
  const testToken =
    token ??
    `codeplane_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

// ── Key sequence mapping for out-of-process mode ─────────────────────────────

/**
 * Maps human-readable key names to proper terminal escape sequences.
 *
 * Used by the out-of-process (Bun.spawn) mode to convert key names
 * like "Enter", "Tab", "Escape", "ctrl+c" into the byte sequences
 * that a real terminal would send. Without this mapping, sendKeys("Enter")
 * would write the literal string "Enter" (5 bytes) instead of "\r" (1 byte).
 *
 * The in-process mode does NOT use this function — MockInput handles
 * key mapping natively via pressKey(), pressEnter(), etc.
 *
 * Sequences match the VT100/xterm standard as defined in OpenTUI's
 * KeyCodes constant (from @opentui/core/testing/mock-keys).
 */
function mapKeyToSequence(key: string): string {
  switch (key) {
    // ── Editing keys ──
    case "Enter":     return "\r";
    case "Return":    return "\r";
    case "Escape":    return "\x1b";
    case "Esc":       return "\x1b";
    case "Tab":       return "\t";
    case "shift+Tab": return "\x1b[Z";
    case "Backspace": return "\x7f";
    case "Delete":    return "\x1b[3~";

    // ── Navigation keys ──
    case "Up":        return "\x1b[A";
    case "Down":      return "\x1b[B";
    case "Right":     return "\x1b[C";
    case "Left":      return "\x1b[D";
    case "Home":      return "\x1b[H";
    case "End":       return "\x1b[F";

    // ── Named Ctrl combinations ──
    case "ctrl+a":    return "\x01";
    case "ctrl+b":    return "\x02";
    case "ctrl+c":    return "\x03";
    case "ctrl+d":    return "\x04";
    case "ctrl+e":    return "\x05";
    case "ctrl+k":    return "\x0b";
    case "ctrl+l":    return "\x0c";
    case "ctrl+n":    return "\x0e";
    case "ctrl+p":    return "\x10";
    case "ctrl+s":    return "\x13";
    case "ctrl+u":    return "\x15";
    case "ctrl+w":    return "\x17";

    // ── Function keys (VT100/xterm sequences) ──
    case "F1":        return "\x1bOP";
    case "F2":        return "\x1bOQ";
    case "F3":        return "\x1bOR";
    case "F4":        return "\x1bOS";
    case "F5":        return "\x1b[15~";
    case "F6":        return "\x1b[17~";
    case "F7":        return "\x1b[18~";
    case "F8":        return "\x1b[19~";
    case "F9":        return "\x1b[20~";
    case "F10":       return "\x1b[21~";
    case "F11":       return "\x1b[23~";
    case "F12":       return "\x1b[24~";

    default:
      // Handle ctrl+X patterns dynamically
      if (key.startsWith("ctrl+") && key.length === 6) {
        const charCode = key.charCodeAt(5) - 96; // 'a' = 1, 'b' = 2, etc.
        if (charCode >= 1 && charCode <= 26) {
          return String.fromCharCode(charCode);
        }
      }
      // Single printable characters (j, k, q, :, ?, /, G, etc.)
      // and raw escape sequences (\x03) pass through unchanged.
      return key;
  }
}

// ── launchTUI implementation ─────────────────────────────────────────────────

export async function launchTUI(
  options?: LaunchTUIOptions,
): Promise<TUITestInstance> {
  const cols = options?.cols ?? DEFAULT_COLS;
  const rows = options?.rows ?? DEFAULT_ROWS;

  // ── In-process mode ──
  if (options?.render) {
    return createInProcessInstance(options.render, cols, rows);
  }

  // ── Out-of-process mode (Bun.spawn) ──
  return createOutOfProcessInstance(cols, rows, options);
}

// ── In-process mode via @opentui/react test-utils ────────────────────────────

async function createInProcessInstance(
  node: ReactNode,
  cols: number,
  rows: number,
): Promise<TUITestInstance> {
  const testTui = await createTestTui({ node, cols, rows });
  let currentCols = cols;
  let currentRows = rows;

  return {
    get cols() {
      return currentCols;
    },
    get rows() {
      return currentRows;
    },

    async sendKeys(...keys: string[]): Promise<void> {
      for (const key of keys) {
        await testTui.sendKey(key);
      }
    },

    async sendText(text: string): Promise<void> {
      await testTui.type(text);
    },

    async waitForText(
      text: string,
      timeoutMs?: number,
    ): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        await testTui.renderOnce();
        const content = testTui.getScreenText();
        if (content.includes(text)) return;
        await sleep(50);
      }
      throw new Error(
        `waitForText: "${text}" not found within ${timeout}ms.\n` +
          `Terminal content:\n${testTui.getScreenText()}`,
      );
    },

    async waitForNoText(
      text: string,
      timeoutMs?: number,
    ): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        await testTui.renderOnce();
        const content = testTui.getScreenText();
        if (!content.includes(text)) return;
        await sleep(50);
      }
      throw new Error(
        `waitForNoText: "${text}" still present after ${timeout}ms.\n` +
          `Terminal content:\n${testTui.getScreenText()}`,
      );
    },

    snapshot(): string {
      return testTui.getScreenText({ includeAnsi: true });
    },

    getLine(lineNumber: number): string {
      const lines = testTui
        .getScreenText({ includeAnsi: true })
        .split("\n");
      if (lineNumber < 0 || lineNumber >= lines.length) {
        throw new Error(
          `getLine: line ${lineNumber} out of range (0-${lines.length - 1})`,
        );
      }
      return lines[lineNumber];
    },

    async resize(
      newCols: number,
      newRows: number,
    ): Promise<void> {
      currentCols = newCols;
      currentRows = newRows;
      await testTui.resize(newCols, newRows);
    },

    async terminate(): Promise<void> {
      await testTui.dispose();
    },
  };
}

// ── Out-of-process mode via Bun.spawn ────────────────────────────────────────

async function createOutOfProcessInstance(
  cols: number,
  rows: number,
  options?: LaunchTUIOptions,
): Promise<TUITestInstance> {
  const args = [BUN, "run", TUI_ENTRY, ...(options?.args ?? [])];

  const configDir = mkdtempSync(
    join(tmpdir(), "codeplane-tui-config-"),
  );

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERM: "xterm-256color",
    NO_COLOR: "",
    COLORTERM: "truecolor",
    LANG: "en_US.UTF-8",
    CODEPLANE_TOKEN: "e2e-test-token",
    CODEPLANE_CONFIG_DIR: configDir,
    COLUMNS: String(cols),
    LINES: String(rows),
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
      } catch {
        // stream closed
      }
    };
    readLoop();
  }

  let currentCols = cols;
  let currentRows = rows;

  const instance: TUITestInstance = {
    get cols() {
      return currentCols;
    },
    get rows() {
      return currentRows;
    },

    async sendKeys(...keys: string[]): Promise<void> {
      for (const key of keys) {
        const seq = mapKeyToSequence(key);
        if (proc.stdin) {
          proc.stdin.write(seq);
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

    async waitForText(
      text: string,
      timeoutMs?: number,
    ): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (buffer.includes(text)) return;
        await sleep(100);
      }
      throw new Error(
        `waitForText: "${text}" not found within ${timeout}ms.\nTerminal content:\n${buffer}`,
      );
    },

    async waitForNoText(
      text: string,
      timeoutMs?: number,
    ): Promise<void> {
      const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
      const startTime = Date.now();
      while (Date.now() - startTime < timeout) {
        if (!buffer.includes(text)) return;
        await sleep(100);
      }
      throw new Error(
        `waitForNoText: "${text}" still present after ${timeout}ms.\nTerminal content:\n${buffer}`,
      );
    },

    snapshot(): string {
      return buffer;
    },

    getLine(lineNumber: number): string {
      const lines = buffer.split("\n");
      if (lineNumber < 0 || lineNumber >= lines.length) {
        throw new Error(
          `getLine: line ${lineNumber} out of range (0-${lines.length - 1})`,
        );
      }
      return lines[lineNumber];
    },

    async resize(
      newCols: number,
      newRows: number,
    ): Promise<void> {
      currentCols = newCols;
      currentRows = newRows;
      // Update env for any code that re-reads process.env
      env.COLUMNS = String(newCols);
      env.LINES = String(newRows);
      proc.kill("SIGWINCH");
      await sleep(200);
    },

    async terminate(): Promise<void> {
      try {
        proc.kill();
      } catch {
        // Best-effort
      }
      try {
        rmSync(configDir, { recursive: true, force: true });
      } catch {
        // Best-effort
      }
    },
  };

  // Give process a bit of time to spin up
  await sleep(100);

  return instance;
}

// ── Subprocess helpers ───────────────────────────────────────────────────────

export async function run(
  cmd: string[],
  opts: {
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  } = {},
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
```

**Key changes from current implementation:**

| Change | Before | After | Why |
|--------|--------|-------|-----|
| Key mapping | `sendKeys("Enter")` writes literal `"Enter"` (5 chars) to stdin | `sendKeys("Enter")` writes `"\r"` via `mapKeyToSequence()` | Fixes P0 bug: non-printable keys must be escape sequences |
| Terminal dimensions | Not communicated to process | `COLUMNS` and `LINES` env vars set | Process can detect terminal size even without PTY |
| In-process mode | Not available | `render` option creates in-process instance via `createTestTui()` | High-fidelity path with proper virtual terminal buffer |
| `createTestTui` import | Dead code (imported but unused) | Used by `createInProcessInstance()` | No longer dead code |
| Config dir cleanup | References `env.CODEPLANE_CONFIG_DIR` variable | Uses dedicated `configDir` variable | Cleaner cleanup, avoids closure issues |
| `LaunchTUIOptions` | 5 fields | 6 fields (added `render?: ReactNode`) | Backward compatible — `render` is optional |

**All existing exports preserved identically:**
- `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN` (constants)
- `TUITestInstance` (interface — unchanged)
- `LaunchTUIOptions` (interface — extended with optional `render`)
- `launchTUI()` (function — same signature, backward compatible)
- `navigateToAgents()`, `waitForSessionListReady()`, `navigateToAgentChat()`, `waitForChatReady()` (agent helpers — unchanged)
- `createTestCredentialStore()` (credential helper — unchanged)
- `createMockAPIEnv()` (mock API helper — unchanged)
- `run()`, `bunEval()` (subprocess helpers — unchanged)

---

### Step 3: Validate existing test configuration (no changes needed)

**File:** `e2e/tui/bunfig.toml` — no change

```toml
[test]
timeout = 30000
preload = []
```

**File:** `apps/tui/package.json` — no change

Already has:
- `"@microsoft/tui-test": "workspace:*"` in devDependencies
- `"test:e2e": "bun test ../../e2e/tui/ --timeout 30000"` in scripts

---

### Step 4: Verify all existing test files resolve imports

After implementing the `@microsoft/tui-test` workspace package, verify import resolution for all test files and helpers:

| File | Import source | Expected state |
|------|---------------|----------------|
| `e2e/tui/helpers.ts` | `"@microsoft/tui-test"` | ✅ Resolves to `packages/tui-test/index.ts`. `createTestTui` is a real function. |
| `e2e/tui/app-shell.test.ts` | `"./helpers"` | ✅ Resolves. `launchTUI`, `createMockAPIEnv`, `TUITestInstance` exported. |
| `e2e/tui/agents.test.ts` | `"./helpers"` | ✅ Resolves. |
| `e2e/tui/agents-registry.test.ts` | `"./helpers"` | ✅ Resolves. |
| `e2e/tui/organizations.test.ts` | `"./helpers"` | ✅ Resolves. |
| `e2e/tui/workflows.test.ts` | `"./helpers.js"` | ✅ Resolves. |
| `e2e/tui/workflow-sse.test.ts` | `"./helpers.js"`, `"./helpers/workflows.js"` | ✅ Resolves. |
| `e2e/tui/workflow-utils.test.ts` | Various `apps/tui/src/` imports | ✅ No change — doesn't use `@microsoft/tui-test`. |
| `e2e/tui/workspaces.test.ts` | `"./helpers"` | ✅ Resolves. |
| `e2e/tui/workspaces-sse.test.ts` | `"./helpers"` | ✅ Resolves. |
| `e2e/tui/diff.test.ts` | `"../../apps/tui/src/lib/diff-parse"` | ✅ No change — doesn't use `@microsoft/tui-test`. |
| `e2e/tui/clipboard.test.ts` | `"../../apps/tui/src/lib/clipboard"` | ✅ No change — doesn't use `@microsoft/tui-test`. |
| `e2e/tui/keybinding-normalize.test.ts` | Various `apps/tui/src/` imports | ✅ No change — doesn't use `@microsoft/tui-test`. |
| `e2e/tui/streaming/sse-constants.test.ts` | `"../../../apps/tui/src/streaming/types"` | ✅ No change. |
| `e2e/tui/streaming/event-deduplicator.test.ts` | `"../../../apps/tui/src/streaming/EventDeduplicator"` | ✅ No change. |
| `e2e/tui/helpers/workspaces.ts` | `"../helpers.js"`, `"@codeplane/ui-core"` | ✅ Resolves. `LaunchTUIOptions` type is backward-compatible (new `render` field is optional). |
| `e2e/tui/helpers/workflows.ts` | `"../helpers.js"` | ✅ Resolves. |
| `e2e/tui/helpers/workspace-sse.ts` | `"@codeplane/ui-core/types/workspaces"` | ✅ No change. |
| `e2e/tui/helpers/__tests__/workspaces.test.ts` | `"../workspaces.js"`, `"../../helpers.js"` | ✅ Resolves. |

---

### Step 5: No modifications to existing test files

**No changes to any test file body.** The infrastructure changes are confined to:
- `packages/tui-test/` (the `@microsoft/tui-test` workspace package)
- `e2e/tui/helpers.ts` (the shared helper module)

All test files and helper files continue to work with their existing imports and test bodies.

---

## 4. File Inventory

### Modified files

| File path | Change |
|-----------|--------|
| `packages/tui-test/package.json` | Add `type: "module"`, dependencies on `@opentui/react`, `@opentui/core`, `react`. Change `main` to `index.ts`. |
| `packages/tui-test/index.d.ts` | Replace single-line stub with full type declarations for `CreateTestTuiOptions`, `TestTuiInstance`, and `createTestTui`. |
| `e2e/tui/helpers.ts` | Add `mapKeyToSequence()` for key escape sequence mapping. Add `render` option to `LaunchTUIOptions`. Add `createInProcessInstance()` for in-process mode. Add `COLUMNS`/`LINES` env vars to out-of-process mode. Import `ReactNode` type. Refactor into `createOutOfProcessInstance()`. |

### New files

| File path | Purpose |
|-----------|--------|
| `packages/tui-test/index.ts` | Real implementation wrapping `@opentui/react/test-utils`'s `testRender()` into `createTestTui()` API. |

### Deleted files

| File path | Reason |
|-----------|--------|
| `packages/tui-test/index.js` | Replaced by `index.ts` with real implementation. |

### Unchanged files (full list of all test files)

| File path | Reason |
|-----------|--------|
| `e2e/tui/app-shell.test.ts` | 875 lines, 76 tests. No modifications. |
| `e2e/tui/agents.test.ts` | No changes needed. |
| `e2e/tui/agents-registry.test.ts` | No changes needed. |
| `e2e/tui/organizations.test.ts` | No changes needed. |
| `e2e/tui/diff.test.ts` | Does not depend on `@microsoft/tui-test`. |
| `e2e/tui/clipboard.test.ts` | Does not depend on `@microsoft/tui-test`. |
| `e2e/tui/workflows.test.ts` | No changes needed. |
| `e2e/tui/workflow-sse.test.ts` | No changes needed. |
| `e2e/tui/workflow-utils.test.ts` | No changes needed. |
| `e2e/tui/workspaces.test.ts` | No changes needed. |
| `e2e/tui/workspaces-sse.test.ts` | No changes needed. |
| `e2e/tui/keybinding-normalize.test.ts` | No changes needed. |
| `e2e/tui/streaming/sse-constants.test.ts` | No changes needed. |
| `e2e/tui/streaming/event-deduplicator.test.ts` | No changes needed. |
| `e2e/tui/helpers/index.ts` | No changes needed. |
| `e2e/tui/helpers/workspaces.ts` | No changes needed. `LaunchTUIOptions` is backward-compatible. |
| `e2e/tui/helpers/workflows.ts` | No changes needed. |
| `e2e/tui/helpers/workspace-sse.ts` | No changes needed. |
| `e2e/tui/helpers/__tests__/workspaces.test.ts` | No changes needed. |
| `e2e/tui/bunfig.toml` | Already configured. |
| `apps/tui/package.json` | Already has `@microsoft/tui-test` devDependency and `test:e2e` script. |
| `apps/tui/src/**/*` | No source code changes. |

---

## 5. Dependencies

| Package | Version | Location | Type | Reason |
|---------|---------|----------|------|--------|
| `@microsoft/tui-test` | `workspace:*` | `packages/tui-test/` | workspace devDependency | Local workspace package wrapping `@opentui/react/test-utils`. |
| `@opentui/react` | `0.1.90` | dependency of `packages/tui-test/` | dependency | Provides `testRender()` from `@opentui/react/test-utils` for in-process virtual terminal testing. |
| `@opentui/core` | `0.1.90` | dependency of `packages/tui-test/` | dependency | Provides `createTestRenderer()`, `createMockKeys()`, `MockInput`, `KeyCodes` from `@opentui/core/testing`. |
| `react` | `19.2.4` | dependency of `packages/tui-test/` | dependency | Required peer for `@opentui/react`. |

### Dependency validation

1. **`@opentui/react/test-utils` confirmed.** Type declaration at `.bun-cache/@opentui/react@0.1.90@@@1/src/test-utils.d.ts` exports `testRender(node: ReactNode, testRendererOptions: TestRendererOptions)` returning `Promise<{ renderer, mockInput, mockMouse, renderOnce, captureCharFrame, captureSpans, resize }>`. Implementation at `.bun-cache/@opentui/react@0.1.90@@@1/test-utils.js` confirmed — calls `createTestRenderer()`, creates React root via `createRoot()`, renders via `act()`.

2. **`@opentui/core/testing` confirmed.** Type declarations at `.bun-cache/@opentui/core@0.1.90@@@1/testing/` export `createTestRenderer()`, `MockInput` (via `createMockKeys()`), `KeyCodes`, `TestRendererOptions`, `TestRenderer`, `MockMouse`, `ManualClock`, `MockTreeSitterClient`, `TestRecorder`.

3. **MockInput API confirmed.** Methods: `pressKeys()`, `pressKey()`, `typeText()`, `pressEnter()`, `pressEscape()`, `pressTab()`, `pressBackspace()`, `pressArrow()`, `pressCtrlC()`, `pasteBracketedText()`. All methods that accept modifiers use the interface `{ shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean; hyper?: boolean }`. `typeText()` returns `Promise<void>`. `pressKey()` is synchronous and returns `void`.

4. **No new native addons.** Both `@opentui/react` and `@opentui/core` are already in the dependency tree via `apps/tui/`. The `packages/tui-test/` workspace adds no new native code.

5. **Exact version pinning.** Rendering-critical deps pinned at exact versions matching `apps/tui/package.json` (not `^` ranges) to ensure snapshot test stability per architecture doc.

---

## 6. `launchTUI()` Architecture Details

### Dual-mode decision flow

```
launchTUI(options)
  │
  ├── options.render provided?
  │   │
  │   ├─ YES → In-process mode
  │   │   ├── createTestTui({ node, cols, rows })
  │   │   │   └── internally: testRender(node, { width, height })
  │   │   │       └── createTestRenderer() + createRoot() + act(render)
  │   │   ├── Screen buffer: captureCharFrame() (clean text) / captureSpans() (with attributes)
  │   │   ├── Key input: mockInput.pressKey() / typeText() / pressEnter() / etc.
  │   │   ├── Resize: result.resize(cols, rows) + renderOnce()
  │   │   └── Returns TUITestInstance adapter
  │   │
  │   └─ NO → Out-of-process mode
  │       ├── Bun.spawn([bun, run, index.tsx, ...args])
  │       ├── Screen buffer: raw stdout accumulation (known limitation)
  │       ├── Key input: mapKeyToSequence() → write to proc.stdin
  │       ├── Resize: SIGWINCH + COLUMNS/LINES env vars
  │       └── Returns TUITestInstance adapter
  │
  └── Both modes implement identical TUITestInstance interface
```

### Key mapping table (out-of-process mode)

| Key name | Escape sequence | Notes |
|----------|-----------------|-------|
| `Enter` / `Return` | `\r` | Carriage return (matches `KeyCodes.RETURN`) |
| `Escape` / `Esc` | `\x1b` | ESC byte (matches `KeyCodes.ESCAPE`) |
| `Tab` | `\t` | Horizontal tab (matches `KeyCodes.TAB`) |
| `shift+Tab` | `\x1b[Z` | Reverse tab (CSI Z) |
| `Backspace` | `\x7f` | DEL byte |
| `Delete` | `\x1b[3~` | CSI sequence (matches `KeyCodes.DELETE`) |
| `Up` | `\x1b[A` | Arrow up (matches `KeyCodes.ARROW_UP`) |
| `Down` | `\x1b[B` | Arrow down (matches `KeyCodes.ARROW_DOWN`) |
| `Right` | `\x1b[C` | Arrow right (matches `KeyCodes.ARROW_RIGHT`) |
| `Left` | `\x1b[D` | Arrow left (matches `KeyCodes.ARROW_LEFT`) |
| `Home` | `\x1b[H` | Home key (matches `KeyCodes.HOME`) |
| `End` | `\x1b[F` | End key (matches `KeyCodes.END`) |
| `ctrl+c` | `\x03` | ETX |
| `ctrl+d` | `\x04` | EOT |
| `ctrl+b` | `\x02` | STX (toggle sidebar) |
| `ctrl+s` | `\x13` | XOFF (form submit) |
| `ctrl+u` | `\x15` | NAK (page up) |
| `F1`-`F12` | Standard VT sequences | Match `KeyCodes.F1` through `KeyCodes.F12` |
| Single char (e.g., `j`, `k`, `q`, `:`, `?`, `/`, `G`) | The character itself | Passed through |
| Raw escape sequences (e.g., `\x03`) | Passed through | For tests that send raw sequences |

In in-process mode, key mapping is handled by `@opentui/react/test-utils`'s `MockInput` which supports all keys natively via `pressKey()`, `typeText()`, and convenience methods. The `sendKey()` method on `TestTuiInstance` dispatches to the appropriate MockInput method based on the key name.

### Test isolation guarantees

Each `launchTUI()` call creates:

1. **Fresh temp directory** for `CODEPLANE_CONFIG_DIR` (out-of-process mode only) via `mkdtempSync()` — unique per invocation
2. **Fresh process** (out-of-process) or **fresh React tree** (in-process) — no shared state
3. **Deterministic environment** — `TERM=xterm-256color`, `COLORTERM=truecolor`, `LANG=en_US.UTF-8`, `COLUMNS`, `LINES` set to known values
4. **Known auth token** — `CODEPLANE_TOKEN=e2e-test-token` unless overridden via `env`
5. **Process cleanup** — `terminate()` kills the process AND removes the temp config dir (out-of-process), or destroys the renderer (in-process)

---

## 7. Credential Store Helper Details

**File:** `e2e/tui/helpers.ts` — preserved unchanged from existing implementation.

`createTestCredentialStore()` creates a temporary JSON file matching the CLI keychain format:

```json
{
  "version": 1,
  "tokens": [
    {
      "host": "localhost",
      "token": "codeplane_test_1711234567890_abc123",
      "created_at": "2026-03-22T10:00:00.000Z"
    }
  ]
}
```

Returns `{ path, token, cleanup() }`. Usage:

```typescript
const creds = createTestCredentialStore("valid-test-token");
try {
  const tui = await launchTUI({
    env: {
      CODEPLANE_TEST_CREDENTIAL_STORE_FILE: creds.path,
      CODEPLANE_TOKEN: creds.token,
    },
  });
  await tui.waitForText("Dashboard");
  await tui.terminate();
} finally {
  creds.cleanup();
}
```

---

## 8. Mock API Server Helper Details

**File:** `e2e/tui/helpers.ts` — preserved unchanged.

`createMockAPIEnv()` returns environment variables that configure the TUI to point at a test API server:

```typescript
const env = createMockAPIEnv({
  apiBaseUrl: "http://localhost:13370",
  token: "test-token",
  disableSSE: true,
});
// Returns: { CODEPLANE_API_URL, CODEPLANE_TOKEN, CODEPLANE_DISABLE_SSE }
```

**Design rationale:** This helper does NOT start a server. It only configures the environment. Different test files need different responses, and some tests run against a real API server. A `createMockAPIServer()` function can be added in a follow-up ticket when data-dependent feature tests require it.

---

## 9. Unit & Integration Tests

### Test file: `e2e/tui/app-shell.test.ts`

The existing test file contains 76 tests across 2 top-level describe blocks and 15 nested sub-describes. All tests use `launchTUI()` from `./helpers` in out-of-process mode.

#### Describe: `TUI_LOADING_STATES` (45 tests)

| Sub-describe | Tests | IDs |
|-------------|-------|-----|
| Full-screen loading spinner | 6 | LOAD-SNAP-001 to LOAD-SNAP-006 |
| Skeleton rendering | 5 | LOAD-SNAP-010 to LOAD-SNAP-014 |
| Inline pagination loading | 3 | LOAD-SNAP-020 to LOAD-SNAP-022 |
| Action loading | 2 | LOAD-SNAP-030 to LOAD-SNAP-031 |
| Full-screen error | 4 | LOAD-SNAP-040 to LOAD-SNAP-043 |
| Optimistic UI revert | 1 | LOAD-SNAP-050 |
| No-color terminal | 2 | LOAD-SNAP-060 to LOAD-SNAP-061 |
| Loading timeout | 1 | LOAD-SNAP-070 |
| Keyboard interactions during loading | 11 | LOAD-KEY-001 to LOAD-KEY-011 |
| Responsive behavior | 8 | LOAD-RSP-001 to LOAD-RSP-008 |

#### Describe: `KeybindingProvider — Priority Dispatch` (31 tests)

| Sub-describe | Tests | IDs |
|-------------|-------|-----|
| Snapshot Tests | 4 | KEY-SNAP-001 to KEY-SNAP-004 |
| Global Keybinding Tests | 6 | KEY-KEY-001 to KEY-KEY-006 |
| Priority Layering Tests | 6 | KEY-KEY-010 to KEY-KEY-015 |
| Scope Lifecycle Tests | 2 | KEY-KEY-020 to KEY-KEY-021 |
| Status Bar Hints Tests | 2 | KEY-KEY-030 to KEY-KEY-031 |
| Integration Tests | 1 | KEY-INT-001 |
| Edge Case Tests | 3 | KEY-EDGE-001 to KEY-EDGE-003 |
| Responsive Tests | 4 | KEY-RSP-001 to KEY-RSP-004 |

### Expected test state after this ticket

**All tests in `app-shell.test.ts` will still fail** because:
- Out-of-process mode: The TUI process launches via `Bun.spawn()` without a PTY. `assertTTY()` in `index.tsx` may reject the non-TTY stdin/stdout, or the renderer may behave differently without a real terminal.
- The key mapping fix means keys are now sent correctly as escape sequences, but the process may not produce readable output without PTY terminal emulation.
- No API server is running during tests, so data-dependent screens cannot render.

Per project policy and `feedback_failing_tests.md`, these tests are **never skipped or commented out**. They remain as failing signals that track progress toward full E2E coverage.

### Infrastructure self-test files (expected to pass)

These test files validate test infrastructure and pure functions — they do NOT launch a TUI process:

| Test file | Tests | Expected state |
|-----------|-------|----------------|
| `e2e/tui/helpers/__tests__/workspaces.test.ts` | ~20 | ✅ Pass — validates fixture data, SSE events, injection files, string utilities |
| `e2e/tui/streaming/sse-constants.test.ts` | ~10 | ✅ Pass — validates SSE constants from `apps/tui/src/streaming/types` |
| `e2e/tui/streaming/event-deduplicator.test.ts` | ~10 | ✅ Pass — validates EventDeduplicator logic |
| `e2e/tui/keybinding-normalize.test.ts` | ~15 | ✅ Pass — validates key normalization functions |
| `e2e/tui/clipboard.test.ts` | ~10 | ✅ Pass — validates clipboard provider detection |
| `e2e/tui/diff.test.ts` | ~15 | ✅ Pass — validates diff parsing pure functions |

### All test files with `launchTUI()` calls (expected to fail)

| Test file | Tests | Expected state | Reason for failure |
|-----------|-------|----------------|-------------------|
| `e2e/tui/app-shell.test.ts` | 76 | ❌ Fail | No PTY; `assertTTY()` rejects non-TTY |
| `e2e/tui/agents.test.ts` | ~50 | ❌ Fail | Same |
| `e2e/tui/agents-registry.test.ts` | ~20 | ❌ Fail | Same |
| `e2e/tui/organizations.test.ts` | ~30 | ❌ Fail | Same |
| `e2e/tui/workflows.test.ts` | ~20 | ❌ Fail | Same |
| `e2e/tui/workflow-sse.test.ts` | ~15 | ❌ Fail | Same |
| `e2e/tui/workspaces.test.ts` | ~10 | ❌ Fail | Same |
| `e2e/tui/workspaces-sse.test.ts` | ~20 | ❌ Fail | Same |

---

## 10. Acceptance Criteria

| # | Criterion | Verification |
|---|-----------|-------------|
| AC-1 | `packages/tui-test/index.ts` exports a functional `createTestTui()` | `import { createTestTui } from "@microsoft/tui-test"; typeof createTestTui === "function"` |
| AC-2 | `createTestTui({ node })` returns a `TestTuiInstance` with working methods | Call with a `React.createElement("text", null, "hello")` element; `getScreenText()` returns a string containing `"hello"` |
| AC-3 | `createTestTui()` without a node throws descriptive error | Error message includes `"out-of-process mode"` and `"launchTUI()"` |
| AC-4 | `bun install` succeeds from monorepo root | Exit code 0, no resolution errors for `@microsoft/tui-test` workspace |
| AC-5 | `e2e/tui/helpers.ts` exports `launchTUI()` as a function | `typeof launchTUI === "function"` |
| AC-6 | `launchTUI({ render: node })` creates in-process TUI via testRender | Call with React element; `waitForText()` works against virtual buffer |
| AC-7 | `launchTUI()` (out-of-process) maps key names to escape sequences | `sendKeys("Enter")` sends `"\r"`, not literal `"Enter"` |
| AC-8 | `launchTUI()` (out-of-process) sets `COLUMNS`/`LINES` env vars | Process env includes `COLUMNS=120` and `LINES=40` (or custom values) |
| AC-9 | `LaunchTUIOptions` includes optional `render` field | TypeScript compiles with `{ render: React.createElement("text") }` |
| AC-10 | All existing exports from `helpers.ts` preserved | `navigateToAgents`, `waitForSessionListReady`, `navigateToAgentChat`, `waitForChatReady`, `createTestCredentialStore`, `createMockAPIEnv`, `run`, `bunEval`, `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN` all exported |
| AC-11 | All test files resolve imports without `ModuleNotFoundError` | `bun test e2e/tui/ --bail 0` — no import resolution errors |
| AC-12 | `mapKeyToSequence()` covers all TUI keybindings from design spec | Handles Enter, Escape, Tab, shift+Tab, Backspace, Delete, all arrows, Home, End, ctrl+a/b/c/d/e/k/l/n/p/s/u/w, F1-F12, single chars, raw sequences |
| AC-13 | Each `launchTUI()` call creates isolated state | Unique temp dirs per invocation via `mkdtempSync()`; no shared state between tests |
| AC-14 | No changes to any `apps/tui/src/` file | Verified by `git diff apps/tui/src/` showing no changes |
| AC-15 | No changes to any existing test body | All test files byte-identical before/after (only `helpers.ts` and `packages/tui-test/` changed) |
| AC-16 | `packages/tui-test/index.js` is deleted | File no longer exists; replaced by `index.ts` |

---

## 11. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| `@opentui/react/test-utils` API differs from type declarations at runtime | Adapter code in `createTestTui()` crashes with method-not-found | Low — types were confirmed from `.bun-cache` declarations AND implementation was read from `test-utils.js` | `TestTuiInstance` interface is the adapter layer. Internal impl can change without affecting test files. Implementation verified at `.bun-cache/@opentui/react@0.1.90@@@1/test-utils.js`. |
| `testRender()` does not support full provider stack (AuthProvider, SSEProvider, etc.) | In-process mode cannot test screens that require API data or SSE connections | Medium | In-process mode is for component-level and screen isolation tests. Full E2E tests use out-of-process mode. Both modes coexist via the same `TUITestInstance` interface. Provider composition in tests would use test-specific wrappers. |
| Out-of-process mode without PTY produces unreliable screen buffers | `getLine()` and `snapshot()` return garbled output in out-of-process mode | Known (existing, pre-existing limitation) | This is the existing behavior and a known limitation. In-process mode is the high-fidelity path. Future enhancement: PTY support via `node-pty` or Bun native PTY to fix out-of-process fidelity. |
| `captureCharFrame()` line count differs from terminal row count | `getLine(terminal.rows - 1)` may be out of bounds in in-process mode | Low | `captureCharFrame()` returns a grid-formatted string with dimensions matching the configured width/height. Line count equals configured rows. |
| `captureSpans()` span text concatenation may not include ANSI codes | `snapshot()` in in-process mode returns text without ANSI escape codes | Low-Medium | Current implementation concatenates span text without ANSI wrapping. For tests that assert ANSI codes, the span attributes (fg, bg, attributes) are available in the CapturedFrame. If ANSI codes are needed, the implementation can be enhanced to emit ANSI from span attributes. |
| `LaunchTUIOptions.render` addition breaks downstream types | `helpers/workspaces.ts` imports `LaunchTUIOptions` | None | The new `render` field is `optional` (`render?: ReactNode`). Existing code that doesn't set it continues to work identically. Verified: `WorkspaceContextOptions` in `helpers/workspaces.ts` extends `LaunchTUIOptions`. |
| Tests importing directly from `@microsoft/tui-test` break | If any test file uses `createTestTui` API directly | None — confirmed only `helpers.ts` imports from it | All test files import from `./helpers` or `./helpers/*`. Only `e2e/tui/helpers.ts` imports from `@microsoft/tui-test`. |
| `assertTTY()` in `index.tsx` rejects non-TTY stdin/stdout | Out-of-process tests fail at process startup | Known (existing) | This is the expected behavior. Tests are left failing per policy. |
| `typeText()` is async in MockInput but `sendKey()` awaits renderOnce after each call | Potential timing issues with rapid key sequences | Low | `sendKey()` awaits `renderOnce()` after each key press, ensuring the render pipeline is flushed. For `sendKeys(...keys)`, each key is processed sequentially with a render flush between them. |
| `pressKey()` is synchronous but `typeText()` is async | Inconsistent async behavior in `sendKey()` default branch | Low | For single characters, `typeText(char)` is called without await before `renderOnce()`, but since it's a single character with no delay, the key is injected synchronously before the render flush. If issues arise, the default branch can be updated to `await mockInput.typeText(key)`. |

---

## 12. Productionization Notes

### What this ticket produces

**Permanent infrastructure** — not POC code:

1. **`packages/tui-test/index.ts`** — A workspace package that wraps `@opentui/react/test-utils` into the `@microsoft/tui-test` API contract. This is the permanent test dependency for all TUI E2E tests. The wrapper pattern (`createTestTui()` → `testRender()`) provides a stable adaptation layer that isolates tests from OpenTUI's internal API evolution. Any changes to OpenTUI's test-utils API are absorbed by this single file.

2. **`e2e/tui/helpers.ts`** — The permanent test helper module consumed by all 12+ test files in `e2e/tui/`. Every export is the stable API for feature tests. The `mapKeyToSequence()` function is the canonical key mapping for out-of-process mode. The in-process mode via `render` option is the high-fidelity testing path for component and screen tests.

### What this ticket does NOT produce

- No TUI runtime changes (no modifications to `apps/tui/src/`)
- No mock API server implementation (only env configuration helper)
- No golden snapshot files (no successful TUI renders to snapshot yet)
- No feature-level tests beyond what exists
- No PTY-based out-of-process testing (future enhancement)
- No changes to test bodies

### Transition path

| What changes | When (ticket) | How |
|-------------|---------------|-----|
| Tests pass in out-of-process mode | When PTY support is added | Replace `Bun.spawn()` with PTY spawn (e.g., `node-pty` or Bun native PTY). `assertTTY()` passes, renderer uses alternate screen, screen buffer is a real 2D grid. `mapKeyToSequence()` remains correct. |
| Tests use in-process mode for component testing | First feature screen ticket | Tests pass `render: <ScreenComponent />` to `launchTUI()`. Provider stack can be composed per-test with mock data providers. |
| Golden snapshot files created | First passing render test | `toMatchSnapshot()` calls write golden files on first run. Snapshots committed to `e2e/tui/__snapshots__/`. |
| Mock API server helper added | First data-dependent feature ticket | Add `createMockAPIServer()` to `helpers.ts` or a separate `e2e/tui/helpers/mock-server.ts` that starts an HTTP server with configurable response routes. |
| SSE mock helper consolidated | SSE feature tickets | Currently 3 separate SSE helpers exist (`helpers/workspaces.ts`, `helpers/workspace-sse.ts`, `helpers/workflows.ts`). May need consolidation into a shared SSE mock infrastructure. |

### API stability contract

The `TUITestInstance` interface is the contract. All 12+ test files depend on it. The internal implementation (which library renders, how the screen buffer is captured) can change without affecting any test file:

```typescript
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
```

The `@microsoft/tui-test` package's `createTestTui()` is consumed only by `e2e/tui/helpers.ts`. If the OpenTUI test-utils API changes, there is exactly one point of adaptation in `packages/tui-test/index.ts`.

The `LaunchTUIOptions` interface is consumed by `e2e/tui/helpers/workspaces.ts` (via `WorkspaceContextOptions extends LaunchTUIOptions`). The new `render` field is optional and backward-compatible.

### Version management

The `packages/tui-test/` workspace package pins its dependencies at exact versions matching `apps/tui/package.json`:
- `@opentui/react`: `0.1.90`
- `@opentui/core`: `0.1.90`
- `react`: `19.2.4`

This ensures rendering consistency — minor version changes in OpenTUI could alter layout calculations or character rendering, breaking snapshot tests. When `apps/tui/package.json` upgrades these dependencies, `packages/tui-test/package.json` must be updated in lockstep.

---

## 13. Implementation Checklist

- [ ] Delete `packages/tui-test/index.js` (stub)
- [ ] Create `packages/tui-test/index.ts` with `createTestTui()` wrapping `@opentui/react/test-utils`
- [ ] Update `packages/tui-test/package.json`: add `type: "module"`, dependencies, change `main` to `index.ts`
- [ ] Update `packages/tui-test/index.d.ts` with full type declarations
- [ ] Run `bun install` from monorepo root; verify success
- [ ] Add `mapKeyToSequence()` to `e2e/tui/helpers.ts`
- [ ] Update `sendKeys()` in out-of-process mode to use `mapKeyToSequence()`
- [ ] Add `COLUMNS`/`LINES` env vars to out-of-process mode
- [ ] Add `render` option to `LaunchTUIOptions` interface
- [ ] Add `createInProcessInstance()` for in-process rendering mode
- [ ] Add `createOutOfProcessInstance()` refactoring existing spawn code
- [ ] Update `launchTUI()` to dispatch to in-process or out-of-process based on `render` option
- [ ] Add `import type { ReactNode } from "react"` to helpers.ts
- [ ] Change `createTestTui` import to also import `TestTuiInstance` type alias (renamed to `InternalTestTuiInstance` to avoid conflict with `TUITestInstance`)
- [ ] Verify all test files resolve imports: `bun test e2e/tui/ --bail 0` — no `ModuleNotFoundError`
- [ ] Verify `e2e/tui/helpers/__tests__/workspaces.test.ts` passes
- [ ] Verify `e2e/tui/streaming/sse-constants.test.ts` passes
- [ ] Verify `e2e/tui/streaming/event-deduplicator.test.ts` passes
- [ ] Verify `e2e/tui/clipboard.test.ts` passes
- [ ] Verify `e2e/tui/keybinding-normalize.test.ts` passes
- [ ] Verify `e2e/tui/diff.test.ts` passes (pure function tests)
- [ ] Verify NO changes to any `apps/tui/src/` file
- [ ] Verify NO changes to existing test file bodies (only `helpers.ts` and `packages/tui-test/` changed)
- [ ] Verify `packages/tui-test/index.js` is deleted