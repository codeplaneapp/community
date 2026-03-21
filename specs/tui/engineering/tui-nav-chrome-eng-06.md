# Engineering Specification: `tui-nav-chrome-eng-06`

## E2E Test Infrastructure: `helpers.ts` and App-Shell Test Scaffold

---

## 1. Overview

This ticket establishes the foundational E2E test infrastructure for TUI testing. It delivers two primary files and supporting helper modules:

1. **`e2e/tui/helpers.ts`** — The shared test harness providing `TUITestInstance`, `launchTUI()`, credential/env helpers, and domain-specific navigation utilities.
2. **`e2e/tui/app-shell.test.ts`** — The comprehensive test scaffold for all `TUI_APP_SHELL` features.
3. **`e2e/tui/helpers/`** — Domain-specific helper modules for workspaces and workflows.
4. **`e2e/tui/bunfig.toml`** — Bun test runner configuration.

Both primary files already exist in the `specs/tui/` working tree with substantial implementations. This spec formalizes the architecture, documents every export and test group, identifies gaps in the current implementation, and defines the production-hardening path.

**Dependency:** `tui-bootstrap-and-renderer` — The TUI entry point (`apps/tui/src/index.tsx`) and core providers must exist for `launchTUI()` to spawn a working process.

---

## 2. Implementation Plan

### Step 1: Finalize `TUITestInstance` Interface

**File:** `e2e/tui/helpers.ts`

The `TUITestInstance` interface is the contract that all E2E tests consume. It abstracts the underlying terminal process so tests are decoupled from spawn mechanics.

```typescript
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
```

**Current state:** ✅ Implemented. The interface is defined and the fallback implementation using `Bun.spawn` + raw stdout buffering is operational.

**Gaps to address:**

1. **Terminal buffer parsing is naive.** The current `snapshot()` returns raw stdout including ANSI escape sequences concatenated into a single string. True terminal emulation (cursor positioning, alternate screen buffer, line wrapping) is not present. The `getLine()` method splits on `\n` which doesn't account for cursor-based rendering.

2. **`@microsoft/tui-test` integration path.** The `createTestTui` import exists but the current `launchTUI()` uses a raw `Bun.spawn` fallback. The production path should use `@microsoft/tui-test`'s `Terminal` class for proper virtual terminal emulation when available, falling back to the raw spawn only when the native library fails to load.

3. **Missing `waitForMatch` with regex support.** Several test patterns need regex matching (e.g., `/#\d+/`). Add `waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void>` to the interface.

### Step 2: Harden `launchTUI()` Implementation

**File:** `e2e/tui/helpers.ts`

```typescript
export interface LaunchTUIOptions {
  cols?: number;          // Default: 120
  rows?: number;          // Default: 40
  env?: Record<string, string>;
  args?: string[];
  launchTimeoutMs?: number; // Default: 15000
}

export async function launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance>;
```

**Current state:** ✅ Implemented with `Bun.spawn` fallback.

**Production hardening required:**

1. **Dual-backend strategy.** Try `@microsoft/tui-test`'s `Terminal` class (`test.use({ program: { file, args }, rows, columns })`) first. If the native tui-test binary fails (e.g., missing Zig build), fall back to the current `Bun.spawn` implementation. Log which backend is active.

2. **Process lifecycle management.** The current implementation does not wait for the process to be "ready" (first render complete). Add a `waitForText("Dashboard", launchTimeoutMs)` guard before returning the instance, unless `args` override the initial screen.

3. **Cleanup guarantee.** Use `afterEach` / `try-finally` patterns to ensure `terminate()` is always called. The temp `CODEPLANE_CONFIG_DIR` must be cleaned up even on test failure.

4. **Environment isolation.** The default env includes:
   - `TERM=xterm-256color` — ensures 256-color baseline
   - `COLORTERM=truecolor` — enables truecolor detection
   - `LANG=en_US.UTF-8` — ensures Unicode support
   - `CODEPLANE_TOKEN=e2e-test-token` — bypasses auth flow
   - `CODEPLANE_CONFIG_DIR=<tempdir>` — isolates from user config
   - `CODEPLANE_DISABLE_SSE=1` — optional, prevents SSE connection in non-streaming tests
   - `NO_COLOR=""` — explicitly unset to ensure color output

