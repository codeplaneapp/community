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
4. **`mockSSEStatusEvent()`** — injects SSE workspace status events into the test environment via file-based injection
5. **`assertWorkspaceRow()`** — asserts workspace list row content by line number

---

## 2. File Layout

```
e2e/tui/
├── helpers.ts                        # existing base test helpers (dependency: tui-e2e-test-infra)
├── helpers/
│   ├── index.ts                      # barrel re-export
│   ├── workspaces.ts                 # NEW — workspace-specific test helpers
│   └── __tests__/
│       └── workspaces.test.ts        # NEW — unit tests for workspace helpers
└── workspaces.test.ts                # existing test file — will import from helpers/workspaces.ts

apps/tui/src/
└── providers/
    └── SSEProvider.tsx               # MODIFIED — file-based SSE injection code path for tests
```

**Decision: separate file, not inline in helpers.ts.** The base `helpers.ts` is feature-agnostic and shared across all test files. Workspace helpers are domain-specific and should not pollute the base module. A `helpers/` subdirectory allows future feature-specific helper modules (e.g., `helpers/workflows.ts`, `helpers/issues.ts`) without growing the base file.

---

## 3. Detailed Design

### 3.1 Workspace Test Fixtures

**File:** `e2e/tui/helpers/workspaces.ts`

Fixtures provide pre-built `Workspace` objects matching the `Workspace` interface from `@codeplane/ui-core` (`packages/ui-core/src/types/workspaces.ts`). All values are deterministic — no `Date.now()`, no `Math.random()`, no `crypto.randomUUID()`. This ensures snapshot stability and test reproducibility.

**Important type note:** The fixtures use the `Workspace` type from `@codeplane/ui-core` (which has `status: WorkspaceStatus`), NOT the `WorkspaceResponse` type from `@codeplane/sdk` (which has `status: string`). The `Workspace` type is the canonical client-side representation consumed by TUI components via the shared data layer. The `WorkspaceStatus` union type enforces `"pending" | "starting" | "running" | "suspended" | "stopped" | "failed"` at the type level.

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
- The `running` fixture is the only one with `ssh_host` set, reflecting reality: SSH connection info is only available for running workspaces.

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
- The default `repo` is `"acme/api"` — a standardized test repository name used consistently across test files.
- `screen: "workspace-detail"` is supported for tests that navigate directly to a workspace detail view, passing the workspace ID via `--id`.
- `skipReady` exists for tests that intentionally test loading/error states and don't want the helper to wait for success text.
- The helper does not introduce new `TUITestInstance` methods — it returns the same interface from `helpers.ts`. This avoids a parallel type hierarchy.
- The `cols` and `rows` defaults (120×40) match the standard breakpoint from the design spec, ensuring tests run at the optimal layout by default.

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
- Phase 1 uses `min(timeout/3, 5000ms)` — it should not consume more than a third of the total timeout waiting for the initial state, and capped at 5 seconds.
- The helper is status-text-based, not ANSI-escape-based. It searches for human-readable status strings (e.g., `"running"`, `"suspended"`) that appear in the terminal buffer. Tests validate what the user sees, not implementation details.
- The `options` parameter uses an object (not positional `timeoutMs`) for forward compatibility — matching the pattern used in `helpers.ts`.
- Error messages include the terminal content snapshot for debuggability — directly mirroring the error pattern used by `waitForText()` in the base helpers.

### 3.4 `mockSSEStatusEvent()` / SSE Injection

This subsystem constructs SSE workspace status event payloads and injects them into the test environment via a file-based injection mechanism. The TUI reads `CODEPLANE_SSE_INJECT_FILE` at runtime to simulate incoming SSE events without a real PostgreSQL LISTEN/NOTIFY backend.

**Wire format alignment:** The SSE events constructed by these helpers match the exact format emitted by the server routes at `apps/server/src/routes/workspaces.ts` lines 464–472 (workspace status) and 504–512 (session status):

- **Workspace status**: `{ type: "workspace.status", data: JSON.stringify({ workspace_id, status }), id }` 
- **Session status**: `{ type: "workspace.session", data: JSON.stringify({ session_id, status }), id }`

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
 * Server reference: apps/server/src/routes/workspaces.ts (workspace status SSE stream)
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
 * Server reference: apps/server/src/routes/workspaces.ts (session status SSE stream)
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
 * (100ms poll interval in SSEProvider) and dispatches them through its SSEProvider
 * as if they arrived over the network.
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
- **JSONL format** (one JSON object per line) is used because it's append-friendly and trivially parseable. The SSEProvider's file watcher (100ms interval at `apps/tui/src/providers/SSEProvider.tsx` line 41) reads only new bytes since last check, then splits on newlines and JSON-parses each line.
- The event type field (`"workspace.status"`, `"workspace.session"`) is the channel key used by the SSEProvider's subscriber dispatch. The SSEProvider dispatches events to subscribers registered for that exact type string (line 60-63 of SSEProvider.tsx).
- `createWorkspaceStatusEvent()` and `createSessionStatusEvent()` match the exact wire format from the server's SSE routes.
- The default event ID uses `Date.now()` for uniqueness in tests that don't care about the ID. Tests requiring deterministic IDs pass an explicit `eventId` parameter.
- The `launchTUIWithSSEInjection()` convenience function combines workspace context launching with SSE injection setup, reducing boilerplate in test files.
- **Import style**: Uses top-level ESM imports (`import { appendFileSync, rmSync } from "node:fs"`) rather than inline `require()` calls. The codebase is Bun-native ESM.

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
- **Case-insensitive status matching** because the UI may capitalize status text (e.g., "Running" vs "running").
- **Error messages include the actual line content** for debuggability — matching the error pattern used throughout the base helpers.
- The function throws rather than returning boolean to integrate naturally with Bun's test runner — failed assertions produce descriptive stack traces.

