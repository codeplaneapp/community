/** @jsxImportSource smithers-orchestrator */
import {
  createSmithers,
  Sequence,
  Parallel,
  Branch,
  Task,
  Worktree,
  Loop,
  ClaudeCodeAgent,
  GeminiAgent,
  CodexAgent,
  KimiAgent,
} from "smithers-orchestrator";
import * as fsSync from "node:fs";
import * as path from "node:path";

import { getDomain, type DomainConfig } from "./domains";
import { rootDir, execJJ } from "./utils";
import { syncTicketsToIssues, pushBookmark, createPR, commentOnIssue } from "./github";

import { impactAnalysisSchemas, ImpactAnalysisPhase } from "./impactAnalysis";
import { productSpecsSchemas, ProductSpecsPhase } from "./productSpecs";
import { highLevelArchSchemas, HighLevelArchPhase } from "./highLevelArch";
import { featureGroupsSchemas, FeatureGroupsPhase } from "./featureGroups";
import { groupTicketsSchemas, GroupTicketsPhase } from "./groupTickets";
import { linkDependenciesSchemas, LinkDependenciesPhase } from "./linkDependencies";
import { ticketPipelineSchemas } from "./ticketPipeline";
import { wavePlannerSchemas } from "./wavePlanner";
import { waveVerifierSchemas } from "./waveVerifier";

// ---------------------------------------------------------------------------
// Schema registry
// ---------------------------------------------------------------------------
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

  githubSync: ticketPipelineSchemas.done,

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

  wavePlan: wavePlannerSchemas.wavePlan,
  waveVerification: waveVerifierSchemas.waveVerification,
});