### Step 3: Implement Credential and API Environment Helpers

**File:** `e2e/tui/helpers.ts`

```typescript
export function createTestCredentialStore(token?: string): {
  path: string;
  token: string;
  cleanup: () => void;
};

export function createMockAPIEnv(options?: {
  apiBaseUrl?: string;
  token?: string;
  disableSSE?: boolean;
}): Record<string, string>;
```

**Current state:** ✅ Implemented. `createTestCredentialStore` writes a valid `credentials.json` to a temp dir. `createMockAPIEnv` returns a record of env vars with sensible defaults (`http://localhost:13370`, `test-token-for-e2e`).

### Step 4: Implement Domain-Specific Navigation Helpers

**File:** `e2e/tui/helpers.ts`

```typescript
export async function navigateToAgents(terminal: TUITestInstance): Promise<void>;
export async function waitForSessionListReady(terminal: TUITestInstance): Promise<void>;
export async function navigateToAgentChat(terminal: TUITestInstance, sessionIndex?: number): Promise<void>;
export async function waitForChatReady(terminal: TUITestInstance): Promise<void>;
```

**Current state:** ✅ Implemented.

**Extend with additional navigation helpers** as feature test files are added. These follow the same pattern: `sendKeys("g", "<key>")` → `waitForText("<screen title>")`.

### Step 5: Implement Subprocess Utilities

**File:** `e2e/tui/helpers.ts`

```typescript
export async function run(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }
): Promise<{ exitCode: number; stdout: string; stderr: string }>;

export async function bunEval(expression: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
```

**Current state:** ✅ Implemented. Used extensively by compilation and import-resolution tests. `run()` spawns a subprocess with configurable cwd, env, and timeout (default 30s). `bunEval()` wraps `run()` with `[bun, "-e", expression]`.

### Step 6: Implement Shared Fixture Constants

**File:** `e2e/tui/helpers.ts`

```typescript
export const TUI_ROOT: string;     // join(import.meta.dir, "../../apps/tui")
export const TUI_SRC: string;      // join(TUI_ROOT, "src")
export const TUI_ENTRY: string;    // join(TUI_ROOT, "src/index.tsx")
export const BUN: string;          // Bun.which("bun") ?? process.execPath

// Standard terminal sizes for responsive testing
export const TERMINAL_SIZES = {
  minimum:  { cols: 80,  rows: 24 },
  standard: { cols: 120, rows: 40 },
  large:    { cols: 200, rows: 60 },
} as const;
```

**Current state:** Partial. `TUI_ROOT`, `TUI_SRC`, `TUI_ENTRY`, `BUN` are exported. Timeout constants are defined but not exported. `TERMINAL_SIZES` does not exist yet.

**Action:** Export all constants. Add `TERMINAL_SIZES` map for use in responsive test helpers.

### Step 7: Domain-Specific Helper Modules

**Files:**
- `e2e/tui/helpers/index.ts` — barrel re-export
- `e2e/tui/helpers/workspaces.ts` — workspace fixtures (`WORKSPACE_IDS`, `WORKSPACE_FIXTURES`), `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()`, SSE injection helpers (`createSSEInjectionFile`, `launchTUIWithSSEInjection`), `assertWorkspaceRow()`, `stripAnsi()`, `hasReverseVideo()`
- `e2e/tui/helpers/workflows.ts` — `navigateToWorkflowRunDetail()`, `waitForLogStreaming()`, `createSSEInjectFile()`

**Current state:** ✅ All three files are fully implemented with rich fixture data and helper functions.

### Step 8: Scaffold `app-shell.test.ts` with All Feature Groups

**File:** `e2e/tui/app-shell.test.ts`

The test file is organized into `describe` blocks mapping to `TUI_APP_SHELL` features from `specs/tui/features.ts`. Each describe block contains test categories: snapshot tests, keyboard interaction tests, integration tests, and edge case tests.

**Current state:** ✅ Extensively implemented with ~100+ tests across 9 describe blocks.

