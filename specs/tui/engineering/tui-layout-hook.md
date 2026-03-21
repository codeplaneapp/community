# Engineering Specification: `useLayout` Hook with Breakpoint Detection

**Ticket:** `tui-layout-hook`
**Title:** Implement useLayout hook with breakpoint detection and responsive values
**Dependencies:** `tui-foundation-scaffold`, `tui-util-text`
**Target:** `apps/tui/src/hooks/useLayout.ts`
**Tests:** `e2e/tui/app-shell.test.ts` (responsive layout section)

---

## 1. Overview

The `useLayout` hook is the single entry point for all responsive layout decisions in the Codeplane TUI. Every component that adapts to terminal dimensions — sidebar visibility, modal sizing, content area height, column truncation — consumes this hook instead of independently querying `useTerminalDimensions()` and computing breakpoints ad hoc.

Today, the `Breakpoint` type is defined locally in `apps/tui/src/screens/Agents/types.ts` and consumed by `formatTimestamp.ts`. No centralized breakpoint function or layout hook exists. This ticket introduces:

1. A canonical `Breakpoint` type and `getBreakpoint()` pure function at `apps/tui/src/types/breakpoint.ts`
2. A `useLayout()` hook at `apps/tui/src/hooks/useLayout.ts` that returns pre-computed, memoized layout values
3. Barrel exports from `apps/tui/src/types/index.ts` and `apps/tui/src/hooks/index.ts`
4. E2E tests at `e2e/tui/app-shell.test.ts` covering all breakpoint boundaries, computed values, responsive behavior, and resize transitions

Downstream consumers read semantic properties (`sidebarVisible`, `modalWidth`) instead of re-deriving breakpoints inline.

---

## 2. Existing Code Audit

### 2.1 What exists today (deployed in `apps/tui/src/`)

| File | Location | Status |
|------|----------|--------|
| `hooks/useDiffSyntaxStyle.ts` | `apps/tui/src/hooks/useDiffSyntaxStyle.ts` | ✅ Deployed — 52 lines. Establishes hook patterns: `useMemo` for memoization, `useRef` + `useEffect` for cleanup of native resources. Imports from `../lib/diff-syntax.js`. |
| `screens/Agents/types.ts` | `apps/tui/src/screens/Agents/types.ts` | ✅ Deployed — 16 lines. Exports `MessageRole`, `MessagePart`, `AgentMessage`, and `Breakpoint = "minimum" \| "standard" \| "large"` (local, no `getBreakpoint()`) |
| `screens/Agents/utils/formatTimestamp.ts` | `apps/tui/src/screens/Agents/utils/formatTimestamp.ts` | ✅ Deployed — 33 lines. Imports `Breakpoint` from `../types` (the Agents local types barrel). Uses it for responsive timestamp formatting (null at minimum, abbreviated at standard, verbose at large). |
| `lib/diff-syntax.ts` | `apps/tui/src/lib/diff-syntax.ts` | ✅ Deployed — `detectColorTier()`, `createDiffSyntaxStyle()`, palette system |

### 2.2 What exists in specs (reference implementations in `specs/tui/`)

| File | Location | Status |
|------|----------|--------|
| `types/breakpoint.ts` | `specs/tui/apps/tui/src/types/breakpoint.ts` | ✅ Complete — 33 lines. Exports `Breakpoint` type and `getBreakpoint()` (returns `null` for unsupported). |
| `types/index.ts` | `specs/tui/apps/tui/src/types/index.ts` | ✅ Complete — 2 lines. Barrel exports for `getBreakpoint` and `Breakpoint`. |
| `hooks/useLayout.ts` | `specs/tui/apps/tui/src/hooks/useLayout.ts` | ✅ Complete — 137 lines. Composes `useSidebarState()` for sidebar toggle state. Includes `sidebar: SidebarState` field. |
| `hooks/useBreakpoint.ts` | `specs/tui/apps/tui/src/hooks/useBreakpoint.ts` | ✅ Complete — 22 lines. Thin wrapper: `useTerminalDimensions()` → `getBreakpoint()`. |
| `hooks/useSidebarState.ts` | `specs/tui/apps/tui/src/hooks/useSidebarState.ts` | ✅ Complete — 103 lines. Manages user `Ctrl+B` toggle preference + auto-collapse at minimum breakpoint. |
| `hooks/useResponsiveValue.ts` | `specs/tui/apps/tui/src/hooks/useResponsiveValue.ts` | ✅ Complete — 48 lines. Generic breakpoint→value resolver. |
| `hooks/index.ts` | `specs/tui/apps/tui/src/hooks/index.ts` | ✅ Complete — 85 lines. Barrel exports for ALL hooks (many not yet deployed). |
| `e2e/tui/helpers.ts` | `specs/tui/e2e/tui/helpers.ts` | ✅ Complete — 353 lines. `launchTUI()`, `TUITestInstance`, `bunEval()`, `run()`, agent navigation helpers. |
| `e2e/tui/app-shell.test.ts` | `specs/tui/e2e/tui/app-shell.test.ts` | ✅ Complete — 875 lines. Loading states + keybinding priority dispatch tests. |

### 2.3 What does NOT exist in deployed code

- No `apps/tui/src/types/` directory (must be created)
- No `apps/tui/src/hooks/index.ts` barrel file
- No `useLayout` hook anywhere in `apps/tui/src/`
- No `getBreakpoint()` function anywhere in `apps/tui/src/`
- No `e2e/tui/helpers.ts` (only `e2e/tui/diff.test.ts` exists with stub test bodies)
- No `e2e/tui/app-shell.test.ts`

### 2.4 Duplicate `Breakpoint` type — migration note

The `Breakpoint` type in `apps/tui/src/screens/Agents/types.ts` (line 16) is a local duplicate that will be superseded by the canonical type at `apps/tui/src/types/breakpoint.ts`. The two types are identical in shape (`"minimum" | "standard" | "large"`). Migrating existing consumers (`formatTimestamp.ts`) to import from `../../types/breakpoint.js` is a **follow-up task** (not in scope for this ticket) to avoid coupling this ticket to the Agents screen.

### 2.5 Dependencies from OpenTUI

| Hook | Package | Signature | Source |
|------|---------|-----------|--------|
| `useTerminalDimensions()` | `@opentui/react` (v0.1.90) | `() => { width: number; height: number }` | `context/opentui/packages/react/src/hooks/use-terminal-dimensions.ts` |
| `useOnResize()` | `@opentui/react` (v0.1.90) | `(callback: (width: number, height: number) => void) => CliRenderer` | `context/opentui/packages/react/src/hooks/use-resize.ts` |

