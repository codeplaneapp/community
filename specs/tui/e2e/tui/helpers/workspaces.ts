import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Workspace } from "@codeplane/ui-core";
import { launchTUI, type TUITestInstance, type LaunchTUIOptions } from "../helpers.js";

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

export function createWorkspaceFixture(
  overrides: Partial<Workspace> & { name: string; status: Workspace["status"] },
): Workspace {
  return {
    ...FIXTURE_DEFAULTS,
    id: WORKSPACE_IDS.running,
    suspended_at: null,
    ...overrides,
  };
}

export interface WorkspaceContextOptions extends LaunchTUIOptions {
  repo?: string;
  screen?: "workspaces" | "workspace-detail";
  workspaceId?: string;
  readyTimeoutMs?: number;
  skipReady?: boolean;
}

export async function launchTUIWithWorkspaceContext(
  options?: WorkspaceContextOptions,
): Promise<TUITestInstance> {
  const repo = options?.repo ?? "acme/api";
  const screen = options?.screen ?? "workspaces";
  const readyTimeoutMs = options?.readyTimeoutMs ?? 10_000;

  const args = ["--screen", screen, "--repo", repo];
  if (screen === "workspace-detail" && options?.workspaceId) {
    args.push("--id", options.workspaceId);
  }

  const mergedArgs = [...args, ...(options?.args ?? [])];

  const terminal = await launchTUI({
    cols: options?.cols ?? 120,
    rows: options?.rows ?? 40,
    env: options?.env,
    args: mergedArgs,
    launchTimeoutMs: options?.launchTimeoutMs,
  });

  if (!options?.skipReady) {
    const readyText = screen === "workspace-detail" ? "Workspace" : "Workspaces";
    await terminal.waitForText(readyText, readyTimeoutMs);
  }

  return terminal;
}

export interface StatusTransitionOptions {
  timeoutMs?: number;
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

export interface SSEStatusEvent {
  workspace_id: string;
  status: string;
}

export interface SSESessionStatusEvent {
  session_id: string;
  status: string;
}

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

export function createSSEInjectionFile(): {
  filePath: string;
  writeEvent: (event: { type: string; data: string; id: string }) => void;
  writeEvents: (events: Array<{ type: string; data: string; id: string }>) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "codeplane-sse-inject-"));
  const filePath = join(dir, "sse-events.jsonl");

  writeFileSync(filePath, "");

  return {
    filePath,
    writeEvent(event) {
      const line = JSON.stringify(event) + "\n";
      const { appendFileSync } = require("node:fs");
      appendFileSync(filePath, line);
    },
    writeEvents(events) {
      const lines = events.map((e) => JSON.stringify(e) + "\n").join("");
      const { appendFileSync } = require("node:fs");
      appendFileSync(filePath, lines);
    },
    cleanup() {
      try {
        const { rmSync } = require("node:fs");
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort
      }
    },
  };
}

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

export interface WorkspaceRowExpectation {
  name?: string;
  status?: string;
  focused?: boolean;
  sshHost?: string;
  contains?: string;
  notContains?: string;
}

export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export function hasReverseVideo(str: string): boolean {
  return str.includes("\x1b[7m");
}

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
