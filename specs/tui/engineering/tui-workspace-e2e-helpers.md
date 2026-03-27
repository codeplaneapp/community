# Engineering Specification: Shared Test Helpers for Workspace E2E Tests

**Ticket:** `tui-workspace-e2e-helpers`
**Status:** Engineering specification
**Dependencies:** `tui-e2e-test-infra`

---

## 1. Overview

This ticket creates shared test helpers for workspace E2E tests in `e2e/tui/workspaces.test.ts`. These helpers extend the base TUI test infrastructure from `e2e/tui/helpers.ts` (dependency: `tui-e2e-test-infra`) with workspace-specific fixtures, navigation helpers, SSE simulation, and assertion utilities.

The helpers provide five capabilities:
1. **Workspace test fixtures** — deterministic `Workspace` objects for all workspace states
2. **`launchTUIWithWorkspaceContext()`** — launches TUI with repo context and navigates to workspace screens
3. **`waitForStatusTransition()`** — waits for SSE-driven status badge changes in the terminal
4. **`mockSSEStatusEvent()` / `createWorkspaceStatusEvent()`** — injects SSE workspace status events into the test environment via file-based injection
5. **`assertWorkspaceRow()`** — asserts workspace list row content by line number

---

## 2. File Layout

```
e2e/tui/
├── helpers.ts                        # existing base test helpers (dependency: tui-e2e-test-infra)
├── helpers/
│   ├── index.ts                      # NEW — barrel re-export
│   ├── workspaces.ts                 # NEW — workspace-specific test helpers
│   └── __tests__/
│       └── workspaces.test.ts        # NEW — unit tests for workspace helpers
└── workspaces.test.ts                # existing test file — will import from helpers/workspaces.ts

apps/tui/src/
└── providers/
    └── SSEProvider.tsx               # MODIFIED — add file-based SSE injection code path for tests
```

**Decision: separate file, not inline in helpers.ts.** The base `helpers.ts` is feature-agnostic and shared across all test files. Workspace helpers are domain-specific and should not pollute the base module. A `helpers/` subdirectory allows future feature-specific helper modules (e.g., `helpers/workflows.ts`, `helpers/issues.ts`) without growing the base file. This pattern is already established in the spec directory at `specs/tui/e2e/tui/helpers/` which includes `workspaces.ts`, `workflows.ts`, and a barrel `index.ts`.

---

## 3. Detailed Design

### 3.1 Workspace Test Fixtures

**File:** `e2e/tui/helpers/workspaces.ts`

Fixtures provide pre-built `Workspace` objects matching the `Workspace` interface from `@codeplane/ui-core` (`specs/tui/packages/ui-core/src/types/workspaces.ts`). All values are deterministic — no `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`. This ensures snapshot stability and test reproducibility.

**Type system alignment:**

- The fixtures use the `Workspace` type from `@codeplane/ui-core` which has `status: WorkspaceStatus` — a union type of `"pending" | "starting" | "running" | "suspended" | "stopped" | "failed"`.
- The `WorkspaceResponse` type from `@codeplane/sdk` (`packages/sdk/src/services/workspace.ts:60-76`) has `status: string` — a loose string type used at the server/transport layer.
- Tests use the `Workspace` type because it is the client-side representation consumed by TUI components. The `WorkspaceStatus` union type provides compile-time safety against invalid states.
- The `Workspace` interface fields map 1:1 to `WorkspaceResponse` but with typed `status`. Both have: `id`, `repository_id`, `user_id`, `name`, `status`, `is_fork`, `parent_workspace_id?`, `freestyle_vm_id`, `persistence`, `ssh_host?`, `snapshot_id?`, `idle_timeout_seconds`, `suspended_at: string | null`, `created_at`, `updated_at`.

```typescript
import type { Workspace } from "@codeplane/ui-core";

// ── Deterministic IDs ──────────────────────────────────────────────────────

export const WORKSPACE_IDS = {
  running:   "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  suspended: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  starting:  "c3d4e5f6-a7b8-9012-cdef-123456789012",
  failed:    "d4e5f6a7-b8c9-0123-defa-234567890123",
  pending:   "e5f6a7b8-c9d0-1234-efab-345678901234",
  stopped:   "f6a7b8c9-d0e1-2345-fabc-456789012345",
} as const;

// ── Deterministic timestamps ──────────────────────────────────────────────

const BASE_TIMESTAMP = "2026-01-15T10:00:00.000Z";
const UPDATED_TIMESTAMP = "2026-01-15T12:30:00.000Z";
const SUSPENDED_TIMESTAMP = "2026-01-15T11:00:00.000Z";

// ── Shared field defaults ──────────────────────────────────────────────────

const FIXTURE_DEFAULTS: Omit<Workspace, "id" | "name" | "status" | "suspended_at"> = {
  repository_id: 42,
  user_id: 1,
  is_fork: false,
  freestyle_vm_id: "vm-fixture-001",
  persistence: "persistent",
  idle_timeout_seconds: 1800,
  created_at: BASE_TIMESTAMP,
  updated_at: UPDATED_TIMESTAMP,
};
```

**Fixture factory:**

```typescript
export type WorkspaceFixtureName = "running" | "suspended" | "starting" | "failed" | "pending" | "stopped";

export const WORKSPACE_FIXTURES: Record<WorkspaceFixtureName, Workspace> = {
  running: {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.running,
    name: "dev-environment",
    status: "running",
    ssh_host: "ws-a1b2c3d4.codeplane.test",
    suspended_at: null,
  },
  suspended: {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.suspended,
    name: "staging-env",
    status: "suspended",
    suspended_at: SUSPENDED_TIMESTAMP,
  },
  starting: {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.starting,
    name: "ci-workspace",
    status: "starting",
    suspended_at: null,
  },
  failed: {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.failed,
    name: "broken-workspace",
    status: "failed",
    suspended_at: null,
  },
  pending: {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.pending,
    name: "new-workspace",
    status: "pending",
    suspended_at: null,
  },
  stopped: {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.stopped,
    name: "archived-workspace",
    status: "stopped",
    suspended_at: null,
  },
};
```

**Custom fixture builder for one-off modifications:**

```typescript
export function createWorkspaceFixture(
  overrides: Partial<Workspace> & { name: string; status: Workspace["status"] },
): Workspace {
  return {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.running, // caller should override
    suspended_at: null,
    ...overrides,
  };
}
```

**Design rationale:**
- Fixed UUIDs enable deterministic test assertions (e.g., regex matching on workspace ID in breadcrumbs).
- Fixed timestamps prevent flaky snapshot diffs.
- The `FIXTURE_DEFAULTS` pattern keeps each fixture minimal — only the fields that differ from default are specified.
- `"stopped"` is included as a sixth state beyond the five specified in the ticket description, because the `WorkspaceStatus` enum in `@codeplane/ui-core` includes it and tests will need it for lifecycle assertions.
- The `createWorkspaceFixture()` builder allows tests to create one-off variants without adding them to the canonical fixture set.
- The `status` parameter on `createWorkspaceFixture` is typed as `Workspace["status"]` (i.e., `WorkspaceStatus`), not `string`, providing compile-time safety against invalid states.
- The `running` fixture is the only one with `ssh_host` set, reflecting reality: SSH connection info is only available for running workspaces. This matches the server behavior where `ssh_host` is populated only after the Freestyle VM is ready.

### 3.2 `launchTUIWithWorkspaceContext()`