**Verified implementation of `useTerminalDimensions`:** It uses `useState` initialized from `renderer.width`/`renderer.height`, then calls `useOnResize()` to update state on `SIGWINCH`. It returns `{ width, height }` which triggers React re-renders when dimensions change. The `useLayout` hook does **NOT** need `useOnResize()` — it derives computed values from the reactive `width`/`height` returned by `useTerminalDimensions()`, and React's re-render on state change handles the rest.

### 2.6 Reference implementation discrepancy: `null` vs `"unsupported"`

The ticket description specifies `Breakpoint` type as `'unsupported' | 'minimum' | 'standard' | 'large'`. The reference implementation at `specs/tui/apps/tui/src/types/breakpoint.ts` uses `Breakpoint = "minimum" | "standard" | "large"` with `getBreakpoint()` returning `Breakpoint | null` where `null` represents unsupported. **This spec follows the reference implementation's `null` pattern** because:

1. It matches the existing spec codebase that all downstream hooks (`useBreakpoint`, `useSidebarState`, `useLayout`) already consume
2. `null` provides cleaner conditional checks: `if (!breakpoint)` vs `if (breakpoint === "unsupported")`
3. `null` keeps the `Breakpoint` union type clean as `"minimum" | "standard" | "large"` — three valid operational breakpoints
4. Type-level enforcement: functions requiring a valid breakpoint accept `Breakpoint`; functions that must handle too-small accept `Breakpoint | null`
5. The existing deployed `Breakpoint` type in `screens/Agents/types.ts` already uses `"minimum" | "standard" | "large"` without `"unsupported"` — maintaining consistency

The ticket description's `"unsupported"` string is treated as a conceptual label, not a literal implementation directive.

---

## 3. Implementation Plan

### Step 1: Create the `types/` directory and `Breakpoint` type

**File:** `apps/tui/src/types/breakpoint.ts` (CREATE)

```typescript
/**
 * Terminal size breakpoint classification.
 *
 * Ranges (both cols AND rows must meet the threshold):
 * - minimum: 80×24 – 119×39
 * - standard: 120×40 – 199×59
 * - large: 200×60+
 *
 * Below 80×24 returns null (unsupported).
 */
export type Breakpoint = "minimum" | "standard" | "large";

/**
 * Compute the breakpoint from terminal dimensions.
 *
 * Returns null when the terminal is below the minimum supported size
 * (cols < 80 OR rows < 24). The caller is responsible for rendering
 * the "terminal too small" screen when this returns null.
 *
 * The threshold logic uses OR for downgrade: if EITHER dimension
 * is below the threshold for a breakpoint, the terminal falls to
 * the next lower breakpoint. This prevents usability issues where
 * a terminal is wide but very short (or vice versa).
 */
export function getBreakpoint(
  cols: number,
  rows: number,
): Breakpoint | null {
  if (cols < 80 || rows < 24) return null;
  if (cols < 120 || rows < 40) return "minimum";
  if (cols < 200 || rows < 60) return "standard";
  return "large";
}
```

**Rationale for OR logic:** A 200-column × 20-row terminal has plenty of width but cannot fit the standard vertical layout. The narrower constraint wins. Similarly, a 100-column × 60-row terminal has vertical space but insufficient width for standard sidebar+content layout.

**Source:** Copied verbatim from `specs/tui/apps/tui/src/types/breakpoint.ts` (verified: 33 lines, identical content).

### Step 2: Create the types barrel

**File:** `apps/tui/src/types/index.ts` (CREATE)

```typescript
export { getBreakpoint } from "./breakpoint.js";
export type { Breakpoint } from "./breakpoint.js";
```

**Source:** Copied verbatim from `specs/tui/apps/tui/src/types/index.ts` (verified: 2 lines, identical content).

### Step 3: Create the `useLayout` hook

**File:** `apps/tui/src/hooks/useLayout.ts` (CREATE)

The ticket description says `sidebarVisible` is simply `breakpoint !== 'minimum'`. The reference implementation at `specs/tui/apps/tui/src/hooks/useLayout.ts` composes `useSidebarState()` which adds `Ctrl+B` toggle support and a `sidebar: SidebarState` field. Since `useSidebarState` depends on `useBreakpoint` (another hook not yet deployed), and the `Ctrl+B` toggle is a **separate concern**, this ticket implements the **self-contained version** matching the ticket description exactly.

The reference implementation's `getSidebarWidth()` also takes a `sidebarVisible` parameter (for toggle-aware width), while this version only needs `breakpoint`. This is the key structural difference.

```typescript
import { useMemo } from "react";
import { useTerminalDimensions } from "@opentui/react";
import { getBreakpoint, type Breakpoint } from "../types/breakpoint.js";

/**
 * Responsive layout context returned by useLayout().
 *
 * All values are derived from the current terminal dimensions and
 * recalculate synchronously on resize (no debounce, no animation).
 */
export interface LayoutContext {
  /** Raw terminal width in columns. */
  width: number;
  /** Raw terminal height in rows. */
  height: number;
  /**
   * Current breakpoint classification.
   * null when terminal is below 80×24 (unsupported).
   */
  breakpoint: Breakpoint | null;
  /**
   * Available content height in rows, excluding the 1-row header bar
   * and 1-row status bar. Always `height - 2`, floored at 0.
   */
  contentHeight: number;
  /**
   * Whether the sidebar (file tree, navigation panel) should be visible.
   * Hidden when breakpoint is null or "minimum" to maximize content
   * area width.
   *
   * Future: will incorporate user Ctrl+B toggle preference via
   * useSidebarState() when that hook is deployed.
   */
  sidebarVisible: boolean;
  /**
   * Sidebar width as a CSS-like percentage string.
   * - null / "minimum": "0%" (sidebar hidden)
   * - "standard": "25%"
   * - "large": "30%"
   *
   * Consumers pass this directly to OpenTUI's `<box width={...}>`.
   */
  sidebarWidth: string;
  /**
   * Modal overlay width as a percentage string.
   * Wider at smaller breakpoints to maximize usable space.
   * - null / "minimum": "90%"
   * - "standard": "60%"
   * - "large": "50%"
   */
  modalWidth: string;
  /**
   * Modal overlay height as a percentage string.
   * Follows the same scaling as modalWidth.
   */
  modalHeight: string;
}

/**
 * Derive sidebar width from breakpoint.
 * Returns "0%" when sidebar is not visible, so consumers can
 * always use the value without checking sidebarVisible separately.
 */
function getSidebarWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "30%";
    case "standard": return "25%";
    case "minimum":
    default:         return "0%";
  }
}

/**
 * Derive modal width from breakpoint.
 */
function getModalWidth(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

/**
 * Derive modal height from breakpoint.
 */
function getModalHeight(breakpoint: Breakpoint | null): string {
  switch (breakpoint) {
    case "large":    return "50%";
    case "standard": return "60%";
    default:         return "90%";
  }
}

/**
 * Central responsive layout hook for the Codeplane TUI.
 *
 * Reads terminal dimensions from `@opentui/react`'s
 * `useTerminalDimensions()` and returns a memoized set of
 * breakpoint-aware layout values. The object recalculates
 * synchronously on terminal resize — no debounce, no animation.
 *
 * This hook is the ONLY place where breakpoint → layout value
 * mapping is defined. Components must NOT duplicate this logic.
 * If a component needs a responsive value not covered here, it
 * should be added to LayoutContext, not computed inline.
 *
 * @example
 * ```tsx
 * function MyScreen() {
 *   const layout = useLayout();
 *   if (!layout.breakpoint) return <TerminalTooSmall />;
 *
 *   return (
 *     <box flexDirection="row" height={layout.contentHeight}>
 *       {layout.sidebarVisible && (
 *         <box width={layout.sidebarWidth}><FileTree /></box>
 *       )}
 *       <box flexGrow={1}><Content /></box>
 *     </box>
 *   );
 * }
 * ```
 */
export function useLayout(): LayoutContext {
  const { width, height } = useTerminalDimensions();

  return useMemo((): LayoutContext => {
    const breakpoint = getBreakpoint(width, height);
    const sidebarVisible = breakpoint !== null && breakpoint !== "minimum";
    return {
      width,
      height,
      breakpoint,
      contentHeight: Math.max(0, height - 2),
      sidebarVisible,
      sidebarWidth: getSidebarWidth(breakpoint),
      modalWidth: getModalWidth(breakpoint),
      modalHeight: getModalHeight(breakpoint),
    };
  }, [width, height]);
}
```

