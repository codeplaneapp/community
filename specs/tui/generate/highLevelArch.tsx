/** @jsxImportSource smithers-orchestrator */
import { Task, Sequence, Branch } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { specsDir } from "./utils";

export const highLevelArchSchemas = {
  checkArch: z.object({
    needsArch: z.boolean(),
    existingContent: z.string(),
  }),
  arch: z.object({
    document: z.string().describe("High-level TUI engineering architecture document. Markdown format."),
  }),
  writeArch: z.object({
    success: z.boolean(),
  }),
};

export function HighLevelArchPhase({
  ctx,
  impact,
  featureNames,
  specAgent,
  outputs,
}: {
  ctx: any;
  impact: any;
  featureNames: string[];
  specAgent: any;
  outputs: any;
}) {
  const dir = specsDir();
  const checkArch = ctx.outputMaybe(outputs.checkArch, { nodeId: "check-arch" });
  const archOut = ctx.outputMaybe(outputs.arch, { nodeId: "generate-arch" });

  return (
    <>
      {impact ? (
        <Task id="check-arch" output={outputs.checkArch}>
          {async () => {
            const p = path.join(dir, "engineering-architecture.md");
            let content = "";
            try {
              content = await fs.readFile(p, "utf-8");
            } catch {
              content = "";
            }
            let needsArch =
              !content.includes("## Testing Philosophy") || !content.includes("## 3rd Party Dependencies");
            if (impact.invalidateArch) needsArch = true;
            return { needsArch, existingContent: content };
          }}
        </Task>
      ) : null}

      {checkArch ? (
        <Branch
          if={checkArch.needsArch}
          then={
            <Sequence>
              <Task
                id="generate-arch"
                output={outputs.arch}
                agent={specAgent}
                retries={2}
                timeoutMs={1800000}
              >
                {`Write the High-Level Engineering Architecture document for the Codeplane TUI.

The TUI is built with React 19 + OpenTUI, targeting terminal environments.

System features overview (to understand the scope):
${featureNames.slice(0, 50).join(", ")} ...and ${featureNames.length > 50 ? featureNames.length - 50 : 0} more.

Requirements:
1. Define the TUI architecture covering:
   - Screen router and navigation stack
   - Component library (shared TUI components built on OpenTUI primitives)
   - Data hooks integration with @codeplane/ui-core
   - SSE streaming infrastructure for the terminal
   - Keyboard input handling and global keybinding system
   - Responsive layout system with terminal dimension detection
   - Theme and color token system
2. Identify engineering-specific work needed before feature implementation:
   - Base screen component with header/status bar chrome
   - List component with vim-style navigation
   - Form component system
   - Modal/overlay system
   - SSE context provider
   - Auth token loading from CLI keychain
3. Define the testing philosophy:
   - E2E tests with @microsoft/tui-test (snapshot + interaction)
   - Terminal snapshot golden files at multiple sizes
   - Keyboard interaction sequences with state assertions
   - Tests that fail due to unimplemented backends stay failing
   - No mocking of implementation details
4. Define the 3rd-party dependency philosophy:
   - OpenTUI is the core framework (not swappable)
   - @codeplane/ui-core provides data access
   - @microsoft/tui-test for E2E testing
   - Any additional dependency requires a PoC test first
5. MUST include these exact sections: "## High-Level Architecture", "## Core Abstractions", "## Testing Philosophy", "## 3rd Party Dependencies".

If existing content is provided, review, update, and improve it. Otherwise build from scratch.

Existing Content:
${checkArch.existingContent || "None"}`}
              </Task>

              {archOut ? (
                <Task id="write-arch" output={outputs.writeArch}>
                  {async () => {
                    const p = path.join(dir, "engineering-architecture.md");
                    await fs.writeFile(p, archOut.document, "utf-8");
                    return { success: true };
                  }}
                </Task>
              ) : null}
            </Sequence>
          }
          else={
            <Task id="write-arch" output={outputs.writeArch}>
              {{ success: true }}
            </Task>
          }
        />
      ) : null}
    </>
  );
}
