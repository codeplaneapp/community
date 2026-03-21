/** @jsxImportSource smithers-orchestrator */
import { Task, Parallel, Sequence, Branch } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { specsDir } from "./utils";

export const groupTicketsSchemas = {
  checkGroupTickets: z.object({ groupId: z.string(), needsTickets: z.boolean(), existingContent: z.string() }),
  groupTicketsOut: z.object({
    tickets: z.array(
      z.object({
        id: z.string().describe("Unique lowercase kebab-case slug (e.g., 'tui-screen-router', 'tui-feat-issue-list')"),
        title: z.string().describe("Short imperative title"),
        type: z
          .enum(["feature", "engineering"])
          .describe("'feature' if it completes a user-facing TUIFeatureName, 'engineering' if it is a prerequisite abstraction/infra/library"),
        featureName: z
          .string()
          .describe("If type is 'feature', the exact TUIFeatureName from the TUIFeatures object it fulfills. Empty string if 'engineering'"),
        description: z.string().describe("Detailed description of what this ticket implements"),
        dependencies: z.array(z.string()).describe("IDs of other tickets this depends on (can be from other groups)"),
      })
    ).describe("A DAG of tickets for this specific TUI feature group."),
  }),
  writeGroupTickets: z.object({ success: z.boolean() }),
  allTicketsDone: z.object({ success: z.boolean() }),
};

export function GroupTicketsPhase({
  ctx,
  impact,
  featureGroups,
  archContent,
  specAgent,
  outputs,
}: {
  ctx: any;
  impact: any;
  featureGroups: any[];
  archContent: string;
  specAgent: any;
  outputs: any;
}) {
  const dir = specsDir();
  const writeGroups = ctx.outputMaybe(outputs.writeGroups, { nodeId: "write-groups" });
  if (!writeGroups || featureGroups.length === 0) return null;

  return (
    <Sequence>
      <Parallel maxConcurrency={8}>
        {featureGroups.map((group) => {
          const checkGroupTix = ctx.outputMaybe(outputs.checkGroupTickets, { nodeId: `check-tickets-${group.id}` });

          return (
            <Sequence key={`group-tickets-${group.id}`}>
              <Task id={`check-tickets-${group.id}`} output={outputs.checkGroupTickets}>
                {async () => {
                  const p = path.join(dir, `tickets-${group.id}.json`);
                  let content = "";
                  try {
                    content = await fs.readFile(p, "utf-8");
                    const json = JSON.parse(content);
                    if (Array.isArray(json) && json.length > 0) {
                      let needsTickets = false;
                      if (impact.invalidateTicketsForGroups.includes(group.id)) needsTickets = true;
                      return { groupId: group.id, needsTickets, existingContent: content };
                    }
                  } catch {}
                  return { groupId: group.id, needsTickets: true, existingContent: content };
                }}
              </Task>

              {checkGroupTix ? (
                <Branch
                  if={checkGroupTix.needsTickets}
                  then={
                    <Sequence>
                      <Task
                        id={`generate-tickets-${group.id}`}
                        output={outputs.groupTicketsOut}
                        agent={specAgent}
                        retries={2}
                        timeoutMs={1800000}
                      >
                        {`You are the lead architect defining the execution DAG for a TUI feature group.
Group ID: ${group.id}
Group Description: ${group.description}
Features in this group:
${group.features.join(", ")}

Here is the TUI Engineering Architecture:
${archContent}

Your job is to generate a comprehensive JSON array of TICKETS for ONLY this group.

RULES FOR TICKETS:
1. Every single TUI feature in this group MUST be fulfilled by exactly one "feature" ticket.
   (The ticket closes the feature. Its featureName field must exactly match the TUI feature).
2. "engineering" tickets MUST be created for prerequisites: shared TUI components, screen scaffolding, hooks adapters, or test infrastructure.
3. Dependencies must form a strict DAG. An engineering ticket should come before the feature tickets that use it.
4. "feature" tickets should depend on any necessary "engineering" tickets.
5. "engineering" tickets have \`type: "engineering"\` and \`featureName: null\`.
6. "feature" tickets have \`type: "feature"\` and \`featureName: "THE_EXACT_TUI_FEATURE_NAME"\`.
7. For cross-group dependencies, use descriptive kebab-case IDs that clearly name the capability needed (e.g. 'tui-screen-router', 'tui-auth-token-loading'). A post-processing linker will resolve these to real ticket IDs — so be descriptive, not guessing.
8. All implementation targets apps/tui/src/ and all tests target e2e/tui/.`}
                      </Task>

                      {ctx.outputMaybe(outputs.groupTicketsOut, { nodeId: `generate-tickets-${group.id}` }) ? (
                        <Task id={`write-tickets-${group.id}`} output={outputs.writeGroupTickets}>
                          {async () => {
                            const p = path.join(dir, `tickets-${group.id}.json`);
                            const t = ctx.outputMaybe(outputs.groupTicketsOut, { nodeId: `generate-tickets-${group.id}` })!.tickets;
                            await fs.writeFile(p, JSON.stringify(t, null, 2), "utf-8");
                            return { success: true };
                          }}
                        </Task>
                      ) : null}
                    </Sequence>
                  }
                  else={
                    <Task id={`write-tickets-${group.id}`} output={outputs.writeGroupTickets}>
                      {{ success: true }}
                    </Task>
                  }
                />
              ) : null}
            </Sequence>
          );
        })}
      </Parallel>

      <Task
        id="all-tickets-done"
        output={outputs.allTicketsDone}
        dependsOn={featureGroups.map((g) => `write-tickets-${g.id}`)}
      >
        {{ success: true }}
      </Task>
    </Sequence>
  );
}