// ---------------------------------------------------------------------------
// Unified workflow
// ---------------------------------------------------------------------------
export default smithers((ctx) => {
  const domainId: string = (ctx.input as any)?.domain || "tui";
  const domain = getDomain(domainId);
  const dir = domain.specsDir;
  const featureNames = domain.featureNames;
  const maxConcurrency = 8;

  // Diff handling
  const hasDiffs =
    ctx.input && (ctx.input as any).diffs && Object.keys((ctx.input as any).diffs).length > 0;
  const diffText = hasDiffs
    ? `\n\n--- RECENT CHANGES IN THIS RUN ---\n${Object.entries((ctx.input as any).diffs)
        .map(([f, d]) => `File: ${f}\nDiff:\n${d}`)
        .join("\n\n")}`
    : "";

  const baseSystemPrompt = domain.buildSystemPrompt(diffText);

  // ---------------------------------------------------------------------------
  // Agent pool
  //
  // Dispatch strategy:
  //   Spec writing:        Claude (quality-first, these are the source of truth)
  //   Research:            Claude (deep codebase exploration, asks follow-up questions)
  //   Review research:     Claude (asks questions about gaps, suggests further research)
  //   Plan:                Gemini (fast, precise step-by-step plans)
  //   Review plan:         Codex (strict validation, catches logical gaps)
  //   Implementation:      Gemini (primary) → Codex (complex/security) → Claude (rate-limit backup) → Kimi (trivial)
  //   Review impl:         Codex (strict, runs tests, demands perfection)
  //   Wave planning:       Claude (strategic, understands the full picture)
  //   Wave verification:   Claude (thorough post-sprint analysis, self-improvement)
  // ---------------------------------------------------------------------------

  // -- Spec writing (product specs, eng specs, arch, groups, tickets) --
  const specAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt: baseSystemPrompt,
    dangerouslySkipPermissions: true,
  });

  // -- Wave planning --
  const planningAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are a sprint planning agent. You analyze ticket dependencies, estimate complexity, and assign the optimal AI agent to each task. You optimize for maximum parallelism and minimal wave count.",
    dangerouslySkipPermissions: true,
  });

  // -- Wave verification --
  const verifierAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are a post-sprint verification agent. You check implementations for correctness, run tests, and identify both product bugs and workflow improvements. You are meticulous and thorough.",
    dangerouslySkipPermissions: true,
  });

  // -- Research: Claude --
  // Deep codebase exploration. Claude is best at understanding complex codebases
  // and finding non-obvious connections between files and patterns.
  // Research: Gemini (fast codebase exploration — saves Claude quota for review)
  const researchAgent = new GeminiAgent({
    model: "gemini-3.1-pro-preview",
    approvalMode: "yolo",
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are a codebase researcher. Your job is to find all relevant context, patterns, and existing code that will help implement a ticket. You are thorough and document everything with specific file paths and line numbers. Leave no stone unturned.",
  });

  // -- Review Research: Claude --
  // Claude reviews research by asking probing questions about gaps and suggesting
  // areas that need further investigation. Not just "is it complete?" but
  // "what questions does this research NOT answer that the implementer will need?"
  const reviewResearchAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are a research reviewer. Your job is NOT just to check completeness — it's to ask the hard questions. What edge cases weren't explored? What existing patterns were missed? What assumptions need validation? If the research wouldn't give an implementer everything they need to write correct code on the first try, reject it with specific questions that need answering.",
    dangerouslySkipPermissions: true,
  });

  // -- Plan: Gemini --
  // Fast, precise step-by-step plans with exact file paths and code structure.
  const planAgent = new GeminiAgent({
    model: "gemini-3.1-pro-preview",
    approvalMode: "yolo",
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are an implementation planner. You create clear, step-by-step plans with exact file paths, code changes, and test specifications. You are precise and thorough.",
  });

  // -- Review Plan: Codex --
  // Strict validation. Catches logical gaps, missing steps, incorrect assumptions.
  const reviewPlanAgent = new CodexAgent({
    model: "gpt-5.3-codex",
    yolo: true,
    systemPrompt:
      baseSystemPrompt +
      "\n\nYou are a plan reviewer. You verify implementation plans are correct, complete, and match the engineering spec. Check for missing steps, logical gaps, and edge cases. If there is ANY flaw, reject it.",
  });

  // -- Review Implementation: Codex --
  // Runs tests, reads code, demands perfection. No nits allowed through.
  const reviewImplAgent = new CodexAgent({
    model: "gpt-5.3-codex",
    yolo: true,
    systemPrompt: baseSystemPrompt + domain.reviewPromptSuffix,
  });

  // -- Implementation: wave planner dispatches from this pool --
  // Dispatch rules (encoded in the wave planner prompt):
  //   gemini: default for most tickets (fast, reliable)
  //   codex:  non-frontend, architecturally complex, security-sensitive
  //   claude: rate-limit backup when gemini/codex unavailable
  //   kimi:   trivially easy changes (rename, config, simple CRUD)
  const implementAgents: Record<string, any> = {
    gemini: new GeminiAgent({
      model: "gemini-3.1-pro-preview",
      approvalMode: "yolo",
      systemPrompt: baseSystemPrompt + domain.implementPromptSuffix,
    }),
    codex: new CodexAgent({
      model: "gpt-5.3-codex",
      yolo: true,
      systemPrompt: baseSystemPrompt + domain.implementPromptSuffix,
    }),
    claude: new ClaudeCodeAgent({
      model: "claude-opus-4-6",
      systemPrompt: baseSystemPrompt + domain.implementPromptSuffix,
      dangerouslySkipPermissions: true,
    }),
    kimi: new KimiAgent({
      model: "kimi-latest",
      yolo: true,
      systemPrompt: baseSystemPrompt + domain.implementPromptSuffix,
    }),
  };

  // ---------------------------------------------------------------------------
  // Load state
  // ---------------------------------------------------------------------------
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

  // Completed bookmarks
  const completedBookmarks = new Set<string>();
  if (masterTickets.length > 0) {
    try {
      const bookmarksList = execJJ(
        ["bookmark", "list", "--all", "-T", 'if(!remote, name ++ "\\n")'],
        rootDir()
      );
      for (const line of bookmarksList.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith(domain.bookmarkPrefix)) {
          completedBookmarks.add(trimmed.slice(domain.bookmarkPrefix.length));
        }
      }
    } catch {}
  }

  // Ready tickets: plan done + all deps bookmarked + not yet implemented
  const readyTickets = masterTickets.filter((t) => {
    if (completedBookmarks.has(t.id)) return false;
    // Must have completed plan (from ticket prep phase)
    const planDone = ctx.outputMaybe(outputs.done, { nodeId: `done-plan-${t.id}` });
    if (!planDone) return false;
    // All dependency tickets must be implemented (bookmarked)
    return (t.dependencies || []).every((d: string) => completedBookmarks.has(d));
  });

  const allDone = masterTickets.length > 0 && masterTickets.every((t) => completedBookmarks.has(t.id));

  // Wave number tracking
  let waveNumber = 0;
  for (let i = 1; i <= 100; i++) {
    if (ctx.outputMaybe(outputs.wavePlan, { nodeId: `wave-plan-${i}` })) {
      waveNumber = i;
    } else break;
  }
  const nextWave = waveNumber + 1;

  let previousWaveNotes = "";
  if (waveNumber > 0) {
    const prevVerify = ctx.outputMaybe(outputs.waveVerification, { nodeId: `wave-verify-${waveNumber}` });
    if (prevVerify) previousWaveNotes = prevVerify.nextWaveNotes;
  }

  // Read the latest wave plan directly from the DB file (bypasses ctx snapshot
  // which may be stale within the same render cycle). This is critical because
  // the wave-plan task writes to DB, then the execution block needs to see it
  // in the same Sequence, but ctx.outputMaybe uses a snapshot from the top of
  // the render which was taken before the wave-plan task ran.
  let currentWavePlan: any = null;
  let lastWaveExecuted = true;
  if (waveNumber > 0) {
    try {
      const dbPath = path.join(rootDir(), "smithers.db");
      const Database = require("bun:sqlite").default;
      const db = new Database(dbPath, { readonly: true });
      const row = db.query(
        `SELECT * FROM wave_plan WHERE node_id = ? ORDER BY rowid DESC LIMIT 1`
      ).get(`wave-plan-${waveNumber}`);
      db.close();
      if (row && row.assignments) {
        const assignments = typeof row.assignments === "string" ? JSON.parse(row.assignments) : row.assignments;
        const allBookmarked = assignments.every((a: any) =>
          completedBookmarks.has(a.ticketId)
        );
        if (!allBookmarked) {
          currentWavePlan = { ...row, assignments };
          lastWaveExecuted = false;
        }
      }
    } catch (err) {
      // DB read failed — fall back to ctx.outputMaybe
      const fallback = ctx.outputMaybe(outputs.wavePlan, { nodeId: `wave-plan-${waveNumber}` });
      if (fallback) {
        const allBookmarked = (fallback.assignments || []).every((a: any) =>
          completedBookmarks.has(a.ticketId)
        );
        if (!allBookmarked) {
          currentWavePlan = fallback;
          lastWaveExecuted = false;
        }
      }
    }
  }

  // Prep DAG (spec → research → plan per ticket)
  const flatNodes: any[] = [];
  for (const t of masterTickets) {
    flatNodes.push({ id: `spec-${t.id}`, type: "spec", ticket: t, dependsOn: [] });
    flatNodes.push({ id: `research-${t.id}`, type: "research", ticket: t, dependsOn: [`done-spec-${t.id}`] });
    flatNodes.push({ id: `plan-${t.id}`, type: "plan", ticket: t, dependsOn: [`done-research-${t.id}`] });
  }

  const githubSynced = ctx.outputMaybe(outputs.githubSync, { nodeId: "github-sync" });

  // Issue map for linking PRs
  let issueMap: Record<string, number> = {};
  try {
    issueMap = JSON.parse(fsSync.readFileSync(path.join(dir, ".github-issue-map.json"), "utf-8"));
  } catch {}

  // Worktree base path
  const worktreeBase = path.join(rootDir(), ".worktrees");

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Workflow name={`generate-${domain.id}-specs`}>
      <Sequence>
        {/* ============================================================
            Phase 1: Spec generation pipeline
            ============================================================ */}
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
          dir={dir}
        />

        <HighLevelArchPhase
          ctx={ctx}
          impact={impact}
          featureNames={featureNames}
          specAgent={specAgent}
          outputs={outputs}
          dir={dir}
        />

        <FeatureGroupsPhase
          ctx={ctx}
          impact={impact}
          featureNames={featureNames}
          archContent={archContent}
          specAgent={specAgent}
          outputs={outputs}
          dir={dir}
        />

        <GroupTicketsPhase
          ctx={ctx}
          impact={impact}
          featureGroups={featureGroups}
          archContent={archContent}
          specAgent={specAgent}
          outputs={outputs}
          dir={dir}
        />

        <LinkDependenciesPhase
          ctx={ctx}
          featureGroups={featureGroups}
          outputs={outputs}
          dir={dir}
        />

        {/* ============================================================
            Phase 3+4+5: Prep, GitHub sync, and implementation run
            concurrently via Parallel. Wave planner picks from
            tickets whose plans are done and deps are met.
            ============================================================ */}
        {/* GitHub sync — fire and forget, doesn't block pipeline */}
        {linkResult && masterTickets.length > 0 ? (
          <Task id="github-sync" output={outputs.githubSync}>
            {async () => {
              try {
                const map = syncTicketsToIssues(masterTickets, domain);
                fsSync.writeFileSync(
                  path.join(dir, ".github-issue-map.json"),
                  JSON.stringify(Object.fromEntries(map), null, 2),
                  "utf-8"
                );
              } catch (err) {
                console.error("GitHub sync failed:", err);
              }
              return { success: true };
            }}
          </Task>
        ) : null}

        {/* Ticket prep — spec/research/plan for all tickets */}
        {linkResult ? (
          <TicketPrepPhase
            ctx={ctx}
            impact={impact}
            flatNodes={flatNodes}
            archContent={archContent}
            domain={domain}
            specAgent={specAgent}
            researchAgent={researchAgent}
            planAgent={planAgent}
            reviewResearchAgent={reviewResearchAgent}
            reviewPlanAgent={reviewPlanAgent}
            outputs={outputs}
          />
        ) : null}

        {/* Wave planning */}
        {!allDone && readyTickets.length > 0 && !currentWavePlan && lastWaveExecuted ? (
          <Task
            id={`wave-plan-${nextWave}`}
            output={outputs.wavePlan}
            agent={planningAgent}
            timeoutMs={600000}
          >
            {`You are the sprint planning agent for the ${domain.name} implementation.

## Current State
- **Wave:** ${nextWave}
- **Total tickets:** ${masterTickets.length}
- **Completed:** ${completedBookmarks.size} (${Math.round((completedBookmarks.size / masterTickets.length) * 100)}%)
- **Ready:** ${readyTickets.length}
- **Max concurrent:** ${maxConcurrency}

## Ready Tickets
${readyTickets.map((t: any) => `- **${t.id}**: ${t.title} (type: ${t.type}, deps: [${(t.dependencies || []).join(", ")}], est: ${t.estimateHours || "?"}h)`).join("\n")}

## Completed
${[...completedBookmarks].map((id) => `- ✅ ${id}`).join("\n") || "None yet"}

${previousWaveNotes ? `## Previous Wave Notes\n${previousWaveNotes}` : ""}

## Agent Dispatch Rules (FOLLOW THESE EXACTLY)

You are assigning an **implementation agent** to each ticket. The rules are:

1. **codex** (GPT 5.3 Codex) — **DEFAULT for most tickets.** Fast, reliable tool usage, great at writing code using proper file tools. Use for most implementation work including frontend UI, data hooks, CRUD, and standard features.

2. **gemini** (Gemini 3.1 Pro) — Use for tasks that require extensive codebase exploration or research-heavy implementation. Gemini is good at reading many files and understanding patterns.

3. **claude** (Claude Opus 4.6) — Use for **architecturally complex** work, security-sensitive code, or when codex/gemini are getting rate-limited. Claude is the most capable but expensive.

4. **kimi** (Kimi) — Use for **trivially easy** changes: config file updates, simple renames, adding a constant, one-line fixes, boilerplate scaffolding.

**When in doubt, use codex.**

## Instructions
1. Select up to ${maxConcurrency} tickets for this wave
2. Assign an agent type to each following the dispatch rules above
3. Assign workspace slot indices (0-${maxConcurrency - 1})
4. Prioritize tickets that unblock the most downstream work
5. Avoid tickets that touch the same files in the same wave
6. Spread gemini/codex assignments to avoid rate-limiting one provider

Output structured JSON matching the schema.`}
          </Task>
        ) : null}

        {/* Wave execution */}
        {currentWavePlan ? (
          <Sequence>
            {/* Sequential implementation — one worktree at a time to avoid
                jj operation conflicts from concurrent workspace writes */}
              {(currentWavePlan.assignments || []).map((assignment: any) => {
                const ticket = masterTickets.find((t: any) => t.id === assignment.ticketId);
                if (!ticket) return null;

                const agent = implementAgents[assignment.agentType] || implementAgents.gemini;
                const bookmarkName = `${domain.bookmarkPrefix}${ticket.id}`;
                const worktreePath = path.join(worktreeBase, `impl`);

                // Check latest review for this ticket's loop exit condition
                const latestReview = ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` });

                return (
                  <Worktree
                    key={`wt-${ticket.id}`}
                    id={`worktree-${ticket.id}`}
                    path={worktreePath}
                    branch={bookmarkName}
                    baseBranch="main"
                  >
                    <Sequence>
                      {/* Implement → Review loop: retries until LGTM or max 3 iterations */}
                      <Loop
                        id={`impl-loop-${ticket.id}`}
                        until={latestReview?.lgtm === true}
                        maxIterations={3}
                        onMaxReached="return-last"
                      >
                        <Sequence>
                          <Task
                            id={`implement-${ticket.id}`}
                            output={outputs.implement}
                            agent={agent}
                            retries={1}
                            timeoutMs={1800000}
                          >
                            {`Implement ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(dir, "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Plan:
${(() => { try { return fsSync.readFileSync(path.join(dir, "plans", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

${latestReview && !latestReview.lgtm ? `REVIEW FEEDBACK FROM PREVIOUS ATTEMPT (you MUST address all of this):\n${latestReview.feedback}` : ""}

You are working in an isolated jj workspace. All your file operations automatically target this workspace.
Follow the plan exactly. Run tests to verify your work.
${ctx.iteration > 0 ? `\nThis is iteration ${ctx.iteration}. The reviewer rejected your previous attempt. Fix ALL issues mentioned in the feedback above.` : ""}

Return JSON with: summary (string), filesChanged (string array)`}
                          </Task>

                          <Task
                            id={`review-impl-${ticket.id}`}
                            output={outputs.review}
                            agent={reviewImplAgent}
                            retries={1}
                            timeoutMs={1800000}
                          >
                            {`Review implementation for ticket: ${ticket.id}

The implementer produced:
Summary: ${ctx.outputMaybe(outputs.implement, { nodeId: `implement-${ticket.id}` })?.summary || "N/A"}
Files changed: ${ctx.outputMaybe(outputs.implement, { nodeId: `implement-${ticket.id}` })?.filesChanged?.join("\n") || "N/A"}

${ctx.iteration > 0 ? `This is review iteration ${ctx.iteration}. Previous review feedback was:\n${latestReview?.feedback || "N/A"}\n\nVerify that ALL previous feedback has been addressed.` : ""}

Run tests, read the code, be EXTREMELY strict. If you can think of ANY way to improve, including nits, do NOT LGTM.

Return JSON with lgtm (boolean) and feedback (string).`}
                          </Task>

                          {/* Save review feedback each iteration */}
                          <Task id={`write-review-impl-${ticket.id}`} output={outputs.writeReview}>
                            {async () => {
                              const r = ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` });
                              if (r && !r.lgtm) {
                                const reviewDir = path.join(dir, "reviews");
                                const fs = await import("node:fs/promises");
                                await fs.mkdir(reviewDir, { recursive: true });
                                await fs.writeFile(
                                  path.join(reviewDir, `${ticket.id}-wave-${waveNumber}-iter-${ctx.iteration}.md`),
                                  r.feedback,
                                  "utf-8"
                                );
                              }
                              return { success: true };
                            }}
                          </Task>
                        </Sequence>
                      </Loop>

                      {/* Bookmark, push, create PR — runs AFTER the loop exits */}
                      <Task id={`bookmark-${ticket.id}`} output={outputs.bookmark}>
                        {async () => {
                          const root = rootDir();

                          // Describe the change in the worktree
                          execJJ(["describe", "-m", `🔧 impl(${domain.id}/${ticket.id}): ${ticket.title}`], worktreePath);

                          // Get change ID
                          const changeId = execJJ(
                            ["log", "-r", "@", "--no-graph", "-T", "change_id"],
                            worktreePath
                          );

                          // Create/set bookmark from the main repo (shared op history)
                          try {
                            execJJ(["bookmark", "create", bookmarkName, "-r", changeId], root);
                          } catch {
                            execJJ(["bookmark", "set", bookmarkName, "--allow-backwards", "-r", changeId], root);
                          }

                          // Push to GitHub immediately
                          try {
                            pushBookmark(bookmarkName);
                          } catch (err) {
                            console.error(`Push failed for ${bookmarkName}:`, err);
                          }

                          // Create stacked PR
                          try {
                            const pr = createPR(ticket, domain, issueMap[ticket.id]);
                            if (pr && issueMap[ticket.id]) {
                              commentOnIssue(
                                issueMap[ticket.id],
                                `Implementation PR: #${pr.number}\nBookmark: \`${bookmarkName}\``
                              );
                            }
                          } catch (err) {
                            console.error(`PR creation failed for ${ticket.id}:`, err);
                          }

                          return { ticketId: ticket.id, changeId, bookmarkName };
                        }}
                      </Task>
                    </Sequence>
                  </Worktree>
                );
              })}

            {/* Post-wave verification */}
            {(currentWavePlan.assignments || []).every((a: any) =>
              ctx.outputMaybe(outputs.bookmark, { nodeId: `bookmark-${a.ticketId}` })
            ) ? (
              <Task
                id={`wave-verify-${waveNumber}`}
                output={outputs.waveVerification}
                agent={verifierAgent}
                timeoutMs={1800000}
              >
                {`Post-wave verification for ${domain.name}, wave ${waveNumber}.

## Results
${(currentWavePlan.assignments || []).map((a: any) => {
  const impl = ctx.outputMaybe(outputs.implement, { nodeId: `implement-${a.ticketId}` });
  const review = ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${a.ticketId}` });
  const bm = ctx.outputMaybe(outputs.bookmark, { nodeId: `bookmark-${a.ticketId}` });
  return `### ${a.ticketId} (${a.agentType})
- Implement: ${impl ? `✅ ${impl.summary} (${impl.filesChanged.length} files)` : "❌ failed"}
- Review: ${review ? (review.lgtm ? "✅ LGTM" : `⚠️ ${review.feedback.slice(0, 200)}`) : "N/A"}
- Bookmark: ${bm ? `✅ ${bm.bookmarkName}` : "❌"}`;
}).join("\n\n")}

