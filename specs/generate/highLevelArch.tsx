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
    document: z.string().describe("High-level engineering architecture document. Markdown format."),
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
  const checkArch = ctx.outputMaybe(outputs.checkArch, { nodeId: "check-arch" });
  const archOut = ctx.outputMaybe(outputs.arch, { nodeId: "generate-arch" });

  return (
    <>
      {impact ? (
        <Task id="check-arch" output={outputs.checkArch}>
          {async () => {
            const p = path.join(specsDir(),"engineering-architecture.md");
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
                {`Write the High-Level Engineering Architecture document for this project.

System features overview (to understand the scope):
${featureNames.slice(0, 50).join(", ")} ...and ${featureNames.length - 50} more.

Requirements:
1. Define the high-level architecture before diving into feature-specific engineering docs.
2. Identify potential engineering-specific work (creating libraries or abstractions) used to implement groups of features, broken off into its own engineering tasks.
3. Define the testing philosophy:
   - Super strong unit and integration tests providing 100% certainty.
   - Prefer NOT mocking whenever possible. If we do mock, it MUST only mock a stable boundary, NEVER an implementation detail.
   - Think through corner cases.
4. Define the 3rd-party dependency philosophy:
   - For problems solved by 3rd-party dependencies, specify requirements independent of the dependency.
   - We should NEVER use a 3rd-party dependency (except frameworks like React, OpenTUI) unless we write a PoC test only importing the dependency and showing how we plan on using it.
   - This PoC test must be its own engineering ticket that the feature depends on.
5. MUST include the following exact sections: "## High-Level Architecture", "## Core Abstractions", "## Testing Philosophy", "## 3rd Party Dependencies".

If existing content is provided, review, update, and improve it. Otherwise build from scratch.

Existing Content:
${checkArch.existingContent || "None"}`}
              </Task>

              {archOut ? (
                <Task id="write-arch" output={outputs.writeArch}>
                  {async () => {
                    const p = path.join(specsDir(),"engineering-architecture.md");
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
