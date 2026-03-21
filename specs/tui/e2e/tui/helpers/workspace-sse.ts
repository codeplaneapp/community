import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { WorkspaceStatus } from "@codeplane/ui-core/types/workspaces";
import { expect } from "bun:test";

/**
 * Create an SSE event in wire format for workspace status changes.
 * Used with CODEPLANE_SSE_INJECT_FILE for deterministic SSE testing.
 */
export function createWorkspaceSSEEvent(
  workspaceId: string,
  status: WorkspaceStatus,
  eventId?: string,
): string {
  const event = {
    type: "workspace.status",
    data: JSON.stringify({
      workspace_id: workspaceId,
      status,
    }),
    id: eventId ?? String(Date.now()),
  };
  return JSON.stringify(event);
}

/**
 * Create a temporary file for SSE event injection.
 * Returns the file path and a function to append events.
 */
export function createSSEInjectionFile(): {
  path: string;
  appendEvent: (event: string) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "tui-sse-"));
  const path = join(dir, "events.jsonl");
  writeFileSync(path, "");

  return {
    path,
    appendEvent: (event: string) => {
      const { appendFileSync } = require("fs");
      appendFileSync(path, event + "\n");
    },
    cleanup: () => {
      try {
        unlinkSync(path);
      } catch {
        // ignore
      }
    },
  };
}

/**
 * Wait for a workspace status to appear in the terminal output.
 */
export async function waitForWorkspaceStatus(
  terminal: { waitForText: (text: string, timeout?: number) => Promise<void> },
  status: WorkspaceStatus,
  timeoutMs: number = 5000,
): Promise<void> {
  const displayText = status.charAt(0).toUpperCase() + status.slice(1);
  await terminal.waitForText(displayText, timeoutMs);
}

/**
 * Assert that the status bar contains a connection state indicator.
 */
export function assertConnectionIndicator(
  statusBarLine: string,
  expectedState: "connected" | "reconnecting" | "degraded" | "disconnected",
): void {
  const indicators: Record<string, RegExp> = {
    connected: /●|◆|connected/i,
    reconnecting: /↻|⟳|reconnecting/i,
    degraded: /◐|⚠|degraded/i,
    disconnected: /✗|○|disconnected/i,
  };
  expect(statusBarLine).toMatch(indicators[expectedState]);
}
