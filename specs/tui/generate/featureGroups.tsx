/** @jsxImportSource smithers-orchestrator */
import { Task, Sequence, Branch } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { specsDir } from "./utils";

export const featureGroupsSchemas = {
  checkGroups: z.object({ needsGroups: z.boolean(), existingContent: z.string() }),
  featureGroupsOut: z.object({
    groups: z.array(
      z.object({
        id: z.string().describe("Lowercase kebab-case group ID (e.g. 'tui-app-shell', 'tui-diff-viewer')"),
        description: z.string().describe("What this group encompasses"),
        features: z.array(z.string()).describe("List of EXACT TUIFeatureNames from the TUIFeatures enum belonging to this group"),
      })
    ).describe("Logical grouping of all TUI features to minimize cross-group dependencies"),
  }),
  writeGroups: z.object({ success: z.boolean() }),
};

export function FeatureGroupsPhase({
  ctx,
  impact,
  featureNames,
  archContent,
  specAgent,
  outputs,
}: {
  ctx: any;
  impact: any;
  featureNames: string[];
  archContent: string;
  specAgent: any;
  outputs: any;
}) {
  const dir = specsDir();
  const writeArch = ctx.outputMaybe(outputs.writeArch, { nodeId: "write-arch" });
  if (!writeArch || !impact) return null;

  const checkGroups = ctx.outputMaybe(outputs.checkGroups, { nodeId: "check-groups" });

  return (
    <Sequence>
      <Task id="check-groups" output={outputs.checkGroups}>
        {async () => {
          const p = path.join(dir, "feature-groups.json");
          let content = "";
          try {
            content = await fs.readFile(p, "utf-8");
            const json = JSON.parse(content);
            if (Array.isArray(json.groups) && json.groups.length > 0) {
              let needsGroups = false;
              if (impact.invalidateGroups) needsGroups = true;
              return { needsGroups, existingContent: content };
            }
          } catch {}
          return { needsGroups: true, existingContent: content };
        }}
      </Task>

      {checkGroups ? (
        <Branch
          if={checkGroups.needsGroups}
          then={
            <Sequence>
              <Task
                id="generate-groups"
                output={outputs.featureGroupsOut}
                agent={specAgent}
                retries={2}
                timeoutMs={1800000}
              >
                {`You are the lead architect for the Codeplane TUI. We have ${featureNames.length} TUI features that must be implemented.
To avoid token limits, we need to break these features down into logical groups (epics).

Here is the TUI Engineering Architecture:
${archContent}

Your job is to generate a comprehensive JSON array of GROUPS.

RULES:
1. Distribute the ${featureNames.length} TUI features into 10-14 logical groups.
2. The goal is to MINIMIZE cross-group dependencies. Features that heavily interact should be in the same group.
3. Every single TUI feature in the feature list MUST be assigned to exactly one group.
4. Output must be a valid JSON array matching the schema.

Feature list:
${featureNames.join(", ")}`}
              </Task>

              {ctx.outputMaybe(outputs.featureGroupsOut, { nodeId: "generate-groups" }) ? (
                <Task id="write-groups" output={outputs.writeGroups}>
                  {async () => {
                    const p = path.join(dir, "feature-groups.json");
                    const g = ctx.outputMaybe(outputs.featureGroupsOut, { nodeId: "generate-groups" });
                    await fs.writeFile(p, JSON.stringify(g, null, 2), "utf-8");
                    return { success: true };
                  }}
                </Task>
              ) : null}
            </Sequence>
          }
          else={
            <Task id="write-groups" output={outputs.writeGroups}>
              {{ success: true }}
            </Task>
          }
        />
      ) : null}
    </Sequence>
  );
}