---

## 4. Implementation Plan

### Step 1: Verify SSEProvider file-based injection support

**File:** `apps/tui/src/providers/SSEProvider.tsx` (verification)

The SSEProvider already contains the file-based injection code path. Verify that:

1. When `process.env.NODE_ENV === "test"` AND `process.env.CODEPLANE_SSE_INJECT_FILE` is set, the provider watches the file with a 100ms interval
2. New JSONL lines are parsed and dispatched to subscribers keyed by `event.type`
3. The watcher cleans up on unmount via the effect's cleanup function
4. Normal SSE behavior is completely unchanged when env vars are not set

**Current state:** Already implemented at `apps/tui/src/providers/SSEProvider.tsx` (96 lines). The file watcher uses `setInterval(100)`, reads only new bytes since `lastSize`, parses JSONL, and dispatches to channel subscribers. No modifications needed.

**Improvement needed:** The current implementation guards with `process.env.NODE_ENV === "test"`. Ensure the production build step dead-code-eliminates this path. Add a comment documenting this is test infrastructure:

```typescript
// ── Test-only SSE injection ──────────────────────────────────────────────
// When NODE_ENV=test and CODEPLANE_SSE_INJECT_FILE is set, this provider
// reads SSE events from a JSONL file instead of opening an EventSource.
// This enables E2E tests to inject workspace status events without a
// real PostgreSQL LISTEN/NOTIFY backend.
// See: e2e/tui/helpers/workspaces.ts — createSSEInjectionFile()
```

### Step 2: Create the helpers directory and workspace helpers file

**File:** `e2e/tui/helpers/workspaces.ts`

1. Create `e2e/tui/helpers/` directory (if not exists)
2. Create `workspaces.ts` with all exports:
   - `WORKSPACE_IDS` constant
   - `WORKSPACE_FIXTURES` record
   - `createWorkspaceFixture()` builder
   - `launchTUIWithWorkspaceContext()`
   - `waitForStatusTransition()`
   - `createWorkspaceStatusEvent()`
   - `createSessionStatusEvent()`
   - `createSSEInjectionFile()`
   - `launchTUIWithSSEInjection()`
   - `assertWorkspaceRow()`
   - `stripAnsi()` (exported for reuse)
   - `hasReverseVideo()` (exported for reuse)
   - Type exports: `WorkspaceFixtureName`, `WorkspaceContextOptions`, `StatusTransitionOptions`, `WorkspaceRowExpectation`, `SSEStatusEvent`, `SSESessionStatusEvent`

**Acceptance criteria:**
- File compiles with `bun build --dry-run`
- All types align with `Workspace` from `@codeplane/ui-core` (not `WorkspaceResponse` from SDK)
- All fixture IDs are deterministic (no `Date.now()`, no `Math.random()`)
- `launchTUIWithWorkspaceContext()` delegates to `launchTUI()` from `../helpers.ts`
- Uses top-level ESM imports, not inline `require()` calls

### Step 3: Create barrel export

**File:** `e2e/tui/helpers/index.ts`

```typescript
export * from "./workspaces.js";
```

This barrel allows clean imports: `import { WORKSPACE_FIXTURES } from "./helpers/workspaces.js"` or bulk import via `import * from "./helpers/index.js"`.

### Step 4: Create unit tests for helpers

**File:** `e2e/tui/helpers/__tests__/workspaces.test.ts`

Unit tests for the helper functions themselves. These validate determinism, type correctness, and assertion behavior before the helpers are used in feature tests. See Section 5 for full test specifications.

### Step 5: Validate integration with existing workspace test file

**File:** `e2e/tui/workspaces.test.ts` (modification)

Update imports to use the new helpers module and add integration tests that exercise the helpers against a real TUI process. These tests will fail if the workspace screen is not implemented — that is by design per the testing philosophy.

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
      const tmpDir = require("node:os").tmpdir();
      expect(filePath.startsWith(tmpDir)).toBe(true);
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