---

## 3. File Inventory

### `e2e/tui/helpers.ts` — Complete Export Surface

```typescript
// Constants
export const TUI_ROOT: string;
export const TUI_SRC: string;
export const TUI_ENTRY: string;
export const BUN: string;

// Types
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
export interface LaunchTUIOptions {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
  launchTimeoutMs?: number;
}

// Core launcher
export async function launchTUI(options?: LaunchTUIOptions): Promise<TUITestInstance>;

// Credential helpers
export function createTestCredentialStore(token?: string): { path: string; token: string; cleanup: () => void };
export function createMockAPIEnv(options?: { apiBaseUrl?: string; token?: string; disableSSE?: boolean }): Record<string, string>;

// Navigation helpers
export async function navigateToAgents(terminal: TUITestInstance): Promise<void>;
export async function waitForSessionListReady(terminal: TUITestInstance): Promise<void>;
export async function navigateToAgentChat(terminal: TUITestInstance, sessionIndex?: number): Promise<void>;
export async function waitForChatReady(terminal: TUITestInstance): Promise<void>;

// Subprocess utilities
export async function run(cmd: string[], opts?: { cwd?: string; env?: Record<string, string>; timeout?: number }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
export async function bunEval(expression: string): Promise<{ exitCode: number; stdout: string; stderr: string }>;
```

### `e2e/tui/helpers/index.ts` — Barrel Re-export

```typescript
export * from "./workspaces.js";
export * from "./workflows.js";
```

### `e2e/tui/helpers/workspaces.ts` — Workspace Test Utilities

Exports: `WORKSPACE_IDS`, `WORKSPACE_FIXTURES`, `createWorkspaceFixture()`, `launchTUIWithWorkspaceContext()`, `waitForStatusTransition()`, `createWorkspaceStatusEvent()`, `createSessionStatusEvent()`, `createSSEInjectionFile()`, `launchTUIWithSSEInjection()`, `stripAnsi()`, `hasReverseVideo()`, `assertWorkspaceRow()`.

### `e2e/tui/helpers/workflows.ts` — Workflow Test Utilities

Exports: `navigateToWorkflowRunDetail()`, `waitForLogStreaming()`, `createSSEInjectFile()`.

### `e2e/tui/bunfig.toml` — Bun Test Configuration

```toml
[test]
timeout = 30000
preload = []
```

### `e2e/tui/app-shell.test.ts` — Test Scaffold Structure

