import { execFileSync } from "node:child_process";
import * as fsSync from "node:fs";
import * as path from "node:path";

export function execJJ(args: string[], cwd?: string): string {
  return execFileSync("jj", args, {
    encoding: "utf-8",
    cwd: cwd || process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

/** Resolve the specs/tui directory relative to this file */
export function specsDir(): string {
  return path.resolve(__dirname, "..");
}

/** Resolve the repo root (two levels above specs/tui/) */
export function rootDir(): string {
  return path.resolve(specsDir(), "..", "..");
}

/** Build the TUI-specific base system prompt with PRD, design, and OpenTUI context */
export function buildBaseSystemPrompt(diffText: string): string {
  let prdContent = "";
  let designContent = "";
  let platformPrdContent = "";
  let opentuiRef = "";

  try { prdContent = fsSync.readFileSync(path.join(specsDir(), "prd.md"), "utf-8"); } catch {}
  try { designContent = fsSync.readFileSync(path.join(specsDir(), "design.md"), "utf-8"); } catch {}
  try { platformPrdContent = fsSync.readFileSync(path.join(rootDir(), "specs", "prd.md"), "utf-8"); } catch {}
  try { opentuiRef = fsSync.readFileSync(path.join(rootDir(), "context", "opentui", "README.md"), "utf-8"); } catch {}

  return `You are an expert product manager, software architect, and QA engineer specializing in terminal user interfaces. Write clear, structured, and incredibly robust specifications.

You are working on the Codeplane TUI — a first-class terminal client built with React 19 + OpenTUI.

Context:
--- TUI PRD ---
${prdContent}

--- TUI DESIGN ---
${designContent}

--- PLATFORM PRD (for broader context) ---
${platformPrdContent.slice(0, 4000)}

--- OPENTUI COMPONENT REFERENCE ---
${opentuiRef.slice(0, 4000)}

Key TUI constraints:
- Keyboard-first (vim-style j/k/h/l navigation)
- Min 80x24 terminal, ANSI 256 color baseline
- No images, no browser, no mouse required
- Uses OpenTUI components: <box>, <scrollbox>, <text>, <input>, <select>, <code>, <diff>, <markdown>
- Uses OpenTUI hooks: useKeyboard, useTerminalDimensions, useOnResize, useTimeline
- Consumes @codeplane/ui-core hooks and API client
- All implementation targets apps/tui/src/
- All tests target e2e/tui/ using @microsoft/tui-test${diffText}`;
}