## Tasks
1. Read changed files and run tests to verify correctness
2. Identify bugs in implementations
3. Suggest workflow improvements to specs/generate/ files (hot-reloaded by --hot)
4. Write notes for the next wave's planning agent

Return structured JSON matching the schema.`}
              </Task>
            ) : null}
          </Sequence>
        ) : null}
      </Sequence>
    </Workflow>
  );
});

// ---------------------------------------------------------------------------
// TicketPrepPhase — parallel spec/research/plan
// ---------------------------------------------------------------------------
function TicketPrepPhase({
  ctx,
  impact,
  flatNodes,
  archContent,
  domain,
  specAgent,
  researchAgent,
  planAgent,
  reviewResearchAgent,
  reviewPlanAgent,
  outputs,
}: {
  ctx: any;
  impact: any;
  flatNodes: any[];
  archContent: string;
  domain: DomainConfig;
  specAgent: any;
  researchAgent: any;
  planAgent: any;
  reviewResearchAgent: any;
  reviewPlanAgent: any;
  outputs: any;
}) {
  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });
  if (!allTicketsDone || flatNodes.length === 0 || !impact) return null;

  const dir = domain.specsDir;
  const prepNodes = flatNodes.filter((n: any) => ["spec", "research", "plan"].includes(n.type));

  return (
    <Parallel maxConcurrency={6}>
      {prepNodes.map((node: any) => {
        const ticket = node.ticket;

        if (node.type === "spec") {
          const checkSpec = ctx.outputMaybe(outputs.checkTicketSpec, { nodeId: `check-spec-${ticket.id}` });
          return (
            <Sequence key={node.id}>
              <Task id={`check-spec-${ticket.id}`} output={outputs.checkTicketSpec} dependsOn={node.dependsOn}>
                {async () => {
                  const engDir = path.join(dir, "engineering");
                  const fs = await import("node:fs/promises");
                  await fs.mkdir(engDir, { recursive: true });
                  const p = path.join(engDir, `${ticket.id}.md`);
                  let content = "";
                  try { content = fsSync.readFileSync(p, "utf-8"); } catch {}
                  let prodContent = "";
                  if (ticket.type === "feature" && ticket.featureName) {
                    try { prodContent = fsSync.readFileSync(path.join(dir, `${ticket.featureName}.md`), "utf-8"); } catch {}
                  }
                  // Flexible section matching — handles numbered sections like "## 2. Implementation Plan"
                  let needsSpec = !content.match(/## .*Implementation Plan/) || !content.match(/## .*(?:Unit & Integration Tests|Test)/);
                  if (impact.invalidateTicketSpecsForTickets.includes(ticket.id)) needsSpec = true;
                  return { ticketId: ticket.id, needsSpec, existingContent: content, productSpec: prodContent };
                }}
              </Task>
              {checkSpec ? (
                <Branch
                  if={checkSpec.needsSpec}
                  then={
                    <Sequence>
                      <Task id={`generate-spec-${ticket.id}`} output={outputs.ticketSpec} agent={planAgent} retries={2} timeoutMs={1800000}>
                        {`Write the Engineering Specification for ticket: ${ticket.id}.