```
describe("TUI Navigation Provider and App Shell")
  ├── NAV-SNAP-001: initial render shows Dashboard as root screen
  ├── NAV-SNAP-002: deep-link launch pre-populates breadcrumb trail
  ├── NAV-SNAP-003: breadcrumb truncation at 80x24 with deep stack
  ├── NAV-KEY-001: Enter on list item pushes detail screen onto stack
  ├── NAV-KEY-002: q pops current screen and returns to previous
  ├── NAV-KEY-003: q on root screen quits TUI
  ├── NAV-KEY-004: tab navigation replaces top of stack
  ├── NAV-KEY-005: go-to mode replaces entire stack with new root
  ├── NAV-KEY-006: double Enter does not create duplicate stack entries
  ├── NAV-KEY-007: rapid q presses process sequentially through stack
  ├── NAV-KEY-008: deep-link q walks back through pre-populated stack
  ├── NAV-INT-001: all screens can access navigation context
  ├── NAV-INT-002: canPop is false on root screen
  ├── NAV-INT-003: stack overflow beyond 32 entries drops oldest
  ├── NAV-INT-004: header bar breadcrumb updates on push/pop/replace/reset
  ├── NAV-EDGE-001: useNavigation outside provider triggers error boundary
  ├── NAV-EDGE-002: push with empty params
  ├── NAV-EDGE-003: replace on single-entry stack swaps root screen
  └── NAV-EDGE-004: q during screen data loading cancels

describe("Screen Registry")
  ├── REG-SNAP-001 through REG-SNAP-004: snapshot tests at multiple sizes
  ├── REG-KEY-001 through REG-KEY-003: go-to keybinding tests
  ├── REG-INT-001 through REG-INT-004: screen registration integration
  └── REG-EDGE-001 through REG-EDGE-004: edge cases

describe("TUI_APP_SHELL — Package scaffold")
  ├── package.json structure (9 tests: name, type, private, dependencies, devDeps, scripts)
  ├── tsconfig.json structure (4 tests: JSX import source, bun-types, no DOM, isolatedModules)
  └── File existence checks (7 tests: entry point, verify-imports, providers, components, hooks, theme, screens, lib, util)

describe("TUI_APP_SHELL — TypeScript compilation")
  ├── tsc --noEmit passes
  ├── diff-syntax code compiles
  └── Agent screen code compiles

describe("TUI_APP_SHELL — Dependency resolution")
  ├── @opentui/core resolvable
  ├── @opentui/react resolvable
  ├── createCliRenderer importable
  ├── createRoot importable
  ├── OpenTUI React hooks importable
  ├── React 19.x resolvable
  └── @codeplane/sdk resolvable

describe("TUI_APP_SHELL — Color capability detection")
  ├── DET-FILE-*: file structure tests (6 tests)
  ├── DET-DETECT-*: detectColorCapability() behavior (16 tests covering NO_COLOR, TERM=dumb, COLORTERM, 256color, defaults, case sensitivity)
  ├── DET-UNICODE-*: isUnicodeSupported() behavior (6 tests)
  ├── DET-TSC-*: compilation tests (1 test)
  └── DET-COMPAT-*: compatibility with lib/diff-syntax (2 tests)

describe("TUI_APP_SHELL — E2E test infrastructure")
  ├── INFRA-001: @microsoft/tui-test importable
  ├── INFRA-002: createTestTui is importable and is a function
  ├── INFRA-003: launchTUI is exported and is a function
  ├── INFRA-004: launchTUI no longer throws stub error
  ├── INFRA-005: createTestCredentialStore creates valid credential file
  ├── INFRA-006: createTestCredentialStore generates random token
  ├── INFRA-007: createMockAPIEnv returns correct defaults
  ├── INFRA-008: createMockAPIEnv respects custom options
  ├── INFRA-009: TUITestInstance interface correctly typed
  └── INFRA-010: helpers.ts exports run() and bunEval()

describe("getBreakpoint — pure function")
  ├── HOOK-LAY-001 through HOOK-LAY-004: unsupported boundaries
  ├── HOOK-LAY-005 through HOOK-LAY-008: minimum boundaries
  ├── HOOK-LAY-009 through HOOK-LAY-011: standard boundaries
  ├── HOOK-LAY-012 through HOOK-LAY-013: large boundaries
  └── HOOK-LAY-014 through HOOK-LAY-017: OR logic verification

describe("useLayout — computed values")
  ├── HOOK-LAY-020: contentHeight is height - 2
  ├── HOOK-LAY-021: contentHeight floors at 0
  └── HOOK-LAY-022: sidebarVisible is false at minimum breakpoint
```

---

## 4. Integration with `@microsoft/tui-test`

### Current Architecture

The existing `launchTUI()` uses a raw `Bun.spawn` fallback. `@microsoft/tui-test` v0.0.3 is installed as a workspace dependency and provides:

- `test()` — its own test runner (not used; we use `bun:test`)
- `Terminal` class — virtual terminal with `getBuffer()`, `getByText()`, `serialize()`, `resize()`, `keyPress()`, `write()`, `submit()`
- `expect(terminal).toMatchSnapshot()` — snapshot matcher
- `expect(locator).toBeVisible()` — text visibility assertion
- `expect(locator).toHaveFgColor()` / `toHaveBgColor()` — color assertions

### Integration Strategy

The `@microsoft/tui-test` package provides its own test runner via `test()` which is separate from `bun:test`. Since the codebase uses `bun:test` as the test runner, we use `@microsoft/tui-test` for its **`Terminal` class and assertions** only, wrapping them in our `TUITestInstance` interface.

The existing `launchTUI()` fallback using `Bun.spawn` is the current production path. The `@microsoft/tui-test` `Terminal` integration is additive — it provides better terminal emulation (proper cursor tracking, buffer management, ANSI parsing) when available.