This helper wraps `launchTUI()` from `e2e/tui/helpers.ts` with workspace-specific defaults: it sets repository context via `--repo`, navigates to the workspace screen via `--screen workspaces`, and waits for the workspace screen to render before returning.

```typescript
import { launchTUI, type TUITestInstance, type LaunchTUIOptions } from "../helpers.js";

export interface WorkspaceContextOptions extends LaunchTUIOptions {
  /** Repository in owner/repo format. Default: "acme/api". */
  repo?: string;
  /** Initial screen. Default: "workspaces". Can be "workspace-detail" for detail views. */
  screen?: "workspaces" | "workspace-detail";
  /** Workspace ID to open directly (only for screen: "workspace-detail"). */
  workspaceId?: string;
  /** Timeout for the workspace screen to be ready (ms). Default: 10000. */
  readyTimeoutMs?: number;
  /** Skip waiting for screen ready text. Default: false. */
  skipReady?: boolean;
}

export async function launchTUIWithWorkspaceContext(
  options?: WorkspaceContextOptions,
): Promise<TUITestInstance> {
  const repo = options?.repo ?? "acme/api";
  const screen = options?.screen ?? "workspaces";
  const readyTimeoutMs = options?.readyTimeoutMs ?? 10_000;

  // Build args array
  const args = ["--screen", screen, "--repo", repo];
  if (screen === "workspace-detail" && options?.workspaceId) {
    args.push("--id", options.workspaceId);
  }

  // Merge caller args after our defaults (caller overrides win)
  const mergedArgs = [...args, ...(options?.args ?? [])];

  const terminal = await launchTUI({
    cols: options?.cols ?? 120,
    rows: options?.rows ?? 40,
    env: options?.env,
    args: mergedArgs,
    launchTimeoutMs: options?.launchTimeoutMs,
  });

  // Wait for workspace screen to be ready
  if (!options?.skipReady) {
    const readyText = screen === "workspace-detail" ? "Workspace" : "Workspaces";
    await terminal.waitForText(readyText, readyTimeoutMs);
  }

  return terminal;
}
```

**Design rationale:**
- The default `repo` is `"acme/api"` — aligned with the `ORG` constant (`"acme"`) defined in `e2e/tui/helpers.ts:24` and the standard test repository pattern.
- `screen: "workspace-detail"` is supported for tests that navigate directly to a workspace detail view, passing the workspace ID via `--id`.
- `skipReady` exists for tests that intentionally test loading/error states and don't want the helper to wait for success text.
- The helper does not introduce new `TUITestInstance` methods — it returns the same interface from `helpers.ts`. This avoids a parallel type hierarchy.
- The `cols` and `rows` defaults (120×40) match `TERMINAL_SIZES.standard` from `e2e/tui/helpers.ts:28-29`, ensuring tests run at the optimal layout by default.
- The `LaunchTUIOptions` base interface provides: `cols?`, `rows?`, `env?`, `args?`, `launchTimeoutMs?` — all inherited via `extends`.

### 3.3 `waitForStatusTransition()`

This helper polls the terminal buffer for a status text change, used when testing SSE-driven workspace status updates. It first confirms the "from" status is present, then waits for it to disappear and the "to" status to appear.

```typescript
export interface StatusTransitionOptions {
  /** Timeout in milliseconds. Default: 15000. */
  timeoutMs?: number;
  /** Poll interval in milliseconds. Default: 100. */
  pollIntervalMs?: number;
}

export async function waitForStatusTransition(
  terminal: TUITestInstance,
  fromStatus: string,
  toStatus: string,
  options?: StatusTransitionOptions,
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 100;
  const startTime = Date.now();

  // Phase 1: Confirm "from" status is currently visible
  // This prevents false positives if the initial state was never rendered
  const fromDeadline = startTime + Math.min(timeoutMs / 3, 5000);
  let fromSeen = false;
  while (Date.now() < fromDeadline) {
    if (terminal.snapshot().includes(fromStatus)) {
      fromSeen = true;
      break;
    }
    await sleep(pollIntervalMs);
  }
  if (!fromSeen) {
    throw new Error(
      `waitForStatusTransition: initial status "${fromStatus}" never appeared within ${Math.min(timeoutMs / 3, 5000)}ms.\n` +
      `Terminal content:\n${terminal.snapshot()}`
    );
  }

  // Phase 2: Wait for "to" status to appear
  while (Date.now() - startTime < timeoutMs) {
    const content = terminal.snapshot();
    if (content.includes(toStatus)) {
      return;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    `waitForStatusTransition: status did not change from "${fromStatus}" to "${toStatus}" within ${timeoutMs}ms.\n` +
    `Terminal content:\n${terminal.snapshot()}`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Design rationale:**
- **Two-phase approach**: Phase 1 validates the starting state is actually rendered (catches test timing bugs where the initial state was never shown). Phase 2 waits for the target state.
- Phase 1 uses `min(timeout/3, 5000ms)` — it should not consume more than a third of the total timeout waiting for the initial state, and is capped at 5 seconds.
- The helper is status-text-based, not ANSI-escape-based. It searches for human-readable status strings (e.g., `"running"`, `"suspended"`) that appear in the terminal buffer. Tests validate what the user sees, not implementation details.
- The `options` parameter uses an object (not positional `timeoutMs`) for forward compatibility — matching the pattern used in `helpers.ts`.
- Error messages include the terminal content snapshot for debuggability — directly mirroring the error pattern used by `waitForText()` in `helpers.ts:383-385`.
- The `sleep()` helper is private to this module (not exported) to avoid conflict with any future base helpers utility. The base `helpers.ts:489-491` has its own private `sleep()`.

### 3.4 SSE Event Construction and Injection

This subsystem constructs SSE workspace status event payloads and injects them into the test environment via a file-based injection mechanism. The TUI reads `CODEPLANE_SSE_INJECT_FILE` at runtime to simulate incoming SSE events without a real PostgreSQL LISTEN/NOTIFY backend.

**Wire format alignment:** The SSE events constructed by these helpers match the exact format emitted by the server routes at `apps/server/src/routes/workspaces.ts`:

- **Workspace status** (lines 464–472): `{ type: "workspace.status", data: JSON.stringify({ workspace_id, status }), id }`
- **Session status** (lines 504–512): `{ type: "workspace.session", data: JSON.stringify({ session_id, status }), id }`

This is cross-referenced against the `SSEEvent` interface from `@codeplane/sdk` (`packages/sdk/src/services/sse.ts:23`): `{ type?: string; data: string; id?: string }`.

```typescript
import { writeFileSync, mkdtempSync, appendFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface SSEStatusEvent {
  workspace_id: string;
  status: string;
}

export interface SSESessionStatusEvent {
  session_id: string;
  status: string;
}

/**
 * Create an SSE workspace status event in the format the TUI's SSE provider expects.
 * Returns the formatted event object matching the server's wire format.
 *
 * Server reference: apps/server/src/routes/workspaces.ts lines 464-472
 * SDK reference: packages/sdk/src/services/sse.ts SSEEvent interface
 */
export function createWorkspaceStatusEvent(
  workspaceId: string,
  status: string,
  eventId?: string,
): { type: string; data: string; id: string } {
  return {
    type: "workspace.status",
    data: JSON.stringify({ workspace_id: workspaceId, status }),
    id: eventId ?? `evt-${Date.now()}`,
  };
}

/**
 * Create an SSE workspace session status event.
 *
 * Server reference: apps/server/src/routes/workspaces.ts lines 504-512
 */
export function createSessionStatusEvent(
  sessionId: string,
  status: string,
  eventId?: string,
): { type: string; data: string; id: string } {
  return {
    type: "workspace.session",
    data: JSON.stringify({ session_id: sessionId, status }),
    id: eventId ?? `evt-${Date.now()}`,
  };
}

/**
 * Write SSE events to a file that the TUI's test SSE injection mechanism reads.
 *
 * The TUI, when CODEPLANE_SSE_INJECT_FILE is set, watches this file for new lines
 * and dispatches them through its SSEProvider as if they arrived over the network.
 *
 * Returns the file path and a cleanup function.
 */
export function createSSEInjectionFile(): {
  filePath: string;
  writeEvent: (event: { type: string; data: string; id: string }) => void;
  writeEvents: (events: Array<{ type: string; data: string; id: string }>) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "codeplane-sse-inject-"));
  const filePath = join(dir, "sse-events.jsonl");

  // Initialize with empty file
  writeFileSync(filePath, "");

  return {
    filePath,
    writeEvent(event) {
      const line = JSON.stringify(event) + "\n";
      appendFileSync(filePath, line);
    },
    writeEvents(events) {
      const lines = events.map((e) => JSON.stringify(e) + "\n").join("");
      appendFileSync(filePath, lines);
    },
    cleanup() {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort
      }
    },
  };
}

