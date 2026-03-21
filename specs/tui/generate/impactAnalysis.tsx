/** @jsxImportSource smithers-orchestrator */
import { Task } from "smithers-orchestrator";
import { z } from "zod";

export const impactAnalysisSchemas = {
  impactAnalysis: z.object({
    invalidateAllProdSpecs: z.boolean(),
    invalidateProdSpecsForFeatures: z.array(z.string()),
    invalidateArch: z.boolean(),
    invalidateGroups: z.boolean(),
    invalidateTicketsForGroups: z.array(z.string()),
    invalidateTicketSpecsForTickets: z.array(z.string()),
    invalidateResearchForTickets: z.array(z.string()),
    invalidatePlanForTickets: z.array(z.string()),
    invalidateImplForTickets: z.array(z.string()),
    explanation: z.string(),
  }),
};

export function ImpactAnalysisPhase({
  hasDiffs,
  diffText,
  featureNames,
  masterTickets,
  specAgent,
  outputs,
}: {
  hasDiffs: boolean;
  diffText: string;
  featureNames: string[];
  masterTickets: any[];
  specAgent: any;
  outputs: any;
}) {
  return hasDiffs ? (
    <Task
      id="impact-analysis"
      output={outputs.impactAnalysis}
      agent={specAgent}
      timeoutMs={1800000}
    >
      {`The user has made changes to the TUI documentation. We need to determine which TUI features and tickets need to be invalidated and rebuilt.
Here are the diffs:
${diffText}

Available TUI Features:
${featureNames.join(", ")}

Master Engineering Tickets:
${masterTickets.map((t: any) => t.id).join(", ")}

Your job is to analyze the impact of the diffs and output a JSON array specifying what needs to be invalidated.
If a core document like TUI PRD or TUI Design changed drastically, you might need to invalidate everything.
If only a specific screen or component changed, only invalidate the features and tickets that rely on it.
Be precise and thorough.`}
    </Task>
  ) : (
    <Task id="impact-analysis" output={outputs.impactAnalysis}>
      {{
        invalidateAllProdSpecs: false,
        invalidateProdSpecsForFeatures: [],
        invalidateArch: false,
        invalidateGroups: false,
        invalidateTicketsForGroups: [],
        invalidateTicketSpecsForTickets: [],
        invalidateResearchForTickets: [],
        invalidatePlanForTickets: [],
        invalidateImplForTickets: [],
        explanation: "No diffs provided, running standard idempotent sync.",
      }}
    </Task>
  );
}
