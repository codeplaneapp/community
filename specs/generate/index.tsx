/** @jsxImportSource smithers-orchestrator */
import { createSmithers, Sequence, ClaudeCodeAgent, GeminiAgent, CodexAgent } from "smithers-orchestrator";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { Features } from "../features";
import { specsDir } from "./utils";

import { impactAnalysisSchemas, ImpactAnalysisPhase } from "./impactAnalysis";
import { productSpecsSchemas, ProductSpecsPhase } from "./productSpecs";
import { highLevelArchSchemas, HighLevelArchPhase } from "./highLevelArch";
import { featureGroupsSchemas, FeatureGroupsPhase } from "./featureGroups";
import { groupTicketsSchemas, GroupTicketsPhase } from "./groupTickets";
import { ticketPipelineSchemas, TicketPipelinePhase } from "./ticketPipeline";
import { prStackSchemas, PrStackPhase } from "./prStack";
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

  prStack: prStackSchemas.prStack,
});

export default smithers((ctx) => {
  const featureNames = Object.keys(Features);
  const dir = specsDir();

  let prdContent = "";
  let designContent = "";
  try {
    prdContent = fsSync.readFileSync(path.join(dir, "prd.md"), "utf-8");
    designContent = fsSync.readFileSync(path.join(dir, "design.md"), "utf-8");
  } catch {}

  const hasDiffs = ctx.input && (ctx.input as any).diffs && Object.keys((ctx.input as any).diffs).length > 0;
  const diffText = hasDiffs
    ? `\n\n--- RECENT CHANGES IN THIS RUN ---\nThe following files were just changed by the user. Use this diff to understand what you need to update:\n${Object.entries(
        (ctx.input as any).diffs
      )
        .map(([f, d]) => `File: ${f}\nDiff:\n${d}`)
        .join("\n\n")}`
    : "";

  const baseSystemPrompt = `You are an expert product manager, software architect, and QA engineer. Write clear, structured, and incredibly robust specifications.

Context:
--- PRD ---
${prdContent}

--- DESIGN ---
${designContent}${diffText}`;

  const specAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt: baseSystemPrompt,
    dangerouslySkipPermissions: true,
  });

  const implementAgent = new GeminiAgent({
    model: "gemini-3.1-pro-preview",
    approvalMode: "yolo",
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are an elite software engineer. You implement features meticulously, running tests to verify your work. You have full access to the codebase via your tools. Use them to read, write, edit, and run tests. Your goal is to produce flawless, working code that exactly matches the specifications.",
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
      if (featureGroups.groups) featureGroups = featureGroups.groups; // handle object wrapper if any
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

  // Instead of nesting everything, we flatten out the ticket items into explicit sequential tasks that depend on each other.
  // A ticket goes through 5 nodes: spec -> research -> plan -> implement -> bookmark
  // It only begins its 'spec' node once its master dependencies' 'bookmark' nodes finish.
  const flatNodes: any[] = [];
  if (masterTickets && Array.isArray(masterTickets)) {
    for (const t of masterTickets) {
      // 1. Engineering Spec (depends on upstream tickets' bookmarks finishing)
      flatNodes.push({
        id: `spec-${t.id}`,
        type: "spec",
        ticket: t,
        dependsOn: (t.dependencies || []).map((d: string) => `bookmark-${d}`),
      });

      // 2. Research (depends on this ticket's spec finishing)
      flatNodes.push({
        id: `research-${t.id}`,
        type: "research",
        ticket: t,
        dependsOn: [`done-spec-${t.id}`],
      });

      // 3. Plan (depends on this ticket's research finishing)
      flatNodes.push({
        id: `plan-${t.id}`,
        type: "plan",
        ticket: t,
        dependsOn: [`done-research-${t.id}`],
      });

      // 4. Implement (depends on this ticket's plan finishing)
      flatNodes.push({
        id: `impl-${t.id}`,
        type: "implement",
        ticket: t,
        dependsOn: [`done-plan-${t.id}`],
      });

      // 5. Bookmark (depends on implementation finishing)
      flatNodes.push({
        id: `bookmark-${t.id}`,
        type: "bookmark",
        ticket: t,
        dependsOn: [`done-impl-${t.id}`],
      });
    }
  }

  return (
    <Workflow name="generate-specs">
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

        <PrStackPhase
          ctx={ctx}
          masterTickets={masterTickets}
          outputs={outputs}
        />
      </Sequence>
    </Workflow>
  );
});