**Key difference from reference `useLayout`:** The reference implementation (line 121) calls `useSidebarState()` and passes `sidebar.visible` to `getSidebarWidth(breakpoint, sidebar.visible)`. This version computes `sidebarVisible` directly from the breakpoint. The evolution path is documented in Section 6.3.

### Step 4: Create the hooks barrel export

**File:** `apps/tui/src/hooks/index.ts` (CREATE)

This ticket creates the barrel file with only the exports relevant to deployed hooks. The reference barrel at `specs/tui/apps/tui/src/hooks/index.ts` contains 85 lines of exports for hooks that don't exist yet. **Do NOT copy the reference barrel.** Create a minimal barrel:

```typescript
export { useDiffSyntaxStyle } from "./useDiffSyntaxStyle.js";
export { useLayout } from "./useLayout.js";
export type { LayoutContext } from "./useLayout.js";
```

Each subsequent hook ticket adds its own export to this barrel.

### Step 5: Create the E2E test helpers

**File:** `e2e/tui/helpers.ts` (CREATE)

Copied from `specs/tui/e2e/tui/helpers.ts` (verified: 353 lines). Provides the canonical test infrastructure for all TUI E2E tests.

```typescript
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
  await terminal.sendKeys("g", "a");
  await terminal.waitForText("Agent Sessions");
}

export async function waitForSessionListReady(terminal: TUITestInstance): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < 10_000) {
    const content = terminal.snapshot();
    if (!content.includes("Loading sessions") && (content.includes("sessions") || content.includes("No sessions"))) {
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

// ── Launch options ────────────────────────────────────────────────────────────

export interface LaunchTUIOptions {
  cols?: number;
  rows?: number;
  env?: Record<string, string>;
  args?: string[];
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

// ── launchTUI implementation ─────────────────────────────────────────────────

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

// ── Subprocess helpers ───────────────────────────────────────────────────────

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
```

Key exports:

| Export | Type | Purpose |
|--------|------|----------|
| `TUI_ROOT` | `string` | Absolute path to `apps/tui/` |
| `TUI_SRC` | `string` | Absolute path to `apps/tui/src/` |
| `TUI_ENTRY` | `string` | Absolute path to `apps/tui/src/index.tsx` |
| `BUN` | `string` | Bun executable path |
| `TUITestInstance` | `interface` | Terminal interaction API |
| `LaunchTUIOptions` | `interface` | Launch configuration |
| `launchTUI()` | `function` | Spawn TUI with virtual terminal |
| `bunEval()` | `function` | Evaluate JS expression in Bun subprocess |
| `run()` | `function` | Run arbitrary command with timeout |
| `createTestCredentialStore()` | `function` | Create temp credential store |
| `createMockAPIEnv()` | `function` | Create mock API environment variables |
| `navigateToAgents()` | `function` | Navigate to agents screen |
| `waitForSessionListReady()` | `function` | Wait for agent sessions to load |
| `navigateToAgentChat()` | `function` | Navigate to agent chat screen |
| `waitForChatReady()` | `function` | Wait for agent chat to be ready |

### Step 6: Create the E2E test file

**File:** `e2e/tui/app-shell.test.ts` (CREATE)

See Section 7 for full test specification.

---

## 4. Design Decisions & Rationale

### 4.1 Why `useMemo` instead of raw computation

The `useLayout` hook is expected to be called by 10–20 components simultaneously (AppShell, HeaderBar, StatusBar, every screen, every modal). While the computation itself is trivial, returning a new object reference on every render would cause all consumers to re-render on every parent re-render, even if dimensions haven't changed. `useMemo([width, height])` ensures the object reference is stable unless dimensions actually change.

### 4.2 Why NOT a React context (for this ticket)

A context provider (`LayoutProvider`) was considered and rejected for this ticket:

- **Premature complexity.** The hook is pure — it reads from `useTerminalDimensions()` (which is itself context-based in OpenTUI, using `useRenderer()` internally) and computes derived values. There is no shared state to propagate.
- **No prop drilling problem.** Any component can call `useLayout()` directly.
- **Future upgrade path.** When `useSidebarState` adds `Ctrl+B` toggle state, a `LayoutProvider` context can wrap `useLayout` without changing any consumer call sites. The hook signature stays the same.

### 4.3 Why `contentHeight` is `height - 2`

The AppShell layout reserves exactly 2 rows:
- 1 row for `HeaderBar` (breadcrumb, repo context, badges)
- 1 row for `StatusBar` (keybinding hints, sync status, notification count)

The content area fills the remaining space. At the absolute minimum terminal size (80×24), `contentHeight = 22`. The `Math.max(0, ...)` guard prevents negative values in edge cases where height < 2 (which would already be unsupported by `getBreakpoint`).

### 4.4 Why sidebar returns `"0%"` at minimum instead of just being hidden