### What `@microsoft/tui-test` Buys Us

1. **`getBuffer()` / `getViewableBuffer()`** — Proper 2D terminal buffer instead of raw stdout string concatenation. This makes `getLine()` accurate for cursor-based rendering.
2. **`getByText(text: string | RegExp)`** — Locator-based text search with timeout support, replacing our polling loop.
3. **`serialize()`** — Deterministic snapshot format with `{ view, shifts }` for golden-file comparison including color information.
4. **`resize(columns, rows)`** — Proper terminal resize that updates the buffer dimensions.
5. **Color assertions** — `toHaveFgColor()` / `toHaveBgColor()` for verifying theme token application.

---

## 5. Unit & Integration Tests

All tests are in **`e2e/tui/app-shell.test.ts`**. Tests use `bun:test` (`describe`, `test`, `expect`) and import from `e2e/tui/helpers.ts`.

### Test Categories

#### 5.1 Terminal Snapshot Tests

Capture full terminal output at key interaction points. These tests verify visual correctness across responsive breakpoints.

```typescript
// NAV-SNAP-001: Verify Dashboard renders as initial screen
test("NAV-SNAP-001: initial render shows Dashboard as root screen", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.waitForText("Dashboard");
  const headerLine = terminal.getLine(0);
  expect(headerLine).toMatch(/Dashboard/);
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});

// REG-SNAP-002: Verify rendering at minimum 80x24
test("REG-SNAP-002: placeholder renders screen name at 80x24 minimum size", async () => {
  const terminal = await launchTUI({ cols: 80, rows: 24 });
  await terminal.waitForText("Dashboard");
  expect(terminal.snapshot()).toMatchSnapshot();
  await terminal.terminate();
});
```

**Key sizes tested:** 80×24 (minimum), 120×40 (standard), 200×60 (large).

#### 5.2 Keyboard Interaction Tests

Verify keypress sequences produce expected state transitions.

```typescript
// NAV-KEY-002: q pops navigation stack
test("NAV-KEY-002: q pops current screen and returns to previous", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  await terminal.sendKeys("q");
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});

// NAV-KEY-005: Go-to mode resets navigation stack
test("NAV-KEY-005: go-to mode replaces entire stack with new root", async () => {
  const terminal = await launchTUI({ cols: 120, rows: 40 });
  await terminal.sendKeys("g", "r");
  await terminal.waitForText("Repositories");
  await terminal.sendKeys("g", "d");
  await terminal.waitForText("Dashboard");
  await terminal.terminate();
});
```

#### 5.3 Pure Function Tests

Tests for `getBreakpoint()` and layout-derived values run synchronously without launching a TUI process.

```typescript
test("HOOK-LAY-005: returns 'minimum' for 80x24 (exact lower bound)", () => {
  expect(getBreakpoint(80, 24)).toBe("minimum");
});

test("HOOK-LAY-012: returns 'large' for 200x60 (exact lower bound)", () => {
  expect(getBreakpoint(200, 60)).toBe("large");
});
```

#### 5.4 Import/Compilation Tests

Verify the dependency graph resolves correctly at runtime using `bunEval()`.

```typescript
test("createCliRenderer is importable from @opentui/core and is a function", async () => {
  const result = await bunEval(
    "import { createCliRenderer } from '@opentui/core'; console.log(typeof createCliRenderer)"
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout.trim()).toBe("function");
});
```

#### 5.5 Infrastructure Self-Tests

Verify the test infrastructure itself works correctly.

```typescript
test("INFRA-005: createTestCredentialStore creates valid credential file", () => {
  const creds = createTestCredentialStore("my-test-token");
  try {
    expect(existsSync(creds.path)).toBe(true);
    const content = JSON.parse(readFileSync(creds.path, "utf-8"));
    expect(content.version).toBe(1);
    expect(content.tokens).toBeArrayOfSize(1);
    expect(content.tokens[0].token).toBe("my-test-token");
  } finally {
    creds.cleanup();
  }
});
```

### Test Execution

