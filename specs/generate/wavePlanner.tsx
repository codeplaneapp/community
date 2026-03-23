/** @jsxImportSource smithers-orchestrator */
import { Task } from "smithers-orchestrator";
import { z } from "zod";
import type { DomainConfig } from "./domains";

export const wavePlannerSchemas = {
  wavePlan: z.object({
    waveNumber: z.number(),
    assignments: z.array(
      z.object({
        ticketId: z.string(),
        agentType: z.enum(["claude", "gemini", "codex", "kimi"]).describe("Which agent to assign"),
        slotIndex: z.number().describe("Workspace slot index (0-7)"),
        rationale: z.string().optional().default("").describe("Why this agent was chosen for this ticket"),
        estimatedHours: z.number().optional().default(4).describe("Estimated hours"),
      })
    ),
    skippedTickets: z.array(
      z.object({
        ticketId: z.string(),
        reason: z.string().optional().default(""),
      })
    ).optional().default([]).describe("Tickets that were ready but not assigned this wave (overflow)"),
    strategyNotes: z.string().optional().default("").describe("Planning agent's strategy notes for this wave"),
  }),
};

/**
 * Compute which tickets are ready to implement (all deps bookmarked).
 */
export function computeReadyTickets(
  allTickets: Array<{ id: string; dependencies: string[] }>,
  completedBookmarks: Set<string>,
  inProgressTickets: Set<string>
): Array<{ id: string; dependencies: string[] }> {
  return allTickets.filter((t) => {
    // Not already done or in progress
    if (completedBookmarks.has(t.id) || inProgressTickets.has(t.id)) return false;
    // All deps must be bookmarked
    return (t.dependencies || []).every((d) => completedBookmarks.has(d));
  });
}

/**
 * WavePlannerPhase — an AI agent plans each wave.
 *
 * Given ready tickets, it decides:
 * 1. Which tickets to implement this wave (up to maxConcurrency)
 * 2. Which agent type to assign to each ticket
 * 3. Strategic notes about ordering and priorities
 */
export function WavePlannerPhase({
  waveNumber,
  readyTickets,
  completedTickets,
  totalTickets,
  maxConcurrency,
  domain,
  planningAgent,
  outputs,
  previousWaveResults,
}: {
  waveNumber: number;
  readyTickets: any[];
  completedTickets: string[];
  totalTickets: number;
  maxConcurrency: number;
  domain: DomainConfig;
  planningAgent: any;
  outputs: any;
  previousWaveResults?: string;
}) {
  if (readyTickets.length === 0) return null;

  return (
    <Task
      id={`wave-plan-${waveNumber}`}
      output={outputs.wavePlan}
      agent={planningAgent}
      timeoutMs={600000}
    >
      {`You are the sprint planning agent for the ${domain.name} implementation.

## Current State
- **Wave number:** ${waveNumber}
- **Total tickets:** ${totalTickets}
- **Completed:** ${completedTickets.length} (${Math.round((completedTickets.length / totalTickets) * 100)}%)
- **Ready to implement:** ${readyTickets.length}
- **Max concurrent agents:** ${maxConcurrency}

## Ready Tickets
${readyTickets
  .map(
    (t) =>
      `- **${t.id}**: ${t.title} (type: ${t.type}, deps: [${(t.dependencies || []).join(", ")}], est: ${t.estimateHours || "?"}h)`
  )
  .join("\n")}

## Previously Completed
${completedTickets.length > 0 ? completedTickets.map((id) => `- ✅ ${id}`).join("\n") : "None yet"}

${previousWaveResults ? `## Previous Wave Results\n${previousWaveResults}` : ""}

## Agent Dispatch Rules (FOLLOW THESE EXACTLY)

1. **codex** (GPT 5.3 Codex) — **DEFAULT for most tickets.** Fast, reliable tool usage. Use for most implementation including frontend UI, data hooks, CRUD, standard features.
2. **gemini** (Gemini 3.1 Pro) — Tasks requiring extensive codebase exploration or research-heavy implementation.
3. **claude** (Claude Opus 4.6) — **Architecturally complex** work, security-sensitive code, or rate-limit backup for codex/gemini.
4. **kimi** (Kimi) — **Trivially easy** changes: config updates, renames, constants, one-line fixes, boilerplate scaffolding.

**When in doubt, use codex.**

## Your Job
1. Select up to ${maxConcurrency} tickets from the ready list for this wave.
2. Assign an agent type to each based on the ticket's complexity and nature.
3. Assign a workspace slot index (0 through ${maxConcurrency - 1}) to each.
4. Prioritize tickets that unblock the most downstream work.
5. If some ready tickets would conflict (touching same files), defer one to next wave.
6. Write strategy notes explaining your decisions.

Output your plan as structured JSON matching the schema.`}
    </Task>
  );
}