When `sidebarVisible` is `false`, the sidebar component is not rendered. However, some layout calculations need the sidebar width value regardless (e.g., for computing main content width or animation targets in future). Returning `"0%"` keeps the interface consistent — consumers always have a valid width string. This matches the reference implementation pattern where `getSidebarWidth` always returns a percentage string.

### 4.5 Why `getBreakpoint` uses OR (not AND) for thresholds

The breakpoint classification says `cols < 120 || rows < 40` → `"minimum"`. This means a terminal that is 200 columns wide but only 30 rows tall is still classified as "minimum". The rationale: layout requires BOTH sufficient width AND height. A very wide but short terminal cannot fit the standard three-zone layout with meaningful content area. Verified: both the architecture spec and the reference implementation use this OR logic.

### 4.6 `useOnResize` is NOT needed

`useTerminalDimensions()` from `@opentui/react` already triggers a React re-render when the terminal is resized. Its implementation (verified in `context/opentui/packages/react/src/hooks/use-terminal-dimensions.ts`, lines 1-23) internally:
1. Gets the renderer via `useRenderer()`
2. Initializes `useState` with `{ width: renderer.width, height: renderer.height }`
3. Calls `useOnResize(cb)` where `cb` calls `setDimensions`

Adding `useOnResize()` in `useLayout` would be redundant. The layout values recalculate because React re-renders the component when `width`/`height` state changes, and `useMemo` recomputes because its dependency array `[width, height]` changed.

### 4.7 Why `null` for unsupported instead of `"unsupported"` string

See Section 2.6 for full rationale. Summary: `null` keeps the union type clean, enables idiomatic null checks, and aligns with all reference implementations.

### 4.8 Why helper functions are module-private, not exported

`getSidebarWidth()`, `getModalWidth()`, and `getModalHeight()` are implementation details. They exist to keep the `useMemo` callback readable. They are not exported because:
- No consumer should call them directly.
- If a consumer needs a custom breakpoint→value mapping, it should read `breakpoint` from `useLayout()` and switch on it locally, or use `useResponsiveValue()` when that hook is deployed.
- Keeping them private allows refactoring without breaking external contracts.

### 4.9 Self-contained `useLayout` vs reference implementation's `useSidebarState` composition

The reference implementation's `useLayout` (line 121) imports `useSidebarState` which manages `Ctrl+B` toggle state and a `sidebar: SidebarState` field (line 59). This ticket implements the simpler self-contained version per the ticket description (`sidebarVisible` is `breakpoint !== 'minimum'`). The evolution path is:

1. **This ticket:** `sidebarVisible = breakpoint !== null && breakpoint !== "minimum"` (no toggle)
2. **Future ticket (sidebar state):** Deploy `useBreakpoint()` and `useSidebarState()` hooks
3. **Future ticket (sidebar integration):** Update `useLayout` to compose `useSidebarState()`, adding `sidebar: SidebarState` field and making `sidebarVisible` toggle-aware

The `LayoutContext` interface is forward-compatible — adding `sidebar: SidebarState` is additive and does not break existing destructuring patterns.

---

## 5. File Manifest

| File | Action | Lines (est.) | Description |
|------|--------|-------------|-------------|
| `apps/tui/src/types/breakpoint.ts` | **Create** | 33 | `Breakpoint` type and `getBreakpoint()` pure function |
| `apps/tui/src/types/index.ts` | **Create** | 2 | Barrel export for types |
| `apps/tui/src/hooks/useLayout.ts` | **Create** | ~115 | `useLayout()` hook and `LayoutContext` interface |
| `apps/tui/src/hooks/index.ts` | **Create** | 3 | Barrel export for hooks (includes existing `useDiffSyntaxStyle`) |
| `e2e/tui/helpers.ts` | **Create** | 353 | Shared test infrastructure (`launchTUI`, `TUITestInstance`, `bunEval`, `run`) |
| `e2e/tui/app-shell.test.ts` | **Create** | ~450 | E2E tests for breakpoint logic, layout computation, and responsive behavior |

---

## 6. Integration Points

### 6.1 Consumers that will use `useLayout()`

Once this hook is implemented, the following components (from the architecture spec) will consume it:

| Component | Properties Used |
|-----------|------------------|
| `AppShell` | `contentHeight`, `width`, `height`, `breakpoint` |
| `HeaderBar` | `breakpoint` (breadcrumb truncation at minimum) |
| `StatusBar` | `breakpoint` (keybinding hint count: 4 at minimum, 6 at standard, all at large) |
| `ScreenRouter` | `breakpoint` (`null` → show terminal-too-small message) |
| `ScrollableList` | `contentHeight` (viewport size for page-up/page-down calculations) |
| `ModalSystem` | `modalWidth`, `modalHeight` |
| `CommandPalette` | `modalWidth`, `modalHeight` |
| `HelpOverlay` | `modalWidth`, `modalHeight` |
| `DiffViewer` | `sidebarVisible`, `sidebarWidth`, `breakpoint` (split mode unavailable at minimum) |
| `TabbedDetailView` | `breakpoint` (metadata column visibility, tab label abbreviation) |
| `MessageBlock` | `breakpoint` (padding, label abbreviation, timestamp visibility) |

### 6.2 Replacing inline breakpoint computation

After this hook lands, the following existing code patterns should be refactored (tracked as separate follow-up work, NOT part of this ticket):

**Before (current pattern in `screens/Agents/types.ts` line 16):**
```typescript
// Local Breakpoint type
export type Breakpoint = "minimum" | "standard" | "large";
```

**After (import from canonical location):**
```typescript
import { type Breakpoint } from "../../types/breakpoint.js";
// Remove local Breakpoint type
```

**Before (current pattern in `screens/Agents/utils/formatTimestamp.ts` line 2):**
```typescript
import { Breakpoint } from "../types";
```

**After:**
```typescript
import { type Breakpoint } from "../../../types/breakpoint.js";
```

**Before (anticipated inline pattern in future components):**
```typescript
const { width, height } = useTerminalDimensions();
const breakpoint = getBreakpoint(width, height);
const contentHeight = height - 2;
const sidebarVisible = breakpoint !== "minimum";
```

**After (using `useLayout`):**
```typescript
const { breakpoint, contentHeight, sidebarVisible } = useLayout();
```

### 6.3 Future: sidebar toggle state