/**
 * Convenience: launch TUI with SSE injection enabled and return the terminal + injection handle.
 */
export async function launchTUIWithSSEInjection(
  options?: WorkspaceContextOptions,
): Promise<{
  terminal: TUITestInstance;
  sse: ReturnType<typeof createSSEInjectionFile>;
}> {
  const sse = createSSEInjectionFile();

  const terminal = await launchTUIWithWorkspaceContext({
    ...options,
    env: {
      ...options?.env,
      CODEPLANE_SSE_INJECT_FILE: sse.filePath,
    },
  });

  return { terminal, sse };
}
```

**Design rationale:**
- **File-based injection, not mock server.** The test philosophy prohibits mocking implementation details. However, SSE is a transport mechanism, not business logic. The injection mechanism is a test-only code path in the TUI's SSEProvider that reads events from a file when `CODEPLANE_SSE_INJECT_FILE` is set.
- **JSONL format** (one JSON object per line) is used because it's append-friendly and trivially parseable.
- The event type field (`"workspace.status"`, `"workspace.session"`) is the channel key used by the SSEProvider's subscriber dispatch.
- **Top-level ESM imports**: Uses `import { appendFileSync, rmSync } from "node:fs"` rather than inline `require()` calls. The spec reference implementation at `specs/tui/e2e/tui/helpers/workspaces.ts:232-233` uses `require("node:fs")` inside closures — the production implementation MUST use top-level ESM imports instead since the codebase is Bun-native ESM. This is a known improvement over the spec reference.
- The `launchTUIWithSSEInjection()` convenience function combines workspace context launching with SSE injection setup, reducing boilerplate in test files.
- The default event ID uses `Date.now()` for uniqueness in tests that don't care about the ID. Tests requiring deterministic IDs pass an explicit `eventId` parameter.

### 3.5 `assertWorkspaceRow()`

This helper asserts the content of a workspace list row at a specific line number in the terminal buffer. It parses the line and matches against expected fields, ignoring ANSI escape codes for comparison.

```typescript
export interface WorkspaceRowExpectation {
  /** Workspace name (partial match). */
  name?: string;
  /** Status text (exact match after normalization). */
  status?: string;
  /** Whether the row is focused (reverse video ANSI code present). */
  focused?: boolean;
  /** SSH host text (partial match). */
  sshHost?: string;
  /** Any additional text that should appear on the row. */
  contains?: string;
  /** Any text that should NOT appear on the row. */
  notContains?: string;
}

/**
 * Strip ANSI escape codes from a string for content comparison.
 * Covers standard SGR sequences (colors, bold, italic, etc.).
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Check if a string contains reverse video ANSI escape (focused row indicator).
 * Per TUI design spec: focused rows use reverse video (\x1b[7m).
 */
export function hasReverseVideo(str: string): boolean {
  return str.includes("\x1b[7m");
}

/**
 * Assert that a workspace list row at the given line number matches expectations.
 *
 * @param terminal - The TUI test instance
 * @param lineNumber - 0-indexed line number in the terminal buffer
 * @param expected - Expected content fields
 * @throws Error with descriptive message if assertion fails
 */
export function assertWorkspaceRow(
  terminal: TUITestInstance,
  lineNumber: number,
  expected: WorkspaceRowExpectation,
): void {
  const rawLine = terminal.getLine(lineNumber);
  const cleanLine = stripAnsi(rawLine);

  if (expected.name !== undefined) {
    if (!cleanLine.includes(expected.name)) {
      throw new Error(
        `assertWorkspaceRow(line ${lineNumber}): expected name "${expected.name}" not found.\n` +
        `Line content: "${cleanLine}"`
      );
    }
  }

  if (expected.status !== undefined) {
    const normalizedStatus = expected.status.toLowerCase();
    if (!cleanLine.toLowerCase().includes(normalizedStatus)) {
      throw new Error(
        `assertWorkspaceRow(line ${lineNumber}): expected status "${expected.status}" not found.\n` +
        `Line content: "${cleanLine}"`
      );
    }
  }

  if (expected.focused !== undefined) {
    const isFocused = hasReverseVideo(rawLine);
    if (expected.focused !== isFocused) {
      throw new Error(
        `assertWorkspaceRow(line ${lineNumber}): expected focused=${expected.focused}, got ${isFocused}.\n` +
        `Raw line: "${rawLine}"`
      );
    }
  }

  if (expected.sshHost !== undefined) {
    if (!cleanLine.includes(expected.sshHost)) {
      throw new Error(
        `assertWorkspaceRow(line ${lineNumber}): expected SSH host "${expected.sshHost}" not found.\n` +
        `Line content: "${cleanLine}"`
      );
    }
  }

  if (expected.contains !== undefined) {
    if (!cleanLine.includes(expected.contains)) {
      throw new Error(
        `assertWorkspaceRow(line ${lineNumber}): expected text "${expected.contains}" not found.\n` +
        `Line content: "${cleanLine}"`
      );
    }
  }

  if (expected.notContains !== undefined) {
    if (cleanLine.includes(expected.notContains)) {
      throw new Error(
        `assertWorkspaceRow(line ${lineNumber}): unexpected text "${expected.notContains}" found.\n` +
        `Line content: "${cleanLine}"`
      );
    }
  }
}
```

**Design rationale:**
- **ANSI stripping** for content assertions because the workspace list renders with color codes (status badges use semantic color tokens from the theme). Tests validate semantic content, not ANSI sequences.
- **Raw ANSI preserved** for `focused` check because reverse video (`\x1b[7m`) is the standard focus indicator per the TUI design spec (Section 5.1: "Focused row highlighted with reverse video").
- **Partial matching** for `name`, `sshHost`, and `contains` because column alignment and truncation vary by terminal width. At 80-column minimum, text may be truncated.
- **Case-insensitive status matching** because the UI may capitalize status text (e.g., "Running" vs "running"). The `WorkspaceStatusBadge` component (tested in `e2e/tui/workspaces.test.ts:27`) confirms labels are capitalized (e.g., `cfg.label === "Running"`).
- **Error messages include the actual line content** for debuggability — matching the error pattern used by `waitForText()` in `helpers.ts:384-385` and `getLine()` in `helpers.ts:413`.
- The function throws rather than returning boolean to integrate naturally with Bun's test runner — failed assertions produce descriptive stack traces.

---

## 4. Implementation Plan

### Step 1: Implement file-based SSE injection in SSEProvider

**File:** `apps/tui/src/providers/SSEProvider.tsx`

The current SSEProvider is a minimal stub (17 lines — context/null provider returning `null`). It needs the file-based injection code path added for test support.

**Current state** (from `apps/tui/src/providers/SSEProvider.tsx`):
```typescript
import { createContext, useContext } from "react";

export interface SSEEvent {
  type: string;
  data: any;
}

const SSEContext = createContext<null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  return <SSEContext.Provider value={null}>{children}</SSEContext.Provider>;
}

