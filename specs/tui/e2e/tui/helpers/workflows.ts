import type { TUITestInstance } from "../helpers.js";

/**
 * Navigate to a specific workflow run detail screen.
 * Assumes TUI starts on dashboard.
 */
export async function navigateToWorkflowRunDetail(
  terminal: TUITestInstance,
  runIndex: number = 0,
): Promise<void> {
  await terminal.sendKeys("g", "f"); // go to workflows
  await terminal.waitForText("Workflows");
  await terminal.sendKeys("Enter");   // enter first workflow
  await terminal.waitForText("Runs");
  for (let i = 0; i < runIndex; i++) {
    await terminal.sendKeys("j");
  }
  await terminal.sendKeys("Enter");   // enter run detail
}

/**
 * Wait for log streaming to begin (connection established).
 */
export async function waitForLogStreaming(
  terminal: TUITestInstance,
  timeoutMs: number = 10_000,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const content = terminal.snapshot();
    if (
      content.includes("Connected") ||
      content.includes("Streaming") ||
      content.includes("⣾") || content.includes("⣷") || // braille spinner
      content.includes("Log") // log output visible
    ) {
      return;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("waitForLogStreaming: streaming not detected within timeout");
}

/**
 * Create an SSE inject file for test-mode SSE simulation.
 * Writes workflow log events as newline-delimited JSON.
 */
export function createSSEInjectFile(dir: string): {
  path: string;
  appendEvent: (event: { type: string; data: string; id: string }) => void;
} {
  const { join } = require("node:path");
  const { writeFileSync, appendFileSync } = require("node:fs");
  const path = join(dir, "sse-inject.jsonl");
  writeFileSync(path, "");
  return {
    path,
    appendEvent: (event: { type: string; data: string; id: string }) => {
      appendFileSync(path, JSON.stringify(event) + "\n");
    },
  };
}