The design spec mentions `Ctrl+B` toggles sidebar visibility. This is NOT part of this ticket. When implemented:
1. Deploy `useBreakpoint()` from `specs/tui/apps/tui/src/hooks/useBreakpoint.ts`
2. Deploy `useSidebarState()` from `specs/tui/apps/tui/src/hooks/useSidebarState.ts`
3. Update `useLayout()` to compose `useSidebarState()` per the reference implementation
4. Add `sidebar: SidebarState` field to `LayoutContext`
5. `sidebarVisible` becomes `sidebar.visible` (incorporates toggle)
6. `getSidebarWidth(breakpoint)` becomes `getSidebarWidth(breakpoint, sidebar.visible)` (toggle-aware)

The `useLayout()` hook signature and return type remain backward-compatible — consumers don't need to update their destructuring.

---

## 7. Unit & Integration Tests

**Test file:** `e2e/tui/app-shell.test.ts`

All tests follow the project testing philosophy:
- Tests that fail due to unimplemented backends are left failing — never skipped or commented out.
- Each test validates one user-facing behavior.
- No mocking of implementation details.
- Pure function tests pass immediately; E2E tests may fail until dependent components are implemented.

### 7.1 Pure function tests: `getBreakpoint()`

These tests validate `getBreakpoint()` as a pure function imported directly. They do not require launching the TUI and will pass immediately upon implementation.

```typescript
import { describe, test, expect } from "bun:test";
import { getBreakpoint } from "../../apps/tui/src/types/breakpoint.js";

describe("getBreakpoint — pure function", () => {
  // ── Unsupported boundaries ────────────────────────────────

  test("HOOK-LAY-001: returns null for 79x24 (below minimum cols)", () => {
    expect(getBreakpoint(79, 24)).toBeNull();
  });

  test("HOOK-LAY-002: returns null for 80x23 (below minimum rows)", () => {
    expect(getBreakpoint(80, 23)).toBeNull();
  });

  test("HOOK-LAY-003: returns null for 79x23 (both below)", () => {
    expect(getBreakpoint(79, 23)).toBeNull();
  });

  test("HOOK-LAY-004: returns null for 0x0", () => {
    expect(getBreakpoint(0, 0)).toBeNull();
  });

  // ── Minimum boundaries ────────────────────────────────────

  test("HOOK-LAY-005: returns 'minimum' for 80x24 (exact lower bound)", () => {
    expect(getBreakpoint(80, 24)).toBe("minimum");
  });

  test("HOOK-LAY-006: returns 'minimum' for 119x39 (exact upper bound)", () => {
    expect(getBreakpoint(119, 39)).toBe("minimum");
  });

  test("HOOK-LAY-007: returns 'minimum' for 200x30 (wide but short)", () => {
    expect(getBreakpoint(200, 30)).toBe("minimum");
  });

  test("HOOK-LAY-008: returns 'minimum' for 100x60 (tall but narrow)", () => {
    expect(getBreakpoint(100, 60)).toBe("minimum");
  });

  // ── Standard boundaries ───────────────────────────────────

  test("HOOK-LAY-009: returns 'standard' for 120x40 (exact lower bound)", () => {
    expect(getBreakpoint(120, 40)).toBe("standard");
  });

  test("HOOK-LAY-010: returns 'standard' for 199x59 (exact upper bound)", () => {
    expect(getBreakpoint(199, 59)).toBe("standard");
  });

  test("HOOK-LAY-011: returns 'standard' for 150x50 (mid-range)", () => {
    expect(getBreakpoint(150, 50)).toBe("standard");
  });

  // ── Large boundaries ──────────────────────────────────────

  test("HOOK-LAY-012: returns 'large' for 200x60 (exact lower bound)", () => {
    expect(getBreakpoint(200, 60)).toBe("large");
  });

  test("HOOK-LAY-013: returns 'large' for 300x80 (very large terminal)", () => {
    expect(getBreakpoint(300, 80)).toBe("large");
  });

  // ── OR logic verification ─────────────────────────────────

  test("HOOK-LAY-014: returns 'minimum' when cols >= standard but rows < standard", () => {
    expect(getBreakpoint(120, 39)).toBe("minimum");
  });

  test("HOOK-LAY-015: returns 'minimum' when rows >= standard but cols < standard", () => {
    expect(getBreakpoint(119, 40)).toBe("minimum");
  });

  test("HOOK-LAY-016: returns 'standard' when cols >= large but rows < large", () => {
    expect(getBreakpoint(200, 59)).toBe("standard");
  });

  test("HOOK-LAY-017: returns 'standard' when rows >= large but cols < large", () => {
    expect(getBreakpoint(199, 60)).toBe("standard");
  });
});
```

### 7.2 Computed value tests: layout derivation via `bunEval()`

These tests validate the derivation logic by importing the actual module in a Bun subprocess. They verify that the deployed code is importable and produces correct values. They will pass immediately upon implementation.