export function useSSE(channel: string) {
  return null;
}
```

**Required modifications:**

1. Expand `SSEContext` value type to include `connectionState` and `subscribe` method
2. Add file-based injection code path guarded by `process.env.NODE_ENV === "test"` AND `process.env.CODEPLANE_SSE_INJECT_FILE`
3. The injection path uses `setInterval(100)` to poll the JSONL file for new bytes, parses them as SSE events, and dispatches to channel subscribers
4. Add subscriber registry: `Map<string, Set<(event: SSEEvent) => void>>` keyed by event type
5. Add `useSSEChannel(channel, handler)` hook for screens to subscribe to specific event types
6. Add cleanup on unmount (clear interval, remove file watcher)

**Expanded SSEProvider shape:**

```typescript
import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { readFileSync, statSync, existsSync } from "node:fs";

export interface SSEEvent {
  type: string;
  data: string;
  id?: string;
}

interface SSEContextValue {
  connectionState: "connecting" | "connected" | "reconnecting" | "disconnected";
  subscribe: (channel: string, handler: (event: SSEEvent) => void) => () => void;
}

const SSEContext = createContext<SSEContextValue | null>(null);

export function SSEProvider({ children }: { children: React.ReactNode }) {
  const subscribersRef = useRef<Map<string, Set<(event: SSEEvent) => void>>>(new Map());
  const [connectionState, setConnectionState] = useState<SSEContextValue["connectionState"]>("connecting");

  const subscribe = useCallback((channel: string, handler: (event: SSEEvent) => void) => {
    if (!subscribersRef.current.has(channel)) {
      subscribersRef.current.set(channel, new Set());
    }
    subscribersRef.current.get(channel)!.add(handler);
    return () => {
      subscribersRef.current.get(channel)?.delete(handler);
    };
  }, []);

  const dispatch = useCallback((event: SSEEvent) => {
    const handlers = subscribersRef.current.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }, []);

  // ── Test-only SSE injection ──────────────────────────────────────────────
  // When NODE_ENV=test and CODEPLANE_SSE_INJECT_FILE is set, this provider
  // reads SSE events from a JSONL file instead of opening an EventSource.
  // This enables E2E tests to inject workspace status events without a
  // real PostgreSQL LISTEN/NOTIFY backend.
  // See: e2e/tui/helpers/workspaces.ts — createSSEInjectionFile()
  useEffect(() => {
    const injectFile = process.env.CODEPLANE_SSE_INJECT_FILE;
    if (process.env.NODE_ENV !== "test" || !injectFile) return;

    let lastSize = 0;
    setConnectionState("connected");

    const interval = setInterval(() => {
      try {
        if (!existsSync(injectFile)) return;
        const stat = statSync(injectFile);
        if (stat.size <= lastSize) return;

        const content = readFileSync(injectFile, "utf-8");
        const newContent = content.slice(lastSize);
        lastSize = stat.size;

        const lines = newContent.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as SSEEvent;
            dispatch(event);
          } catch {
            // Ignore malformed lines
          }
        }
      } catch {
        // Ignore read errors
      }
    }, 100);

    return () => clearInterval(interval);
  }, [dispatch]);

  const value: SSEContextValue = { connectionState, subscribe };

  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export function useSSE() {
  const ctx = useContext(SSEContext);
  return ctx ?? { connectionState: "disconnected" as const, subscribe: () => () => {} };
}

export function useSSEChannel(channel: string, handler: (event: SSEEvent) => void) {
  const { subscribe } = useSSE();
  useEffect(() => {
    return subscribe(channel, handler);
  }, [channel, handler, subscribe]);
}
```

**Guard for production:**
- The injection path only activates when `process.env.NODE_ENV === "test"` AND `process.env.CODEPLANE_SSE_INJECT_FILE` is set. Both conditions must be true.
- Production builds dead-code-eliminate this path when built with `NODE_ENV=production`.
- The `node:fs` imports are used only inside the effect — if dead-code elimination does not remove them, they are still safe as they are no-ops without the env var.

**Acceptance criteria:**
- `useSSE()` returns `{ connectionState, subscribe }` (not `null`)
- `useSSEChannel(channel, handler)` subscribes and auto-unsubscribes on unmount
- When `CODEPLANE_SSE_INJECT_FILE` is set in test mode, events written to the file appear dispatched within ~200ms
- When env vars are not set, no file watching occurs — normal SSE behavior unchanged

### Step 2: Create the helpers directory and workspace helpers file

**File:** `e2e/tui/helpers/workspaces.ts`

1. Create `e2e/tui/helpers/` directory
2. Create `workspaces.ts` with all exports from Section 3
3. All imports use top-level ESM: `import { appendFileSync } from "node:fs"` (NOT `require("node:fs")`)
4. Import `launchTUI`, `TUITestInstance`, `LaunchTUIOptions` from `"../helpers.js"`
5. Import `Workspace` type from `"@codeplane/ui-core"`

**Full export list:**
- `WORKSPACE_IDS` — const object with deterministic UUIDs
- `WORKSPACE_FIXTURES` — const record of all 6 workspace state fixtures
- `WorkspaceFixtureName` — type union
- `createWorkspaceFixture()` — builder function
- `WorkspaceContextOptions` — interface
- `launchTUIWithWorkspaceContext()` — async function
- `StatusTransitionOptions` — interface
- `waitForStatusTransition()` — async function
- `SSEStatusEvent` — interface
- `SSESessionStatusEvent` — interface
- `createWorkspaceStatusEvent()` — function
- `createSessionStatusEvent()` — function
- `createSSEInjectionFile()` — function
- `launchTUIWithSSEInjection()` — async function
- `WorkspaceRowExpectation` — interface
- `assertWorkspaceRow()` — function
- `stripAnsi()` — function (exported for reuse by other helper modules)
- `hasReverseVideo()` — function (exported for reuse)

**Acceptance criteria:**
- File compiles with `bun build --dry-run`
- All types align with `Workspace` from `@codeplane/ui-core` (not `WorkspaceResponse` from SDK)
- All fixture IDs are deterministic (no `Date.now()`, no `Math.random()`)
- `launchTUIWithWorkspaceContext()` delegates to `launchTUI()` from `../helpers.ts`
- Uses top-level ESM imports throughout

### Step 3: Create barrel export

**File:** `e2e/tui/helpers/index.ts`

```typescript
export * from "./workspaces.js";
```

This barrel allows clean imports: `import { WORKSPACE_FIXTURES } from "./helpers/workspaces.js"` or bulk import via `import * from "./helpers/index.js"`. Follows the established pattern from `specs/tui/e2e/tui/helpers/index.ts` which also re-exports from `workspaces.js` and `workflows.js`.

### Step 4: Create unit tests for helpers

**File:** `e2e/tui/helpers/__tests__/workspaces.test.ts`

Unit tests for the helper functions themselves. These validate determinism, type correctness, and assertion behavior before the helpers are used in feature tests. See Section 5 for full test specifications.

### Step 5: Validate integration with existing workspace test file

**File:** `e2e/tui/workspaces.test.ts` (modification)

The existing `e2e/tui/workspaces.test.ts` tests the `WorkspaceStatusBadge` component directly via dynamic imports. Add a new `describe` block that imports and exercises the workspace helpers against a real TUI process. These tests will fail if the workspace screen is not implemented — that is by design per the testing philosophy.

---

## 5. Unit & Integration Tests

**File:** `e2e/tui/helpers/__tests__/workspaces.test.ts`

Tests for the helpers themselves. These validate the helper functions work correctly before they are used in feature tests.

### 5.1 Fixture Tests

```typescript
import { describe, test, expect } from "bun:test";
import {
  WORKSPACE_FIXTURES,
  WORKSPACE_IDS,
  createWorkspaceFixture,
  type WorkspaceFixtureName,
} from "../workspaces.js";

