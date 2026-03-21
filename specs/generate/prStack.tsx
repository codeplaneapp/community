/** @jsxImportSource smithers-orchestrator */
import { Task } from "smithers-orchestrator";
import { z } from "zod";
import { execFileSync } from "node:child_process";
import { execJJ } from "./utils";

export const prStackSchemas = {
  prStack: z.object({
    pushed: z.boolean(),
    landingRequestNumber: z.number().nullable(),
    stackSize: z.number(),
    error: z.string().nullable(),
  }),
};

export function PrStackPhase({
  ctx,
  masterTickets,
  outputs,
}: {
  ctx: any;
  masterTickets: any[];
  outputs: any;
}) {
  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });
  if (!allTicketsDone || masterTickets.length === 0) return null;

  return (
    <Task
      id="pr-stack"
      output={outputs.prStack}
      dependsOn={masterTickets.map((t) => `bookmark-${t.id}`)}
      needsApproval={true}
    >
      {async () => {
        try {
          // Rebase bookmarks into a clean stack: each ticket on top of its parent
          // Process tickets in dependency order (they're already toposorted in masterTickets)
          for (const t of masterTickets) {
            const parentDeps = t.dependencies || [];
            const destination =
              parentDeps.length > 0 ? `impl/${parentDeps[parentDeps.length - 1]}` : "main";
            execJJ(["rebase", "-b", `impl/${t.id}`, "-d", destination]);
          }

          // Push all bookmarks upstream
          execJJ(["git", "push", "--all"]);

          // Create landing request for the full stack
          const result = execFileSync(
            "codeplane",
            ["land", "create", "--title", "Automated implementation stack", "--target", "main", "--stack"],
            { encoding: "utf-8", cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
          ).trimEnd();

          // Parse the LR number from CLI output
          const numMatch = result.match(/#(\\d+)/);
          const lrNumber = numMatch ? parseInt(numMatch[1], 10) : null;

          return {
            pushed: true,
            landingRequestNumber: lrNumber,
            stackSize: masterTickets.length,
            error: null,
          };
        } catch (err) {
          return {
            pushed: false,
            landingRequestNumber: null,
            stackSize: 0,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }}
    </Task>
  );
}