These tests validate the helpers work correctly in the full TUI E2E context. They run against a real TUI process and **will fail if the workspace screen is not implemented** — that is by design per the testing philosophy.

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

describe("Workspace E2E Helper Integration", () => {

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
    assertWorkspaceRow(terminal, 2, { status: "running" });
    await terminal.terminate();
  });
});
```

**Note on HELPER-INT tests:** These tests launch real TUI processes and require the workspace screen implementation to be present. Per the testing philosophy (PRD Section 7.3, Architecture doc Testing Philosophy principle 1): "Tests that fail due to unimplemented backend features are left failing. They are never skipped or commented out." If the workspace list screen is not yet implemented, these tests will fail — that is the expected state.

---

## 6. Productionization Notes

### 6.1 SSE Injection Mechanism

The `CODEPLANE_SSE_INJECT_FILE` code path in `SSEProvider.tsx` is a test-only feature. To prevent accidental use in production:

1. **Guard with `NODE_ENV` check**: The injection path only activates when `process.env.NODE_ENV === "test"` AND `CODEPLANE_SSE_INJECT_FILE` is set. Both conditions must be true.
2. **Log a warning**: When the injection path activates, log `"[SSEProvider] Using file-based SSE injection (test mode)"` to stderr (already implemented).
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

Per the TUI design spec (Section 3.3: "No images, no bitmap rendering, no sixel") and the constraint that OpenTUI uses standard ANSI rendering, SGR coverage is sufficient. If OpenTUI introduces OSC or DCS sequences in the future, `stripAnsi()` must be extended. The `UTIL-005` test verifies combined SGR parameters work correctly.

### 6.4 Performance Considerations

- `waitForStatusTransition()` polls every 100ms by default — do not reduce below 50ms to avoid CPU spin on CI.
- `createSSEInjectionFile()` creates files in the system temp directory. The SSEProvider reads these with a 100ms `setInterval`. Events written to the file appear within ~200ms (one poll cycle + dispatch overhead).
- Each E2E test launches a fresh TUI process. No shared state between tests. Process cleanup (`terminal.terminate()`) and file cleanup (`sse.cleanup()`) must be called in every test to prevent resource leaks.
- The `createSSEInjectionFile` temp directories use `mkdtempSync` which creates unique directories — parallel test execution is safe.

### 6.5 Migration Path

Once these helpers are available, existing workspace tests should migrate to use them. The migration is additive — existing tests continue to work with `launchTUI()`, but new tests should prefer `launchTUIWithWorkspaceContext()` for:
- Reduced boilerplate (no manual `--screen` and `--repo` arg construction)
- Consistent default terminal dimensions
- Built-in ready-state waiting
- Composability with SSE injection via `launchTUIWithSSEInjection()`

### 6.6 Import Pattern for Downstream Tests

Future workspace feature tests should import helpers from the dedicated module:

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
  └── imports from: bun:test (describe, test, expect)

e2e/tui/workspaces.test.ts
  ├── imports from: e2e/tui/helpers/workspaces.ts (all helpers)
  └── imports from: bun:test (describe, test, expect)

apps/tui/src/providers/SSEProvider.tsx (already implemented)
  ├── reads: CODEPLANE_SSE_INJECT_FILE env var (test-only code path)
  ├── reads: NODE_ENV env var (guard condition)
  └── imports from: node:fs (existsSync, statSync, openSync, readSync, closeSync)
```

---

## 9. Verification Checklist

- [ ] `e2e/tui/helpers/workspaces.ts` compiles with zero TypeScript errors
- [ ] All fixture IDs are unique and valid UUID v4 format
- [ ] All fixture timestamps are static (no `Date.now()`, no `new Date()`)
- [ ] `WORKSPACE_FIXTURES` type matches `Record<WorkspaceFixtureName, Workspace>` from `@codeplane/ui-core`
- [ ] `createWorkspaceFixture()` `status` param is typed as `WorkspaceStatus`, not `string`
- [ ] SSE event `type` fields match server wire format: `"workspace.status"` and `"workspace.session"`
- [ ] SSE event `data` payloads match server format: `{ workspace_id, status }` and `{ session_id, status }`
- [ ] `createSSEInjectionFile()` uses top-level ESM imports (no inline `require()`)
- [ ] `launchTUIWithWorkspaceContext()` delegates to `launchTUI()` from base helpers
- [ ] `waitForStatusTransition()` Phase 1 timeout is capped at `min(timeout/3, 5000)`
- [ ] `assertWorkspaceRow()` strips ANSI for content checks but preserves for focus check
- [ ] All unit tests in `helpers/__tests__/workspaces.test.ts` pass
- [ ] E2E integration tests in `workspaces.test.ts` are present (may fail if backend not implemented — that is correct)
- [ ] `SSEProvider.tsx` test injection path is guarded by both `NODE_ENV === "test"` and `CODEPLANE_SSE_INJECT_FILE`
- [ ] Barrel export at `e2e/tui/helpers/index.ts` re-exports workspace helpers