describe("Workspace Test Fixtures", () => {

  test("FIX-001: all fixture IDs are unique UUIDs", () => {
    const ids = Object.values(WORKSPACE_IDS);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const id of ids) {
      expect(id).toMatch(uuidRegex);
    }
  });

  test("FIX-002: all fixture statuses match their key name", () => {
    const keys: WorkspaceFixtureName[] = ["running", "suspended", "starting", "failed", "pending", "stopped"];
    for (const key of keys) {
      expect(WORKSPACE_FIXTURES[key].status).toBe(key);
    }
  });

  test("FIX-003: running fixture has ssh_host set", () => {
    expect(WORKSPACE_FIXTURES.running.ssh_host).toBeDefined();
    expect(WORKSPACE_FIXTURES.running.ssh_host).not.toBe("");
  });

  test("FIX-004: suspended fixture has suspended_at set", () => {
    expect(WORKSPACE_FIXTURES.suspended.suspended_at).not.toBeNull();
    expect(WORKSPACE_FIXTURES.suspended.suspended_at).toBe("2026-01-15T11:00:00.000Z");
  });

  test("FIX-005: non-suspended fixtures have suspended_at as null", () => {
    for (const key of ["running", "starting", "failed", "pending", "stopped"] as const) {
      expect(WORKSPACE_FIXTURES[key].suspended_at).toBeNull();
    }
  });

  test("FIX-006: all fixtures share the same repository_id and user_id", () => {
    for (const fixture of Object.values(WORKSPACE_FIXTURES)) {
      expect(fixture.repository_id).toBe(42);
      expect(fixture.user_id).toBe(1);
    }
  });

  test("FIX-007: all fixture timestamps are deterministic ISO 8601", () => {
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    for (const fixture of Object.values(WORKSPACE_FIXTURES)) {
      expect(fixture.created_at).toMatch(isoRegex);
      expect(fixture.updated_at).toMatch(isoRegex);
    }
  });

  test("FIX-008: createWorkspaceFixture produces valid Workspace with overrides", () => {
    const custom = createWorkspaceFixture({
      id: "custom-uuid-1234-5678-9abc-def012345678",
      name: "custom-workspace",
      status: "running",
      ssh_host: "custom.host.test",
    });
    expect(custom.id).toBe("custom-uuid-1234-5678-9abc-def012345678");
    expect(custom.name).toBe("custom-workspace");
    expect(custom.status).toBe("running");
    expect(custom.ssh_host).toBe("custom.host.test");
    expect(custom.repository_id).toBe(42);
  });

  test("FIX-009: createWorkspaceFixture overrides take precedence over defaults", () => {
    const custom = createWorkspaceFixture({
      name: "override-test",
      status: "failed",
      repository_id: 99,
      user_id: 7,
    });
    expect(custom.repository_id).toBe(99);
    expect(custom.user_id).toBe(7);
  });

  test("FIX-010: all fixtures have required Workspace fields", () => {
    const requiredFields: (keyof typeof WORKSPACE_FIXTURES.running)[] = [
      "id", "repository_id", "user_id", "name", "status",
      "is_fork", "freestyle_vm_id", "persistence",
      "idle_timeout_seconds", "created_at", "updated_at",
    ];
    for (const fixture of Object.values(WORKSPACE_FIXTURES)) {
      for (const field of requiredFields) {
        expect(fixture).toHaveProperty(field as string);
      }
    }
  });

  test("FIX-011: only running fixture has ssh_host, others do not", () => {
    expect(WORKSPACE_FIXTURES.running.ssh_host).toBeDefined();
    for (const key of ["suspended", "starting", "failed", "pending", "stopped"] as const) {
      expect(WORKSPACE_FIXTURES[key].ssh_host).toBeUndefined();
    }
  });

  test("FIX-012: fixture count matches WorkspaceFixtureName union", () => {
    const fixtureKeys = Object.keys(WORKSPACE_FIXTURES);
    expect(fixtureKeys).toHaveLength(6);
    expect(fixtureKeys.sort()).toEqual(
      ["failed", "pending", "running", "starting", "stopped", "suspended"]
    );
  });
});
```

### 5.2 SSE Event Construction Tests

```typescript
import { describe, test, expect } from "bun:test";
import {
  createWorkspaceStatusEvent,
  createSessionStatusEvent,
} from "../workspaces.js";

describe("SSE Event Construction", () => {

  test("SSE-001: createWorkspaceStatusEvent produces correct wire format", () => {
    const event = createWorkspaceStatusEvent("abc-123", "running");
    expect(event.type).toBe("workspace.status");
    const data = JSON.parse(event.data);
    expect(data.workspace_id).toBe("abc-123");
    expect(data.status).toBe("running");
  });

  test("SSE-002: createWorkspaceStatusEvent accepts custom event ID", () => {
    const event = createWorkspaceStatusEvent("abc-123", "suspended", "custom-id-42");
    expect(event.id).toBe("custom-id-42");
  });

  test("SSE-003: createSessionStatusEvent produces correct wire format", () => {
    const event = createSessionStatusEvent("session-456", "stopped");
    expect(event.type).toBe("workspace.session");
    const data = JSON.parse(event.data);
    expect(data.session_id).toBe("session-456");
    expect(data.status).toBe("stopped");
  });

  test("SSE-004: event data field is valid JSON", () => {
    const event = createWorkspaceStatusEvent("id-1", "failed");
    expect(() => JSON.parse(event.data)).not.toThrow();
  });

  test("SSE-005: event type matches server wire format", () => {
    const wsEvent = createWorkspaceStatusEvent("id", "running");
    expect(wsEvent.type).toBe("workspace.status");
    const sessEvent = createSessionStatusEvent("id", "running");
    expect(sessEvent.type).toBe("workspace.session");
  });

  test("SSE-006: default event ID starts with evt- prefix", () => {
    const event = createWorkspaceStatusEvent("id", "running");
    expect(event.id).toMatch(/^evt-\d+$/);
  });

  test("SSE-007: workspace and session events have distinct type fields", () => {
    const wsEvent = createWorkspaceStatusEvent("id", "running");
    const sessEvent = createSessionStatusEvent("id", "running");
    expect(wsEvent.type).not.toBe(sessEvent.type);
  });
});
```

### 5.3 SSE Injection File Tests

```typescript
import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createSSEInjectionFile,
  createWorkspaceStatusEvent,
} from "../workspaces.js";