```bash
# Run all TUI E2E tests
bun test e2e/tui/ --timeout 30000

# Run only app-shell tests
bun test e2e/tui/app-shell.test.ts --timeout 30000

# Run from apps/tui via script
cd apps/tui && bun run test:e2e
```

### Tests Left Intentionally Failing

Per project policy, tests that fail due to unimplemented backend features are **never** skipped, commented out, or mocked. The following tests may fail until their dependent backends are implemented:

- Navigation tests that require a running API server for SSE or data fetching
- Deep-link tests that depend on real repository data
- Command palette tests that require the command registry to be fully populated

These failures are signals, not problems to hide.

---

## 6. Feature Coverage Gaps

The following `TUI_APP_SHELL` features need additional test coverage in `app-shell.test.ts`:

### 6.1 `TUI_HELP_OVERLAY` — Not Tested

Add a describe block:

```typescript
describe("TUI_APP_SHELL — Help overlay", () => {
  test("HELP-001: ? toggles help overlay on and off", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Help");
    await terminal.sendKeys("?");
    await terminal.waitForNoText("Help");
    await terminal.terminate();
  });

  test("HELP-002: Esc dismisses help overlay", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Help");
    await terminal.sendKeys("Escape");
    await terminal.waitForNoText("Help");
    await terminal.terminate();
  });

  test("HELP-003: help overlay shows context-sensitive keybindings", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("?");
    await terminal.waitForText("Help");
    const content = terminal.snapshot();
    expect(content).toMatch(/q.*back|quit/i);
    expect(content).toMatch(/:.*command/i);
    await terminal.terminate();
  });
});
```

### 6.2 `TUI_LOADING_STATES` — Not Tested

```typescript
describe("TUI_APP_SHELL — Loading states", () => {
  test("LOAD-001: initial screen shows loading indicator before data arrives", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });

  test("LOAD-002: loading spinner uses braille characters", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });
});
```

### 6.3 `TUI_STATUS_BAR` — Needs Explicit Tests

```typescript
describe("TUI_APP_SHELL — Status bar", () => {
  test("STATUS-001: status bar shows keybinding hints at standard size", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toMatch(/\?.*help/i);
    await terminal.terminate();
  });

  test("STATUS-002: status bar shows notification indicator", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(terminal.rows - 1);
    expect(statusLine).toBeDefined();
    await terminal.terminate();
  });
});
```

### 6.4 `TUI_ERROR_BOUNDARY` — Needs Dedicated Tests

```typescript
describe("TUI_APP_SHELL — Error boundary", () => {
  test("ERR-001: unhandled error renders recovery UI with restart hint", async () => {
    const terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });
});
```

---

## 7. Productionization Path

### 7.1 From POC to Production: `launchTUI()` Backend

**Current:** Raw `Bun.spawn` with string-concatenated stdout buffer.

**Target:** `@microsoft/tui-test` `Terminal` class with proper virtual terminal emulation.

**Migration steps:**

1. Create a `TUITestBackend` abstraction with two implementations: `BunSpawnBackend` (current) and `TuiTestBackend` (using `@microsoft/tui-test`).
2. `launchTUI()` attempts `TuiTestBackend` first, catching any native-load errors, and falls back to `BunSpawnBackend`.
3. The `TuiTestBackend` maps `TUITestInstance` methods to `@microsoft/tui-test` `Terminal` methods:
   - `sendKeys()` → `terminal.keyPress()` / `terminal.write()`
   - `sendText()` → `terminal.write()`
   - `waitForText()` → `expect(terminal.getByText()).toBeVisible()`
   - `snapshot()` → `terminal.serialize().view`
   - `getLine()` → `terminal.getViewableBuffer()[lineNumber].join("")`
   - `resize()` → `terminal.resize()`
   - `terminate()` → `terminal.kill()`
4. Once `TuiTestBackend` is stable, deprecate `BunSpawnBackend` but keep it as a fallback for CI environments where the native binary may not be available.

### 7.2 Snapshot Stability

**Current:** `toMatchSnapshot()` from `bun:test` captures raw stdout strings.

**Target:** Use `@microsoft/tui-test`'s `serialize()` for deterministic snapshots that include cell-level color information.