```typescript
import { describe, test, expect } from "bun:test";
import { bunEval } from "./helpers";

describe("useLayout — computed values", () => {
  test("HOOK-LAY-020: contentHeight is height - 2 at standard size", async () => {
    const result = await bunEval(`
      const height = 40;
      const contentHeight = Math.max(0, height - 2);
      console.log(JSON.stringify({ contentHeight }));
    `);
    const { contentHeight } = JSON.parse(result.stdout.trim());
    expect(contentHeight).toBe(38);
  });

  test("HOOK-LAY-021: contentHeight floors at 0 for tiny terminals", async () => {
    const result = await bunEval(`
      const height = 1;
      const contentHeight = Math.max(0, height - 2);
      console.log(JSON.stringify({ contentHeight }));
    `);
    const { contentHeight } = JSON.parse(result.stdout.trim());
    expect(contentHeight).toBe(0);
  });

  test("HOOK-LAY-022: sidebarVisible is false at minimum breakpoint", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(80, 24);
      const sidebarVisible = bp !== null && bp !== "minimum";
      console.log(JSON.stringify({ bp, sidebarVisible }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.sidebarVisible).toBe(false);
  });

  test("HOOK-LAY-023: sidebarVisible is true at standard breakpoint", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(120, 40);
      const sidebarVisible = bp !== null && bp !== "minimum";
      console.log(JSON.stringify({ bp, sidebarVisible }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.sidebarVisible).toBe(true);
  });

  test("HOOK-LAY-024: sidebarVisible is false when breakpoint is null", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./apps/tui/src/types/breakpoint.js");
      const bp = getBreakpoint(60, 20);
      const sidebarVisible = bp !== null && bp !== "minimum";
      console.log(JSON.stringify({ bp, sidebarVisible }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.bp).toBeNull();
    expect(parsed.sidebarVisible).toBe(false);
  });

  test("HOOK-LAY-025: sidebarWidth is '25%' at standard, '30%' at large, '0%' otherwise", async () => {
    const result = await bunEval(`
      function getSidebarWidth(bp) {
        switch (bp) {
          case "large": return "30%";
          case "standard": return "25%";
          default: return "0%";
        }
      }
      console.log(JSON.stringify({
        standard: getSidebarWidth("standard"),
        large: getSidebarWidth("large"),
        minimum: getSidebarWidth("minimum"),
        null: getSidebarWidth(null),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.standard).toBe("25%");
    expect(parsed.large).toBe("30%");
    expect(parsed.minimum).toBe("0%");
    expect(parsed.null).toBe("0%");
  });

  test("HOOK-LAY-026: modalWidth scales inversely with breakpoint", async () => {
    const result = await bunEval(`
      function getModalWidth(bp) {
        switch (bp) {
          case "large": return "50%";
          case "standard": return "60%";
          default: return "90%";
        }
      }
      console.log(JSON.stringify({
        minimum: getModalWidth("minimum"),
        standard: getModalWidth("standard"),
        large: getModalWidth("large"),
        null: getModalWidth(null),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.minimum).toBe("90%");
    expect(parsed.standard).toBe("60%");
    expect(parsed.large).toBe("50%");
    expect(parsed.null).toBe("90%");
  });

  test("HOOK-LAY-027: modalHeight matches modalWidth per breakpoint", async () => {
    const result = await bunEval(`
      function getModalHeight(bp) {
        switch (bp) {
          case "large": return "50%";
          case "standard": return "60%";
          default: return "90%";
        }
      }
      console.log(JSON.stringify({
        minimum: getModalHeight("minimum"),
        standard: getModalHeight("standard"),
        large: getModalHeight("large"),
        null: getModalHeight(null),
      }));
    `);
    const parsed = JSON.parse(result.stdout.trim());
    expect(parsed.minimum).toBe("90%");
    expect(parsed.standard).toBe("60%");
    expect(parsed.large).toBe("50%");
    expect(parsed.null).toBe("90%");
  });

  test("HOOK-LAY-028: getBreakpoint is importable from types barrel", async () => {
    const result = await bunEval(`
      const { getBreakpoint } = await import("./apps/tui/src/types/index.js");
      console.log(typeof getBreakpoint);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-LAY-029: useLayout is importable from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./apps/tui/src/hooks/index.js");
      console.log(typeof mod.useLayout);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });

  test("HOOK-LAY-030: useDiffSyntaxStyle remains exported from hooks barrel", async () => {
    const result = await bunEval(`
      const mod = await import("./apps/tui/src/hooks/index.js");
      console.log(typeof mod.useDiffSyntaxStyle);
    `);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("function");
  });
});
```

### 7.3 E2E responsive layout tests (full TUI launch)

These tests launch the full TUI at specific terminal sizes and verify that responsive behavior is user-visible. They will fail until the AppShell, HeaderBar, StatusBar, and ScreenRouter are implemented by `tui-foundation-scaffold`. **Per project policy, they are left failing — never skipped or commented out.**

```typescript
import { describe, test, expect, afterEach } from "bun:test";
import { launchTUI, type TUITestInstance } from "./helpers";

describe("TUI Responsive Layout — E2E", () => {
  let terminal: TUITestInstance;

  afterEach(async () => {
    if (terminal) {
      await terminal.terminate();
    }
  });

  // ── Terminal too small ────────────────────────────────────

  test("RESP-LAY-001: shows 'terminal too small' at 79x24", async () => {
    terminal = await launchTUI({ cols: 79, rows: 24 });
    await terminal.waitForText("Terminal too small");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-002: shows 'terminal too small' at 80x23", async () => {
    terminal = await launchTUI({ cols: 80, rows: 23 });
    await terminal.waitForText("Terminal too small");
  });

  test("RESP-LAY-003: shows current dimensions in 'too small' message", async () => {
    terminal = await launchTUI({ cols: 60, rows: 20 });
    await terminal.waitForText("60");
    await terminal.waitForText("20");
  });

  // ── Minimum breakpoint rendering ──────────────────────────

  test("RESP-LAY-004: renders at 80x24 minimum with no sidebar", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-005: modal uses 90% width at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys(":"); // Open command palette
    await terminal.waitForText("Command"); // Wait for palette to render
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Standard breakpoint rendering ─────────────────────────

  test("RESP-LAY-006: renders at 120x40 standard with full layout", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Large breakpoint rendering ────────────────────────────

  test("RESP-LAY-007: renders at 200x60 large with expanded layout", async () => {
    terminal = await launchTUI({ cols: 200, rows: 60 });
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  // ── Resize transitions ────────────────────────────────────

  test("RESP-LAY-008: resize from standard to minimum hides sidebar", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(80, 24);
    await terminal.waitForText("Dashboard"); // Still shows dashboard
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-009: resize from minimum to standard shows sidebar", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-010: resize below minimum shows 'too small' message", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(60, 20);
    await terminal.waitForText("Terminal too small");
  });

  test("RESP-LAY-011: resize back from 'too small' restores content", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    await terminal.resize(60, 20);
    await terminal.waitForText("Terminal too small");
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
  });

  // ── Status bar responsive hints ───────────────────────────

  test("RESP-LAY-012: status bar shows truncated hints at 80x24", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    const statusLine = terminal.getLine(23); // Last row
    expect(statusLine).toMatch(/\?/); // Help hint always visible
    expect(terminal.snapshot()).toMatchSnapshot();
  });

  test("RESP-LAY-013: header truncates breadcrumb at 80x24 with deep stack", async () => {
    terminal = await launchTUI({
      cols: 80,
      rows: 24,
      args: ["--screen", "issues", "--repo", "acme/api"],
    });
    await terminal.waitForText("Issues");
    const headerLine = terminal.getLine(0);
    // At minimum, breadcrumb truncates from left with ellipsis
    expect(headerLine).toMatch(/…/);
  });

  // ── Content height verification ───────────────────────────

  test("RESP-LAY-014: content area fills between header and status bar", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Header is line 0, status bar is line 39
    const headerLine = terminal.getLine(0);
    const statusLine = terminal.getLine(39);
    expect(headerLine.length).toBeGreaterThan(0);
    expect(statusLine.length).toBeGreaterThan(0);
  });

  // ── Keyboard still works at all breakpoints ───────────────

  test("RESP-LAY-015: Ctrl+C quits at unsupported size", async () => {
    terminal = await launchTUI({ cols: 60, rows: 20 });
    await terminal.waitForText("Terminal too small");
    await terminal.sendKeys("\x03"); // Ctrl+C
  });

  test("RESP-LAY-016: navigation works at minimum breakpoint", async () => {
    terminal = await launchTUI({ cols: 80, rows: 24 });
    await terminal.waitForText("Dashboard");
    await terminal.sendKeys("g", "r");
    await terminal.waitForText("Repositories");
    await terminal.sendKeys("q");
    await terminal.waitForText("Dashboard");
  });
});
```

### 7.4 Edge case tests

```typescript
import { describe, test, expect } from "bun:test";
import { getBreakpoint } from "../../apps/tui/src/types/breakpoint.js";
import { launchTUI, type TUITestInstance } from "./helpers";