Title: ${ticket.title} | Type: ${ticket.type}
Description: ${ticket.description}
Dependencies: ${ticket.dependencies.join(", ") || "None"}
${checkSpec.productSpec ? `\nProduct Spec:\n${checkSpec.productSpec}\n` : ""}
Architecture: ${archContent}

Include "## Implementation Plan" and "## Unit & Integration Tests" sections.
Existing: ${checkSpec.existingContent || "None"}`}
                      </Task>
                      {ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` }) ? (
                        <Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>
                          {async () => {
                            const fs = await import("node:fs/promises");
                            await fs.writeFile(
                              path.join(dir, "engineering", `${ticket.id}.md`),
                              ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` })!.document,
                              "utf-8"
                            );
                            return { success: true };
                          }}
                        </Task>
                      ) : null}
                    </Sequence>
                  }
                  else={<Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>{{ success: true }}</Task>}
                />
              ) : null}
              {ctx.outputMaybe(outputs.writeTicketSpec, { nodeId: `write-spec-${ticket.id}` }) ? (
                <Task id={`done-spec-${ticket.id}`} output={outputs.done}>{{ success: true }}</Task>
              ) : null}
            </Sequence>
          );
        }

        if (node.type === "research") {
          const checkResearch = ctx.outputMaybe(outputs.checkResearch, { nodeId: `check-research-${ticket.id}` });
          return (
            <Sequence key={node.id}>
              <Task id={`check-research-${ticket.id}`} output={outputs.checkResearch} dependsOn={node.dependsOn}>
                {async () => {
                  const p = path.join(dir, "research", `${ticket.id}.md`);
                  try {
                    const content = fsSync.readFileSync(p, "utf-8");
                    let needsResearch = content.length < 10;
                    if (impact.invalidateResearchForTickets.includes(ticket.id)) needsResearch = true;
                    return { needsResearch, existingContent: content };
                  } catch { return { needsResearch: true, existingContent: "" }; }
                }}
              </Task>
              {checkResearch ? (
                <Branch
                  if={checkResearch.needsResearch}
                  then={
                    <Sequence>
                      <Task id={`generate-research-${ticket.id}`} output={outputs.researchOut} agent={researchAgent} retries={2} timeoutMs={1800000}>
                        {`Research ticket: ${ticket.id} — ${ticket.title}

Eng spec: ${(() => { try { return fsSync.readFileSync(path.join(dir, "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Search the codebase for relevant context. Return JSON with "document" (markdown research).`}
                      </Task>
                      <Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>
                        {async () => {
                          const fs = await import("node:fs/promises");
                          await fs.mkdir(path.join(dir, "research"), { recursive: true });
                          const out = ctx.outputMaybe(outputs.researchOut, { nodeId: `generate-research-${ticket.id}` });
                          if (out?.document) await fs.writeFile(path.join(dir, "research", `${ticket.id}.md`), out.document, "utf-8");
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={<Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>{{ success: true }}</Task>}
                />
              ) : null}
              {ctx.outputMaybe(outputs.writeResearch, { nodeId: `write-research-${ticket.id}` }) ? (
                <Task id={`done-research-${ticket.id}`} output={outputs.done}>{{ success: true }}</Task>
              ) : null}
            </Sequence>
          );
        }

        if (node.type === "plan") {
          const checkPlan = ctx.outputMaybe(outputs.checkPlan, { nodeId: `check-plan-${ticket.id}` });
          return (
            <Sequence key={node.id}>
              <Task id={`check-plan-${ticket.id}`} output={outputs.checkPlan} dependsOn={node.dependsOn}>
                {async () => {
                  const p = path.join(dir, "plans", `${ticket.id}.md`);
                  try {
                    const content = fsSync.readFileSync(p, "utf-8");
                    let needsPlan = content.length < 10;
                    if (impact.invalidatePlanForTickets.includes(ticket.id)) needsPlan = true;
                    return { needsPlan, existingContent: content };
                  } catch { return { needsPlan: true, existingContent: "" }; }
                }}
              </Task>
              {checkPlan ? (
                <Branch
                  if={checkPlan.needsPlan}
                  then={
                    <Sequence>
                      <Task id={`generate-plan-${ticket.id}`} output={outputs.planOut} agent={planAgent} retries={2} timeoutMs={1800000}>
                        {`Plan for ticket: ${ticket.id} — ${ticket.title}

Eng spec: ${(() => { try { return fsSync.readFileSync(path.join(dir, "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Research: ${(() => { try { return fsSync.readFileSync(path.join(dir, "research", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Create a step-by-step implementation plan. Return JSON with "document" (markdown plan).`}
                      </Task>
                      <Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>
                        {async () => {
                          const fs = await import("node:fs/promises");
                          await fs.mkdir(path.join(dir, "plans"), { recursive: true });
                          const out = ctx.outputMaybe(outputs.planOut, { nodeId: `generate-plan-${ticket.id}` });
                          if (out?.document) await fs.writeFile(path.join(dir, "plans", `${ticket.id}.md`), out.document, "utf-8");
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={<Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>{{ success: true }}</Task>}
                />
              ) : null}
              {ctx.outputMaybe(outputs.writePlan, { nodeId: `write-plan-${ticket.id}` }) ? (
                <Task id={`done-plan-${ticket.id}`} output={outputs.done}>{{ success: true }}</Task>
              ) : null}
            </Sequence>
          );
        }

        return null;
      })}
    </Parallel>
  );
}