describe("SSE Injection File", () => {

  test("SSE-INJ-001: createSSEInjectionFile creates file and returns path", () => {
    const { filePath, cleanup } = createSSEInjectionFile();
    try {
      expect(existsSync(filePath)).toBe(true);
      expect(filePath).toMatch(/sse-events\.jsonl$/);
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-002: writeEvent appends JSONL line to file", () => {
    const { filePath, writeEvent, cleanup } = createSSEInjectionFile();
    try {
      const event = createWorkspaceStatusEvent("ws-1", "running", "evt-1");
      writeEvent(event);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0])).toEqual(event);
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-003: writeEvents appends multiple JSONL lines", () => {
    const { filePath, writeEvents, cleanup } = createSSEInjectionFile();
    try {
      const events = [
        createWorkspaceStatusEvent("ws-1", "starting", "evt-1"),
        createWorkspaceStatusEvent("ws-1", "running", "evt-2"),
      ];
      writeEvents(events);
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).id).toBe("evt-1");
      expect(JSON.parse(lines[1]).id).toBe("evt-2");
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-004: cleanup removes the temp directory", () => {
    const { filePath, cleanup } = createSSEInjectionFile();
    cleanup();
    expect(existsSync(filePath)).toBe(false);
  });

  test("SSE-INJ-005: multiple writeEvent calls append sequentially", () => {
    const { filePath, writeEvent, cleanup } = createSSEInjectionFile();
    try {
      writeEvent(createWorkspaceStatusEvent("ws-1", "pending", "evt-1"));
      writeEvent(createWorkspaceStatusEvent("ws-1", "starting", "evt-2"));
      writeEvent(createWorkspaceStatusEvent("ws-1", "running", "evt-3"));
      const lines = readFileSync(filePath, "utf-8").trim().split("\n");
      expect(lines.length).toBe(3);
      const statuses = lines.map((l) => JSON.parse(JSON.parse(l).data).status);
      expect(statuses).toEqual(["pending", "starting", "running"]);
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-006: file is created in system temp directory", () => {
    const { filePath, cleanup } = createSSEInjectionFile();
    try {
      expect(filePath.startsWith(tmpdir())).toBe(true);
    } finally {
      cleanup();
    }
  });

  test("SSE-INJ-007: initial file is empty", () => {
    const { filePath, cleanup } = createSSEInjectionFile();
    try {
      const content = readFileSync(filePath, "utf-8");
      expect(content).toBe("");
    } finally {
      cleanup();
    }
  });
});
```

### 5.4 assertWorkspaceRow and String Utility Tests

```typescript
import { describe, test, expect } from "bun:test";
import { stripAnsi, hasReverseVideo, assertWorkspaceRow } from "../workspaces.js";
import type { TUITestInstance } from "../../helpers.js";