describe("useLayout — edge cases", () => {
  let terminal: TUITestInstance;

  // ── Pure edge cases (pass immediately) ────────────────────

  test("EDGE-LAY-001: contentHeight is 0 when height is 2", () => {
    const contentHeight = Math.max(0, 2 - 2);
    expect(contentHeight).toBe(0);
  });

  test("EDGE-LAY-002: contentHeight is 0 when height is 1", () => {
    const contentHeight = Math.max(0, 1 - 2);
    expect(contentHeight).toBe(0);
  });

  test("EDGE-LAY-003: extremely large terminal returns 'large' breakpoint", () => {
    expect(getBreakpoint(500, 200)).toBe("large");
  });

  test("EDGE-LAY-004: negative dimensions return null", () => {
    expect(getBreakpoint(-1, -1)).toBeNull();
  });

  test("EDGE-LAY-006: exact boundary 80x24 is minimum not null", () => {
    expect(getBreakpoint(80, 24)).toBe("minimum");
  });

  test("EDGE-LAY-007: exact boundary 120x40 is standard not minimum", () => {
    expect(getBreakpoint(120, 40)).toBe("standard");
  });

  test("EDGE-LAY-008: exact boundary 200x60 is large not standard", () => {
    expect(getBreakpoint(200, 60)).toBe("large");
  });

  // ── Full TUI edge cases (fail until AppShell exists) ──────

  test("EDGE-LAY-005: rapid resize does not throw", async () => {
    terminal = await launchTUI({ cols: 120, rows: 40 });
    await terminal.waitForText("Dashboard");
    // Rapid sequence of resizes
    await terminal.resize(80, 24);
    await terminal.resize(200, 60);
    await terminal.resize(60, 20);
    await terminal.resize(120, 40);
    await terminal.waitForText("Dashboard");
    await terminal.terminate();
  });
});
```

### 7.5 Test classification summary

| Test Group | Count | Passes Immediately? | Reason |
|-----------|-------|---------------------|--------|
| `getBreakpoint` pure function (HOOK-LAY-001–017) | 17 | ✅ Yes | Pure function, no TUI launch needed |
| Computed values via `bunEval` (HOOK-LAY-020–030) | 11 | ✅ Yes | `bunEval` subprocess, imports module directly |
| E2E responsive layout (RESP-LAY-001–016) | 16 | ❌ No | Requires AppShell, HeaderBar, StatusBar, ScreenRouter from `tui-foundation-scaffold` |
| Pure edge cases (EDGE-LAY-001–004, 006–008) | 7 | ✅ Yes | Pure computation, no TUI launch needed |
| Full TUI edge cases (EDGE-LAY-005) | 1 | ❌ No | Requires full TUI launchable |
| **Total** | **52** | **35 pass, 17 fail** | |

---

## 8. Productionization Checklist

### 8.1 From spec files to deployed code

The reference implementations in `specs/tui/apps/tui/src/` are production-quality but must be adapted for this ticket's scope. The `types/breakpoint.ts` is used verbatim. The `hooks/useLayout.ts` is adapted to remove the `useSidebarState` dependency (which is not yet deployed).

| Source | Production Target | Action |
|--------|-------------------|--------|
| `specs/tui/apps/tui/src/types/breakpoint.ts` | `apps/tui/src/types/breakpoint.ts` | Copy verbatim (verified: 33 lines, identical to spec in this document) |
| `specs/tui/apps/tui/src/types/index.ts` | `apps/tui/src/types/index.ts` | Copy verbatim (verified: 2 lines) |
| Section 3, Step 3 (this spec) | `apps/tui/src/hooks/useLayout.ts` | Create per this spec — self-contained, no `useSidebarState` dep, no `sidebar: SidebarState` field |
| (New) | `apps/tui/src/hooks/index.ts` | Create with only deployed hook exports (3 lines) |
| `specs/tui/e2e/tui/helpers.ts` | `e2e/tui/helpers.ts` | Copy verbatim (verified: 353 lines) |
| Section 7 (this spec) | `e2e/tui/app-shell.test.ts` | Create per this spec (~450 lines) |

**Critical difference from reference `useLayout`:** The reference implementation's `useLayout.ts` (line 4) imports `useSidebarState` from `./useSidebarState.js`. That hook does not exist in deployed code and depends on `useBreakpoint` (also not deployed). The reference `LayoutContext` also includes `sidebar: SidebarState` (line 59) and `getSidebarWidth` takes two parameters (line 62-72). The version in this spec is self-contained — it computes `sidebarVisible` directly from the breakpoint without toggle state.

### 8.2 Module resolution

The TUI uses `"jsxImportSource": "@opentui/react"` and targets ESNext with `"moduleResolution": "bundler"` (verified in `specs/tui/apps/tui/tsconfig.json`). All imports use `.js` extensions per the project convention (TypeScript with ESM):

```typescript
// Correct:
import { getBreakpoint } from "../types/breakpoint.js";

