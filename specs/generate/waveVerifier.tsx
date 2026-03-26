/** @jsxImportSource smithers-orchestrator */
import { Task } from "smithers-orchestrator";
import { z } from "zod";
import type { DomainConfig } from "./domains";

export const waveVerifierSchemas = {
  waveVerification: z.object({
    waveNumber: z.number(),
    ticketResults: z.array(
      z.object({
        ticketId: z.string(),
        success: z.boolean(),
        prNumber: z.number().nullable(),
        issueNumber: z.number().nullable(),
        filesChanged: z.number(),
        summary: z.string(),
      })
    ),
    overallSuccess: z.boolean(),
    bugs: z.array(
      z.object({
        description: z.string(),
        severity: z.enum(["critical", "major", "minor"]),
        suggestedFix: z.string(),
      })
    ).describe("Bugs found in the implemented code"),
    workflowImprovements: z.array(
      z.object({
        file: z.string().describe("File in specs/generate/ to modify"),
        description: z.string(),
        patch: z.string().describe("Suggested code change (can be applied via hot reload)"),
      })
    ).describe("Improvements to the workflow scripts themselves"),
    nextWaveNotes: z.string().describe("Notes for the planning agent about the next wave"),
  }),
};

/**
 * WaveVerifierPhase — post-wave verification and self-improvement.
 *
 * After each wave completes, this agent:
 * 1. Checks that all assigned tickets completed successfully
 * 2. Verifies PRs are clean and tests pass
 * 3. Identifies bugs or improvements in the implementations
 * 4. Identifies improvements to the workflow itself (self-improvement via --hot)
 * 5. Produces notes for the next wave's planning agent
 */
export function WaveVerifierPhase({
  waveNumber,
  assignments,
  domain,
  verifierAgent,
  outputs,
}: {
  waveNumber: number;
  assignments: Array<{
    ticketId: string;
    agentType: string;
    implementResult?: { summary: string; filesChanged: string[] } | null;
    reviewResult?: { lgtm: boolean; feedback: string } | null;
    bookmarkResult?: { changeId: string; bookmarkName: string } | null;
    prResult?: { number: number; url: string } | null;
    error?: string | null;
  }>;
  domain: DomainConfig;
  verifierAgent: any;
  outputs: any;
}) {
  return (
    <Task
      id={`wave-verify-${waveNumber}`}
      output={outputs.waveVerification}
      agent={verifierAgent}
      timeoutMs={1800000}
    >
      {`You are the post-wave verification agent for the ${domain.name} implementation.
Wave ${waveNumber} just completed. Your job is to verify the results and identify any issues.

## Wave ${waveNumber} Results
${assignments
  .map(
    (a) => `### ${a.ticketId} (agent: ${a.agentType})
- Implement: ${a.implementResult ? `✅ ${a.implementResult.summary} (${a.implementResult.filesChanged.length} files)` : a.error ? `❌ ${a.error}` : "⏭️ skipped"}
- Review: ${a.reviewResult ? (a.reviewResult.lgtm ? "✅ LGTM" : `❌ ${a.reviewResult.feedback.slice(0, 200)}`) : "N/A"}
- Bookmark: ${a.bookmarkResult ? `✅ ${a.bookmarkResult.bookmarkName}` : "N/A"}
- PR: ${a.prResult ? `✅ #${a.prResult.number} ${a.prResult.url}` : "N/A"}`
  )
  .join("\n\n")}

## Your Tasks
1. **Verify implementations**: Use your tools to read the changed files and run tests. Check for correctness, edge cases, and regressions.
2. **Check PRs**: Verify that each PR's branch pushes cleanly and the diff matches expectations.
3. **Identify bugs**: Report any issues found in the implementations. Be specific about file paths and line numbers.
4. **Self-improve**: If you notice patterns in failures (e.g., agents consistently missing a type of test, or the prompts being unclear), suggest improvements to the workflow scripts in specs/generate/. Since smithers runs with --hot, these patches will be picked up automatically.
5. **Prepare next wave**: Write notes for the planning agent about what to prioritize or watch out for.

Return your analysis as structured JSON matching the schema.`}
    </Task>
  );
}
