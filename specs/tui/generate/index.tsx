/** @jsxImportSource smithers-orchestrator */
import { createSmithers, Sequence, ClaudeCodeAgent, GeminiAgent, CodexAgent, KimiAgent } from "smithers-orchestrator";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { TUIFeatures } from "../features";
import { buildBaseSystemPrompt, specsDir } from "./utils";

import { impactAnalysisSchemas, ImpactAnalysisPhase } from "./impactAnalysis";
import { productSpecsSchemas, ProductSpecsPhase } from "./productSpecs";
import { highLevelArchSchemas, HighLevelArchPhase } from "./highLevelArch";
import { featureGroupsSchemas, FeatureGroupsPhase } from "./featureGroups";
import { groupTicketsSchemas, GroupTicketsPhase } from "./groupTickets";
import { ticketPipelineSchemas, TicketPipelinePhase } from "./ticketPipeline";
import { linkDependenciesSchemas, LinkDependenciesPhase } from "./linkDependencies";

export const { Workflow, smithers, outputs } = createSmithers({
  impactAnalysis: impactAnalysisSchemas.impactAnalysis,

  check: productSpecsSchemas.check,
  spec: productSpecsSchemas.spec,
  write: productSpecsSchemas.write,

  checkArch: highLevelArchSchemas.checkArch,
  arch: highLevelArchSchemas.arch,
  writeArch: highLevelArchSchemas.writeArch,

  checkGroups: featureGroupsSchemas.checkGroups,
  featureGroupsOut: featureGroupsSchemas.featureGroupsOut,
  writeGroups: featureGroupsSchemas.writeGroups,

  checkGroupTickets: groupTicketsSchemas.checkGroupTickets,
  groupTicketsOut: groupTicketsSchemas.groupTicketsOut,
  writeGroupTickets: groupTicketsSchemas.writeGroupTickets,
  allTicketsDone: groupTicketsSchemas.allTicketsDone,

  linkResult: linkDependenciesSchemas.linkResult,

  checkTicketSpec: ticketPipelineSchemas.checkTicketSpec,
  ticketSpec: ticketPipelineSchemas.ticketSpec,
  writeTicketSpec: ticketPipelineSchemas.writeTicketSpec,

  checkResearch: ticketPipelineSchemas.checkResearch,
  researchOut: ticketPipelineSchemas.researchOut,
  writeResearch: ticketPipelineSchemas.writeResearch,

  checkPlan: ticketPipelineSchemas.checkPlan,
  planOut: ticketPipelineSchemas.planOut,
  writePlan: ticketPipelineSchemas.writePlan,

  implement: ticketPipelineSchemas.implement,
  review: ticketPipelineSchemas.review,
  writeReview: ticketPipelineSchemas.writeReview,

  done: ticketPipelineSchemas.done,
  bookmark: ticketPipelineSchemas.bookmark,
});