describe("String Utilities", () => {

  test("UTIL-001: stripAnsi removes color codes", () => {
    expect(stripAnsi("\x1b[32mgreen\x1b[0m")).toBe("green");
  });

  test("UTIL-002: stripAnsi preserves plain text", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  test("UTIL-003: stripAnsi handles multiple escape sequences", () => {
    expect(stripAnsi("\x1b[1m\x1b[34mbold blue\x1b[0m text")).toBe("bold blue text");
  });

  test("UTIL-004: hasReverseVideo detects \\x1b[7m", () => {
    expect(hasReverseVideo("\x1b[7mfocused\x1b[0m")).toBe(true);
    expect(hasReverseVideo("not focused")).toBe(false);
  });

  test("UTIL-005: stripAnsi handles combined SGR parameters", () => {
    // e.g., \x1b[1;32m for bold green
    expect(stripAnsi("\x1b[1;32mbold green\x1b[0m")).toBe("bold green");
  });

  test("UTIL-006: stripAnsi handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });

  test("UTIL-007: hasReverseVideo returns false for empty string", () => {
    expect(hasReverseVideo("")).toBe(false);
  });
});

describe("assertWorkspaceRow", () => {

  function mockTerminal(lines: string[]): TUITestInstance {
    return {
      getLine: (n: number) => {
        if (n < 0 || n >= lines.length) throw new Error(`Line ${n} out of range`);
        return lines[n];
      },
    } as unknown as TUITestInstance;
  }

  test("ASSERT-001: passes when name matches", () => {
    const terminal = mockTerminal(["  \x1b[32mdev-environment\x1b[0m   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { name: "dev-environment" })).not.toThrow();
  });

  test("ASSERT-002: throws when name does not match", () => {
    const terminal = mockTerminal(["  dev-environment   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { name: "staging-env" })).toThrow(/expected name.*staging-env/);
  });

  test("ASSERT-003: passes when status matches (case insensitive)", () => {
    const terminal = mockTerminal(["  dev-environment   \x1b[32mRunning\x1b[0m"]);
    expect(() => assertWorkspaceRow(terminal, 0, { status: "running" })).not.toThrow();
  });

  test("ASSERT-004: detects focused row via reverse video", () => {
    const terminal = mockTerminal(["\x1b[7m  dev-environment   running\x1b[0m"]);
    expect(() => assertWorkspaceRow(terminal, 0, { focused: true })).not.toThrow();
    expect(() => assertWorkspaceRow(terminal, 0, { focused: false })).toThrow(/expected focused=false/);
  });

  test("ASSERT-005: passes when contains text is present", () => {
    const terminal = mockTerminal(["  dev-environment   running   ws-host.test"]);
    expect(() => assertWorkspaceRow(terminal, 0, { contains: "ws-host" })).not.toThrow();
  });

  test("ASSERT-006: passes when notContains text is absent", () => {
    const terminal = mockTerminal(["  dev-environment   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { notContains: "ssh_host" })).not.toThrow();
  });

  test("ASSERT-007: throws when notContains text is present", () => {
    const terminal = mockTerminal(["  dev-environment   running   ssh_host"]);
    expect(() => assertWorkspaceRow(terminal, 0, { notContains: "ssh_host" })).toThrow(/unexpected text/);
  });

  test("ASSERT-008: multiple expectations are checked in single call", () => {
    const terminal = mockTerminal(["\x1b[7m  dev-environment   \x1b[32mrunning\x1b[0m"]);
    expect(() =>
      assertWorkspaceRow(terminal, 0, {
        name: "dev-environment",
        status: "running",
        focused: true,
      }),
    ).not.toThrow();
  });

  test("ASSERT-009: error message includes actual line content", () => {
    const terminal = mockTerminal(["actual content here"]);
    try {
      assertWorkspaceRow(terminal, 0, { name: "missing" });
      expect.unreachable("should have thrown");
    } catch (e: unknown) {
      expect((e as Error).message).toContain("actual content here");
    }
  });

  test("ASSERT-010: sshHost matches partial text", () => {
    const terminal = mockTerminal(["  dev-environment   running   ws-a1b2c3d4.codeplane.test"]);
    expect(() => assertWorkspaceRow(terminal, 0, { sshHost: "ws-a1b2c3d4" })).not.toThrow();
    expect(() => assertWorkspaceRow(terminal, 0, { sshHost: "codeplane.test" })).not.toThrow();
  });

  test("ASSERT-011: sshHost throws when not found", () => {
    const terminal = mockTerminal(["  dev-environment   running"]);
    expect(() => assertWorkspaceRow(terminal, 0, { sshHost: "ws-host" })).toThrow(/expected SSH host/);
  });
});
```

### 5.5 E2E Integration Tests (in `e2e/tui/workspaces.test.ts`)

These tests validate the helpers work correctly in the full TUI E2E context. They run against a real TUI process and **will fail if the workspace screen is not implemented** — that is by design per the testing philosophy (PRD Section 7.3, Architecture doc Testing Philosophy principle 1).

These are added as a new `describe` block in the existing `e2e/tui/workspaces.test.ts`, alongside the existing `TUI_WORKSPACES — WorkspaceStatusBadge` tests:

```typescript
import { describe, test, expect } from "bun:test";
import {
  WORKSPACE_FIXTURES,
  launchTUIWithWorkspaceContext,
  waitForStatusTransition,
  launchTUIWithSSEInjection,
  createWorkspaceStatusEvent,
  assertWorkspaceRow,
} from "./helpers/workspaces.js";

describe("TUI_WORKSPACES — Workspace E2E Helper Integration", () => {

  test("HELPER-INT-001: launchTUIWithWorkspaceContext reaches workspace list screen", async () => {
    const terminal = await launchTUIWithWorkspaceContext();
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("HELPER-INT-002: launchTUIWithWorkspaceContext at 80x24 minimum size", async () => {
    const terminal = await launchTUIWithWorkspaceContext({ cols: 80, rows: 24 });
    await terminal.waitForText("Workspaces");
    expect(terminal.snapshot()).toMatchSnapshot();
    await terminal.terminate();
  });

  test("HELPER-INT-003: launchTUIWithWorkspaceContext with custom repo", async () => {
    const terminal = await launchTUIWithWorkspaceContext({ repo: "testorg/testrepo" });
    await terminal.waitForText("Workspaces");
    await terminal.terminate();
  });

  test("HELPER-INT-004: launchTUIWithSSEInjection sets up SSE injection", async () => {
    const { terminal, sse } = await launchTUIWithSSEInjection();
    sse.writeEvent(
      createWorkspaceStatusEvent(WORKSPACE_FIXTURES.running.id, "suspended"),
    );
    await terminal.waitForText("suspended", 5000);
    await terminal.terminate();
    sse.cleanup();
  });

  test("HELPER-INT-005: waitForStatusTransition detects running→suspended", async () => {
    const { terminal, sse } = await launchTUIWithSSEInjection();
    await terminal.waitForText("running");
    sse.writeEvent(
      createWorkspaceStatusEvent(WORKSPACE_FIXTURES.running.id, "suspended"),
    );
    await waitForStatusTransition(terminal, "running", "suspended", { timeoutMs: 10_000 });
    await terminal.terminate();
    sse.cleanup();
  });

  test("HELPER-INT-006: assertWorkspaceRow validates first list row", async () => {
    const terminal = await launchTUIWithWorkspaceContext();
    await terminal.waitForText("Workspaces");
    // Row 2 is first data row (row 0 = header bar, row 1 = column headers)
    assertWorkspaceRow(terminal, 2, { status: "running" });
    await terminal.terminate();
  });
});
```

**Note on HELPER-INT tests:** These tests launch real TUI processes and require the workspace screen implementation to be present. Per the testing philosophy: "Tests that fail due to unimplemented backend features are left failing. They are never skipped or commented out." If the workspace list screen is not yet implemented, these tests will fail — that is the expected state.

---

## 6. Productionization Notes

### 6.1 SSE Injection Mechanism

The `CODEPLANE_SSE_INJECT_FILE` code path in `SSEProvider.tsx` is a test-only feature. To prevent accidental use in production:

1. **Guard with `NODE_ENV` check**: The injection path only activates when `process.env.NODE_ENV === "test"` AND `CODEPLANE_SSE_INJECT_FILE` is set. Both conditions must be true.
2. **Log a warning**: When the injection path activates, log `"[SSEProvider] Using file-based SSE injection (test mode)"` to stderr.
3. **Dead-code elimination**: Production builds should eliminate the injection code path. The `process.env.NODE_ENV === "test"` check enables Bun/bundler dead-code elimination when building with `NODE_ENV=production`.
4. **No runtime overhead**: When the env var is not set, the `if` branch is never entered. The normal EventSource code path has zero additional overhead.

### 6.2 Fixture Stability

Fixtures use hardcoded UUIDs and timestamps. If `Workspace` in `@codeplane/ui-core` adds new required fields, fixtures must be updated. Test `FIX-010` catches this — TypeScript will produce a compile error if `FIXTURE_DEFAULTS` is missing a required field (since `FIXTURE_DEFAULTS` is typed as `Omit<Workspace, "id" | "name" | "status" | "suspended_at">`), and the test will fail at runtime if any required property is missing from the fixture objects.

### 6.3 `stripAnsi()` Limitations

The regex (`/\x1b\[[0-9;]*[a-zA-Z]/g`) covers standard SGR sequences (colors, bold, italic, underline, reverse video, reset) but does **not** cover:
- OSC sequences (`\x1b]...\x07`)
- DCS sequences (`\x1bP...\x1b\\`)
- Hyperlink sequences (`\x1b]8;;...\x1b\\`)
- Kitty graphics protocol sequences

Per the TUI design spec (Section 3.3: "No images, no bitmap rendering, no sixel") and the constraint that OpenTUI uses standard ANSI rendering, SGR coverage is sufficient. If OpenTUI introduces OSC or DCS sequences in the future, `stripAnsi()` must be extended.

### 6.4 Performance Considerations

- `waitForStatusTransition()` polls every 100ms by default — do not reduce below 50ms to avoid CPU spin on CI.
- `createSSEInjectionFile()` creates files in the system temp directory. The SSEProvider reads these with a 100ms `setInterval`. Events written to the file appear within ~200ms (one poll cycle + dispatch overhead).
- Each E2E test launches a fresh TUI process. No shared state between tests. Process cleanup (`terminal.terminate()`) and file cleanup (`sse.cleanup()`) must be called in every test to prevent resource leaks.
- The `createSSEInjectionFile` temp directories use `mkdtempSync` which creates unique directories — parallel test execution is safe.

### 6.5 Import Pattern Fix: `require()` → ESM

The spec reference at `specs/tui/e2e/tui/helpers/workspaces.ts:232-233` uses inline `require("node:fs")` inside the `writeEvent` and `writeEvents` closures. The production implementation MUST replace these with top-level ESM imports:

```typescript
// ❌ Spec reference (non-idiomatic)
writeEvent(event) {
  const { appendFileSync } = require("node:fs");
  appendFileSync(filePath, line);
}

// ✅ Production implementation (ESM)
import { appendFileSync } from "node:fs";
// ... then use directly in closure:
writeEvent(event) {
  appendFileSync(filePath, JSON.stringify(event) + "\n");
}
```

The same applies to the `workspace-sse.ts` helper at `specs/tui/e2e/tui/helpers/workspace-sse.ts:43` which uses `require("fs")` instead of `import from "node:fs"`.

### 6.6 Migration Path

Once these helpers are available, existing workspace tests should migrate to use them. The migration is additive — existing tests in `e2e/tui/workspaces.test.ts` continue to work with `launchTUI()`, but new tests should prefer `launchTUIWithWorkspaceContext()` for:
- Reduced boilerplate (no manual `--screen` and `--repo` arg construction)
- Consistent default terminal dimensions (120×40)
- Built-in ready-state waiting
- Composability with SSE injection via `launchTUIWithSSEInjection()`

### 6.7 Import Pattern for Downstream Tests

```typescript
// Preferred: direct module import
import { WORKSPACE_FIXTURES, launchTUIWithWorkspaceContext } from "./helpers/workspaces.js";

// Also valid: barrel import
import { WORKSPACE_FIXTURES, launchTUIWithWorkspaceContext } from "./helpers/index.js";

// Base helpers still imported directly
import { launchTUI } from "./helpers.js";
```

---

## 7. Export Summary

| Export | Kind | Description |
|--------|------|-------------|
| `WORKSPACE_IDS` | `const` | Deterministic UUID map keyed by fixture name |
| `WORKSPACE_FIXTURES` | `const` | Pre-built `Workspace` objects for all 6 states |
| `WorkspaceFixtureName` | `type` | Union: `"running" \| "suspended" \| "starting" \| "failed" \| "pending" \| "stopped"` |
| `createWorkspaceFixture()` | `function` | Builder for custom one-off fixtures with type-safe status |
| `WorkspaceContextOptions` | `interface` | Options for `launchTUIWithWorkspaceContext()` |
| `launchTUIWithWorkspaceContext()` | `async function` | Launch TUI navigated to workspace screen with repo context |
| `StatusTransitionOptions` | `interface` | Options for `waitForStatusTransition()` |
| `waitForStatusTransition()` | `async function` | Two-phase wait for SSE-driven status text change |
| `SSEStatusEvent` | `interface` | Workspace status event payload shape |
| `SSESessionStatusEvent` | `interface` | Session status event payload shape |
| `createWorkspaceStatusEvent()` | `function` | Construct workspace status SSE event matching server wire format |
| `createSessionStatusEvent()` | `function` | Construct session status SSE event matching server wire format |
| `createSSEInjectionFile()` | `function` | Create temp JSONL file for SSE event injection |
| `launchTUIWithSSEInjection()` | `async function` | Launch TUI with SSE injection enabled |
| `WorkspaceRowExpectation` | `interface` | Expected fields for `assertWorkspaceRow()` |
| `assertWorkspaceRow()` | `function` | Assert workspace list row content with ANSI-aware matching |
| `stripAnsi()` | `function` | Remove ANSI escape codes from string |
| `hasReverseVideo()` | `function` | Check for reverse video ANSI code (focus indicator) |

---

## 8. Dependency Graph

```
e2e/tui/helpers/workspaces.ts
  ├── imports from: e2e/tui/helpers.ts (launchTUI, TUITestInstance, LaunchTUIOptions)
  ├── imports from: @codeplane/ui-core (Workspace type)
  ├── imports from: node:fs (writeFileSync, mkdtempSync, appendFileSync, rmSync)
  ├── imports from: node:path (join)
  └── imports from: node:os (tmpdir)

e2e/tui/helpers/index.ts
  └── re-exports from: e2e/tui/helpers/workspaces.ts

e2e/tui/helpers/__tests__/workspaces.test.ts
  ├── imports from: e2e/tui/helpers/workspaces.ts (all helpers)
  ├── imports from: e2e/tui/helpers.ts (TUITestInstance type)
  ├── imports from: node:fs (readFileSync, existsSync)
  ├── imports from: node:os (tmpdir)
  └── imports from: bun:test (describe, test, expect)

e2e/tui/workspaces.test.ts (additions)
  ├── imports from: e2e/tui/helpers/workspaces.ts (all helpers)
  └── imports from: bun:test (describe, test, expect)

apps/tui/src/providers/SSEProvider.tsx (modified)
  ├── imports from: react (createContext, useContext, useEffect, useRef, useCallback, useState)
  ├── reads: CODEPLANE_SSE_INJECT_FILE env var (test-only code path)
  ├── reads: NODE_ENV env var (guard condition)
  └── imports from: node:fs (existsSync, statSync, readFileSync)
```

---

## 9. Cross-references to Existing Code

| Reference | Location | Relevance |
|-----------|----------|-----------|
| Base test helpers | `e2e/tui/helpers.ts` | `launchTUI()`, `TUITestInstance`, `LaunchTUIOptions`, `TERMINAL_SIZES` |
| Existing workspace tests | `e2e/tui/workspaces.test.ts` | `WorkspaceStatusBadge` tests that new helper tests sit alongside |
| Spec reference helpers | `specs/tui/e2e/tui/helpers/workspaces.ts` | Reference implementation (352 lines) with `require()` calls to fix |
| Spec reference SSE helpers | `specs/tui/e2e/tui/helpers/workspace-sse.ts` | Alternative SSE helper with `WorkspaceStatus` typed status param |
| Spec reference unit tests | `specs/tui/e2e/tui/helpers/__tests__/workspaces.test.ts` | Reference test suite (291 lines) |
| Spec reference barrel | `specs/tui/e2e/tui/helpers/index.ts` | Barrel re-export pattern |
| Workspace type definition | `specs/tui/packages/ui-core/src/types/workspaces.ts` | `Workspace`, `WorkspaceStatus`, `WorkspaceSession` types |
| SDK WorkspaceResponse | `packages/sdk/src/services/workspace.ts:60-76` | Server-side type with `status: string` |
| SDK SSEEvent | `packages/sdk/src/services/sse.ts:23-28` | `{ type?: string; data: string; id?: string }` |
| Server SSE routes | `apps/server/src/routes/workspaces.ts:447-522` | Wire format for workspace and session status events |
| Current SSEProvider | `apps/tui/src/providers/SSEProvider.tsx` | Minimal stub (17 lines) that needs expansion |
| Workflow helpers | `specs/tui/e2e/tui/helpers/workflows.ts` | Pattern reference for domain-specific helper modules |

---

## 10. Verification Checklist

- [ ] `e2e/tui/helpers/workspaces.ts` compiles with zero TypeScript errors
- [ ] All fixture IDs are unique and valid UUID v4 format
- [ ] All fixture timestamps are static (no `Date.now()`, no `new Date()`)
- [ ] `WORKSPACE_FIXTURES` type matches `Record<WorkspaceFixtureName, Workspace>` from `@codeplane/ui-core`
- [ ] `createWorkspaceFixture()` `status` param is typed as `Workspace["status"]`, not `string`
- [ ] SSE event `type` fields match server wire format: `"workspace.status"` and `"workspace.session"`
- [ ] SSE event `data` payloads match server format: `{ workspace_id, status }` and `{ session_id, status }`
- [ ] `createSSEInjectionFile()` uses top-level ESM imports (no inline `require()`)
- [ ] `launchTUIWithWorkspaceContext()` delegates to `launchTUI()` from base helpers
- [ ] `waitForStatusTransition()` Phase 1 timeout is capped at `min(timeout/3, 5000)`
- [ ] `assertWorkspaceRow()` strips ANSI for content checks but preserves for focus check
- [ ] All unit tests in `helpers/__tests__/workspaces.test.ts` pass
- [ ] E2E integration tests in `workspaces.test.ts` are present (may fail if backend not implemented — that is correct)
- [ ] `SSEProvider.tsx` expanded from stub to support `subscribe()`, `useSSEChannel()`, and file-based injection
- [ ] `SSEProvider.tsx` test injection path is guarded by both `NODE_ENV === "test"` and `CODEPLANE_SSE_INJECT_FILE`
- [ ] Barrel export at `e2e/tui/helpers/index.ts` re-exports workspace helpers
- [ ] No `require()` calls anywhere in production code — all ESM imports