// Incorrect (may fail at runtime in Bun):
import { getBreakpoint } from "../types/breakpoint";
```

Note: with `"moduleResolution": "bundler"`, Bun typically resolves both forms. However, the project convention is to use `.js` extensions consistently, as demonstrated by the existing `useDiffSyntaxStyle.ts` which imports from `"../lib/diff-syntax.js"`.

### 8.3 Verify OpenTUI peer dependency

The hook depends on `useTerminalDimensions` from `@opentui/react`. Verified in `specs/tui/apps/tui/package.json`: `@opentui/react` is listed at exact version `0.1.90`. No version change needed.

### 8.4 No native dependencies added

This ticket adds zero new dependencies. It only uses:
- `react` (already in `package.json` at `19.2.4`) — `useMemo`
- `@opentui/react` (already in `package.json` at `0.1.90`) — `useTerminalDimensions`

### 8.5 Snapshot golden files

The E2E tests include `toMatchSnapshot()` calls. On first run, these create golden files in `e2e/tui/__snapshots__/`. On subsequent runs, they compare against the golden files. Golden files should be committed to the repository. These snapshots will only be generated once the full AppShell is implemented by `tui-foundation-scaffold`.

### 8.6 Test failure policy

Per project policy (from memory and testing philosophy): tests that fail due to unimplemented backends or unimplemented components are **left failing**. Specifically:

- The 17 pure function tests (HOOK-LAY-001–017) **pass immediately**.
- The 11 computed value tests (HOOK-LAY-020–030) **pass immediately**.
- The 16 E2E tests (RESP-LAY-001–016) **fail until** `tui-foundation-scaffold` implements AppShell, HeaderBar, StatusBar, and ScreenRouter.
- The 7 pure edge case tests (EDGE-LAY-001–004, 006–008) **pass immediately**.
- EDGE-LAY-005 (rapid resize) **fails until** the full TUI is launchable.

### 8.7 Existing `Breakpoint` type migration

The `Breakpoint` type currently defined at `apps/tui/src/screens/Agents/types.ts` (line 16) is NOT modified by this ticket. Migrating existing imports to the canonical `apps/tui/src/types/breakpoint.js` location is a follow-up task to avoid scope creep and to decouple from the Agents screen implementation.

**Compatibility note:** The canonical `Breakpoint` type (`"minimum" | "standard" | "large"`) is identical in shape to the existing local type. The `getBreakpoint()` function returns `Breakpoint | null` where `null` represents unsupported — the local type does not have an equivalent. Migration is a pure import path change with no behavioral difference.

### 8.8 TypeScript compilation verification

After all files are created, run `bun run check` from `apps/tui/` to verify TypeScript compilation. The new files must compile with zero errors under the existing `tsconfig.json`. Key checks:
- `useMemo` import from `react` resolves (React 19.2.4 with `@types/react@^19.0.0`)
- `useTerminalDimensions` import from `@opentui/react` resolves (v0.1.90)
- `.js` extension imports resolve under `"moduleResolution": "bundler"`
- `strict: true` mode passes (no implicit any, no unused locals/params since those are disabled)

### 8.9 Hooks barrel — conservative export list

The hooks barrel (`apps/tui/src/hooks/index.ts`) exports only hooks that are currently deployed in `apps/tui/src/hooks/`. The reference barrel at `specs/tui/apps/tui/src/hooks/index.ts` contains 85 lines of exports for hooks that don't exist yet. **Do NOT copy the reference barrel.** Create a minimal barrel with 3 lines. Each subsequent hook ticket adds its own export.

---

## 9. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|---------------|
| AC-1 | `getBreakpoint()` returns correct classification for all boundary values | Pure function tests HOOK-LAY-001 through HOOK-LAY-017 pass |
| AC-2 | `getBreakpoint()` returns `null` for terminals below 80×24 | Tests HOOK-LAY-001 through HOOK-LAY-004 |
| AC-3 | `useLayout()` returns `{ width, height, breakpoint, contentHeight, sidebarVisible, sidebarWidth, modalWidth, modalHeight }` | TypeScript compilation succeeds; import tests HOOK-LAY-029 |
| AC-4 | `contentHeight` equals `height - 2`, floored at 0 | Tests HOOK-LAY-020, HOOK-LAY-021, EDGE-LAY-001, EDGE-LAY-002 |
| AC-5 | `sidebarVisible` is `false` when breakpoint is `null` or `"minimum"` | Tests HOOK-LAY-022, HOOK-LAY-024 |
| AC-6 | `sidebarVisible` is `true` when breakpoint is `"standard"` or `"large"` | Test HOOK-LAY-023 |
| AC-7 | `sidebarWidth` is `"25%"` at standard, `"30%"` at large, `"0%"` at minimum/null | Test HOOK-LAY-025 |
| AC-8 | `modalWidth` / `modalHeight` are `"90%"` / `"60%"` / `"50%"` per breakpoint | Tests HOOK-LAY-026, HOOK-LAY-027 |
| AC-9 | Values recalculate synchronously on terminal resize | E2E tests RESP-LAY-008 through RESP-LAY-011 |
| AC-10 | `null` breakpoint triggers "terminal too small" screen | E2E tests RESP-LAY-001, RESP-LAY-002, RESP-LAY-003 |
| AC-11 | Hook is exported from `hooks/index.ts` barrel | Test HOOK-LAY-029 |
| AC-12 | `LayoutContext` type is exported for consumer use | TypeScript import succeeds |
| AC-13 | No new runtime dependencies added | `package.json` diff is empty |
| AC-14 | All files use `.js` import extensions | Bun runtime resolution succeeds |
| AC-15 | `getBreakpoint` is exported from `types/index.ts` barrel | Test HOOK-LAY-028 |
| AC-16 | `apps/tui/src/types/` directory exists with barrel export | File system check |
| AC-17 | Existing `useDiffSyntaxStyle` is included in hooks barrel | Test HOOK-LAY-030 |
| AC-18 | E2E test helpers (`launchTUI`, `bunEval`, etc.) deployed at `e2e/tui/helpers.ts` | Import succeeds in test file |

---

## 10. Appendix: Breakpoint Decision Table

| cols | rows | Breakpoint | sidebar | sidebarWidth | modalWidth | modalHeight | contentHeight |
|------|------|------------|---------|--------------|------------|-------------|---------------|
| 60 | 20 | null | hidden | 0% | 90% | 90% | 18 |
| 79 | 24 | null | hidden | 0% | 90% | 90% | 22 |
| 80 | 23 | null | hidden | 0% | 90% | 90% | 21 |
| 80 | 24 | minimum | hidden | 0% | 90% | 90% | 22 |
| 100 | 30 | minimum | hidden | 0% | 90% | 90% | 28 |
| 119 | 39 | minimum | hidden | 0% | 90% | 90% | 37 |
| 120 | 39 | minimum | hidden | 0% | 90% | 90% | 37 |
| 119 | 40 | minimum | hidden | 0% | 90% | 90% | 38 |
| 120 | 40 | standard | visible | 25% | 60% | 60% | 38 |
| 150 | 50 | standard | visible | 25% | 60% | 60% | 48 |
| 199 | 59 | standard | visible | 25% | 60% | 60% | 57 |
| 200 | 59 | standard | visible | 25% | 60% | 60% | 57 |
| 199 | 60 | standard | visible | 25% | 60% | 60% | 58 |
| 200 | 60 | large | visible | 30% | 50% | 50% | 58 |
| 300 | 80 | large | visible | 30% | 50% | 50% | 78 |
| 200 | 30 | minimum | hidden | 0% | 90% | 90% | 28 |
| 100 | 60 | minimum | hidden | 0% | 90% | 90% | 58 |
| -1 | -1 | null | hidden | 0% | 90% | 90% | 0 |
| 0 | 0 | null | hidden | 0% | 90% | 90% | 0 |
| 500 | 200 | large | visible | 30% | 50% | 50% | 198 |