export default smithers((ctx) => {
  const featureNames = Object.keys(TUIFeatures);
  const dir = specsDir();

  const hasDiffs = ctx.input && (ctx.input as any).diffs && Object.keys((ctx.input as any).diffs).length > 0;
  const diffText = hasDiffs
    ? `\n\n--- RECENT CHANGES IN THIS RUN ---\nThe following files were just changed by the user. Use this diff to understand what you need to update:\n${Object.entries(
        (ctx.input as any).diffs
      )
        .map(([f, d]) => `File: ${f}\nDiff:\n${d}`)
        .join("\n\n")}`
    : "";

  const baseSystemPrompt = buildBaseSystemPrompt(diffText);

  const specAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt: baseSystemPrompt,
    dangerouslySkipPermissions: true,
  });

  const implementAgent = new GeminiAgent({
    model: "gemini-3.1-pro-preview",
    approvalMode: "yolo",
    systemPrompt: baseSystemPrompt + `\n\nYou are an elite software engineer specializing in terminal UIs with React 19 + OpenTUI. You implement features meticulously, running tests to verify your work. You have full access to the codebase via your tools. Use them to read, write, edit, and run tests. Your goal is to produce flawless, working code that exactly matches the specifications.

Key implementation guidelines:
- All TUI code goes in apps/tui/src/
- Use OpenTUI components (<box>, <scrollbox>, <text>, <input>, <select>, <code>, <diff>, <markdown>)
- Use OpenTUI hooks (useKeyboard, useTerminalDimensions, useOnResize, useTimeline)
- Consume @codeplane/ui-core for data hooks and API client
- E2E tests use @microsoft/tui-test with snapshot matching and keyboard interaction simulation
- Tests that fail due to unimplemented backends are left failing (never skip or comment)
- Search apps/tui/, context/opentui/, and packages/ui-core/ for patterns and APIs`,
  });

  const reviewAgent = new CodexAgent({
    model: "gpt-5.3-codex",
    yolo: true,
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are the strictest code reviewer in the world. You run tests, read code, and look for edge cases. If there is ANY way to improve the code, even nits, you reject it. You demand perfection.",
  });

  const checkArch = ctx.outputMaybe(outputs.checkArch, { nodeId: "check-arch" });
  const archOut = ctx.outputMaybe(outputs.arch, { nodeId: "generate-arch" });
  const archContent = archOut?.document || checkArch?.existingContent || "";

  const impact = ctx.outputMaybe(outputs.impactAnalysis, { nodeId: "impact-analysis" });
  const writeGroups = ctx.outputMaybe(outputs.writeGroups, { nodeId: "write-groups" });

  let featureGroups: any[] = [];
  if (writeGroups?.success) {
    try {
      const raw = fsSync.readFileSync(path.join(dir, "feature-groups.json"), "utf-8");
      featureGroups = JSON.parse(raw);
      if (featureGroups.groups) featureGroups = featureGroups.groups;
    } catch {}
  }

  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });

  // Read tickets AFTER the linker has run so dependencies are resolved.
  // Falls back to allTicketsDone if linker hasn't run yet (first render).
  const linkResult = ctx.outputMaybe(outputs.linkResult, { nodeId: "link-dependencies" });
  let masterTickets: any[] = [];
  if ((linkResult || allTicketsDone?.success) && featureGroups.length > 0) {
    for (const g of featureGroups) {
      try {
        const raw = fsSync.readFileSync(path.join(dir, `tickets-${g.id}.json`), "utf-8");
        masterTickets.push(...JSON.parse(raw));
      } catch {}
    }
  }

  const flatNodes: any[] = [];
  if (masterTickets && Array.isArray(masterTickets)) {
    for (const t of masterTickets) {
      flatNodes.push({
        id: `spec-${t.id}`,
        type: "spec",
        ticket: t,
        dependsOn: (t.dependencies || []).map((d: string) => `bookmark-${d}`),
      });
      flatNodes.push({
        id: `research-${t.id}`,
        type: "research",
        ticket: t,
        dependsOn: [`done-spec-${t.id}`],
      });
      flatNodes.push({
        id: `plan-${t.id}`,
        type: "plan",
        ticket: t,
        dependsOn: [`done-research-${t.id}`],
      });
      flatNodes.push({
        id: `impl-${t.id}`,
        type: "implement",
        ticket: t,
        dependsOn: [`done-plan-${t.id}`],
      });
      flatNodes.push({
        id: `bookmark-${t.id}`,
        type: "bookmark",
        ticket: t,
        dependsOn: [`done-impl-${t.id}`],
      });
    }
  }

  return (
    <Workflow name="generate-tui-specs">
      <Sequence>
        <ImpactAnalysisPhase
          hasDiffs={hasDiffs}
          diffText={diffText}
          featureNames={featureNames}
          masterTickets={masterTickets}
          specAgent={specAgent}
          outputs={outputs}
        />

        <ProductSpecsPhase
          ctx={ctx}
          impact={impact}
          featureNames={featureNames}
          specAgent={specAgent}
          outputs={outputs}
        />

        <HighLevelArchPhase
          ctx={ctx}
          impact={impact}
          featureNames={featureNames}
          specAgent={specAgent}
          outputs={outputs}
        />

        <FeatureGroupsPhase
          ctx={ctx}
          impact={impact}
          featureNames={featureNames}
          archContent={archContent}
          specAgent={specAgent}
          outputs={outputs}
        />

        <GroupTicketsPhase
          ctx={ctx}
          impact={impact}
          featureGroups={featureGroups}
          archContent={archContent}
          specAgent={specAgent}
          outputs={outputs}
        />

        <LinkDependenciesPhase
          ctx={ctx}
          featureGroups={featureGroups}
          outputs={outputs}
        />

        <TicketPipelinePhase
          ctx={ctx}
          impact={impact}
          flatNodes={flatNodes}
          archContent={archContent}
          specAgent={specAgent}
          implementAgent={implementAgent}
          reviewAgent={reviewAgent}
          outputs={outputs}
        />
      </Sequence>
    </Workflow>
  );
});