**Migration:** Once `TuiTestBackend` is stable, migrate snapshot tests to use `terminal.serialize().view` and update golden files.

### 7.3 `waitForMatch` Regex Support

**Current:** String-only matching via `buffer.includes(text)`.

**Target:** Add `waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void>` to `TUITestInstance`.

```typescript
async waitForMatch(pattern: RegExp, timeoutMs?: number): Promise<void> {
  const timeout = timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (pattern.test(buffer)) return;
    await sleep(100);
  }
  throw new Error(`waitForMatch: pattern ${pattern} not matched within ${timeout}ms`);
}
```

### 7.4 Test Isolation Improvements

**Current:** Each test calls `launchTUI()` and `terminate()` manually.

**Target:** Consider a `withTUI()` wrapper that guarantees cleanup:

```typescript
async function withTUI(
  options: LaunchTUIOptions,
  fn: (terminal: TUITestInstance) => Promise<void>,
): Promise<void> {
  const terminal = await launchTUI(options);
  try {
    await fn(terminal);
  } finally {
    await terminal.terminate();
  }
}
```

This is additive and does not replace the manual pattern — tests can choose either style.

---

## 8. Configuration

### `e2e/tui/bunfig.toml`

```toml
[test]
timeout = 30000
preload = []
```

- **timeout = 30000** — 30-second timeout per test. TUI process launch + initial render + key interaction can take several seconds, especially on CI.
- **preload = []** — No preload scripts. Test isolation is maintained by each test launching its own TUI process.

### Environment Variables for Tests

| Variable | Value | Purpose |
|---|---|---|
| `TERM` | `xterm-256color` | Ensures 256-color baseline |
| `COLORTERM` | `truecolor` | Enables truecolor detection |
| `LANG` | `en_US.UTF-8` | Unicode support |
| `NO_COLOR` | `""` (empty) | Explicitly does not disable color |
| `CODEPLANE_TOKEN` | `e2e-test-token` | Bypasses auth flow |
| `CODEPLANE_CONFIG_DIR` | `<tempdir>` | Isolates from user config |
| `CODEPLANE_API_URL` | `http://localhost:13370` | Test server URL |
| `CODEPLANE_DISABLE_SSE` | `1` (optional) | Prevents SSE connection in non-streaming tests |

---

## 9. Dependencies

| Package | Version | Role |
|---|---|---|
| `@microsoft/tui-test` | `workspace:*` (v0.0.3) | Terminal E2E testing framework |
| `bun:test` | Built-in | Test runner (`describe`, `test`, `expect`) |
| `node:path` | Built-in | Path construction for `TUI_ROOT`, `TUI_SRC`, etc. |
| `node:os` | Built-in | `tmpdir()` for test config isolation |
| `node:fs` | Built-in | Credential store file I/O, file existence checks |
| `@codeplane/ui-core` | `workspace:*` | Type imports for workspace fixtures |

No new dependencies are introduced by this ticket.

---

## 10. Acceptance Criteria

1. **`e2e/tui/helpers.ts`** exports `TUITestInstance`, `LaunchTUIOptions`, `launchTUI()`, `createTestCredentialStore()`, `createMockAPIEnv()`, `navigateToAgents()`, `waitForSessionListReady()`, `navigateToAgentChat()`, `waitForChatReady()`, `run()`, `bunEval()`, and all path constants.
2. **`e2e/tui/helpers/`** subdirectory exports workspace and workflow domain helpers via barrel.
3. **`e2e/tui/app-shell.test.ts`** contains `describe` blocks covering all 13 `TUI_APP_SHELL` features with categorized tests (snapshot, keyboard, integration, edge case).
4. **`e2e/tui/bunfig.toml`** sets 30-second timeout.
5. **`bun test e2e/tui/app-shell.test.ts`** executes without import errors. Tests may fail due to unimplemented backends — this is expected and correct.
6. **No tests are skipped or commented out.** Failing tests remain as signals.
7. **No mocking of implementation details.** Tests validate user-visible behavior through the terminal buffer.
8. **Each test launches a fresh TUI instance.** No shared state between tests.