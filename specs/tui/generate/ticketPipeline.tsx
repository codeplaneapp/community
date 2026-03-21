/** @jsxImportSource smithers-orchestrator */
import { Task, Sequence, Branch } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as fsSync from "node:fs";
import { execJJ, specsDir, rootDir } from "./utils";

export const ticketPipelineSchemas = {
  checkTicketSpec: z.object({
    ticketId: z.string(),
    needsSpec: z.boolean(),
    existingContent: z.string(),
    productSpec: z.string().describe("Product spec content, or empty string if none"),
  }),
  ticketSpec: z.object({
    document: z.string().describe("Detailed engineering specification for this specific TUI ticket. Markdown format."),
  }),
  writeTicketSpec: z.object({ success: z.boolean() }),

  checkResearch: z.object({ needsResearch: z.boolean(), existingContent: z.string() }),
  researchOut: z.object({ document: z.string().describe("Research findings document. Markdown format.") }),
  writeResearch: z.object({ success: z.boolean() }),

  checkPlan: z.object({ needsPlan: z.boolean(), existingContent: z.string() }),
  planOut: z.object({ document: z.string().describe("Implementation plan document. Markdown format.") }),
  writePlan: z.object({ success: z.boolean() }),

  implement: z.object({
    summary: z.string().describe("Summary of what was implemented."),
    filesChanged: z.array(z.string()).describe("List of files modified or created."),
  }),
  review: z.object({
    lgtm: z.boolean().describe("True ONLY if the code/doc is perfect, passes all tests, and has no nits."),
    feedback: z.string().describe("Detailed feedback if not LGTM, otherwise 'LGTM'."),
  }),
  writeReview: z.object({ success: z.boolean() }),

  done: z.object({ success: z.boolean() }),

  bookmark: z.object({
    ticketId: z.string(),
    changeId: z.string(),
    bookmarkName: z.string(),
  }),
};

/**
 * Sequential ticket pipeline — processes one ticket at a time on the working copy.
 *
 * For each ticket: spec → research → plan → implement → review → jj bookmark.
 * All work happens directly in the repo working copy (no worktrees).
 */
export function TicketPipelinePhase({
  ctx,
  impact,
  flatNodes,
  archContent,
  specAgent,
  implementAgent,
  reviewAgent,
  outputs,
}: {
  ctx: any;
  impact: any;
  flatNodes: any[];
  archContent: string;
  specAgent: any;
  implementAgent: any;
  reviewAgent: any;
  outputs: any;
}) {
  const dir = specsDir();
  const root = rootDir();
  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });
  if (!allTicketsDone || flatNodes.length === 0 || !impact) return null;

  return (
    <Sequence>
      {flatNodes.map((node) => {
        const ticket = node.ticket;

        if (node.type === "spec") {
          const checkSpec = ctx.outputMaybe(outputs.checkTicketSpec, { nodeId: `check-spec-${ticket.id}` });
          return (
            <Sequence key={node.id}>
              <Task id={`check-spec-${ticket.id}`} output={outputs.checkTicketSpec} dependsOn={node.dependsOn}>
                {async () => {
                  const engDir = path.join(dir, "engineering");
                  await fs.mkdir(engDir, { recursive: true });
                  const p = path.join(engDir, `${ticket.id}.md`);
                  let content = "";
                  try { content = await fs.readFile(p, "utf-8"); } catch {}
                  let prodContent = "";
                  if (ticket.type === "feature" && ticket.featureName) {
                    try { prodContent = await fs.readFile(path.join(dir, `${ticket.featureName}.md`), "utf-8"); } catch {}
                  }
                  let needsSpec =
                    !content.includes("## Implementation Plan") || !content.includes("## Unit & Integration Tests");
                  if (impact.invalidateTicketSpecsForTickets.includes(ticket.id)) needsSpec = true;
                  return { ticketId: ticket.id, needsSpec, existingContent: content, productSpec: prodContent };
                }}
              </Task>
              {checkSpec ? (
                <Branch
                  if={checkSpec.needsSpec}
                  then={
                    <Sequence>
                      <Task id={`generate-spec-${ticket.id}`} output={outputs.ticketSpec} agent={specAgent} retries={2} timeoutMs={1800000}>
                        {`Write the detailed Engineering Specification for the TUI ticket: ${ticket.id}.

Ticket Details:
Title: ${ticket.title}
Type: ${ticket.type}
Description: ${ticket.description}
Dependencies: ${ticket.dependencies.join(", ") || "None"}

${checkSpec.productSpec ? `Product Spec Context:\n${checkSpec.productSpec}\n` : ""}
TUI Engineering Architecture Context:
${archContent}

Requirements:
1. Create a section "## Implementation Plan" that breaks this ticket down into vertical engineering steps.
2. All code goes in apps/tui/src/ — specify exact file paths.
3. Use OpenTUI components and hooks. Reference context/opentui/ for API details.
4. Consume @codeplane/ui-core hooks for data access.
5. Create a section "## Unit & Integration Tests".
6. Test specs must use @microsoft/tui-test with snapshot matching and keyboard interaction simulation.
7. Tests target e2e/tui/ — specify exact test file paths.
8. Tests that fail due to unimplemented backends are left failing (never skip/comment).
9. Follow architecture rules: No mocking of implementation details.
10. Explicitly outline how to productionize any POC code in apps/tui/.

If an existing engineering spec is provided, update and improve it. Otherwise build from scratch.

Existing Content:
${checkSpec.existingContent || "None"}`}
                      </Task>
                      {ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` }) ? (
                        <Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>
                          {async () => {
                            const p = path.join(dir, "engineering", `${ticket.id}.md`);
                            await fs.writeFile(p, ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` })!.document, "utf-8");
                            return { success: true };
                          }}
                        </Task>
                      ) : null}
                    </Sequence>
                  }
                  else={
                    <Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>{{ success: true }}</Task>
                  }
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
                    const content = await fs.readFile(p, "utf-8");
                    let needsResearch = content.length < 10;
                    if (impact.invalidateResearchForTickets.includes(ticket.id)) needsResearch = true;
                    return { needsResearch, existingContent: content };
                  } catch {
                    return { needsResearch: true, existingContent: "" };
                  }
                }}
              </Task>
              {checkResearch ? (
                <Branch
                  if={checkResearch.needsResearch}
                  then={
                    <Sequence>
                      <Task id={`generate-research-${ticket.id}`} output={outputs.researchOut} agent={implementAgent} retries={2} timeoutMs={1800000}>
                        {`Research context for TUI ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(dir, "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Your job is to find any and all useful context in the codebase that can help implement this TUI feature.
Search these key directories:
- apps/tui/ — existing TUI code and patterns
- context/opentui/ — OpenTUI component APIs, hooks, and examples
- packages/ui-core/ — shared data hooks and API client
- apps/ui/src/ — web UI patterns that the TUI mirrors (for reference)

Document your findings comprehensively. Do NOT write the implementation plan yet. Just research.

Return a JSON object with a "document" string containing your markdown research.`}
                      </Task>
                      <Task id={`review-research-${ticket.id}`} output={outputs.review} agent={reviewAgent} retries={1} timeoutMs={1800000}>
                        {`Review the research for TUI ticket: ${ticket.id}

The researcher produced this document:
${ctx.outputMaybe(outputs.researchOut, { nodeId: `generate-research-${ticket.id}` })?.document}

Your job:
1. Verify the research covers OpenTUI component APIs relevant to this feature.
2. Verify @codeplane/ui-core hooks needed are identified.
3. Verify existing TUI code patterns were explored.
4. If it lacks depth, references to specific files/lines, or misses TUI-specific context, do NOT LGTM.

Return a JSON object with:
- lgtm: boolean (true ONLY if perfect)
- feedback: string (detailed feedback, or "LGTM" if perfect)`}
                      </Task>
                      <Task id={`write-review-research-${ticket.id}`} output={outputs.writeReview}>
                        {async () => {
                          const r = ctx.outputMaybe(outputs.review, { nodeId: `review-research-${ticket.id}` });
                          if (r && !r.lgtm) {
                            const reviewDir = path.join(dir, "reviews");
                            await fs.mkdir(reviewDir, { recursive: true });
                            await fs.writeFile(path.join(reviewDir, `research-${ticket.id}-iteration-0.md`), r.feedback, "utf-8");
                          }
                          return { success: true };
                        }}
                      </Task>
                      <Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>
                        {async () => {
                          const researchDir = path.join(dir, "research");
                          await fs.mkdir(researchDir, { recursive: true });
                          const out = ctx.outputMaybe(outputs.researchOut, { nodeId: `generate-research-${ticket.id}` });
                          if (out?.document) {
                            await fs.writeFile(path.join(researchDir, `${ticket.id}.md`), out.document, "utf-8");
                          }
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={
                    <Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>{{ success: true }}</Task>
                  }
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
                    const content = await fs.readFile(p, "utf-8");
                    let needsPlan = content.length < 10;
                    if (impact.invalidatePlanForTickets.includes(ticket.id)) needsPlan = true;
                    return { needsPlan, existingContent: content };
                  } catch {
                    return { needsPlan: true, existingContent: "" };
                  }
                }}
              </Task>
              {checkPlan ? (
                <Branch
                  if={checkPlan.needsPlan}
                  then={
                    <Sequence>
                      <Task id={`generate-plan-${ticket.id}`} output={outputs.planOut} agent={implementAgent} retries={2} timeoutMs={1800000}>
                        {`Create an implementation plan for TUI ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(dir, "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Research Findings:
${(() => { try { return fsSync.readFileSync(path.join(dir, "research", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Your job is to come up with a clear, step-by-step implementation plan.
- All TUI code goes in apps/tui/src/ — specify exact file paths
- Use OpenTUI components and hooks
- Consume @codeplane/ui-core for data access
- E2E tests go in e2e/tui/ using @microsoft/tui-test
- Tests that fail due to unimplemented backends stay failing
- Productionize any POC code (proper error handling, types, logging)
- Include explicit steps for creating/updating E2E tests in e2e/tui/

Return a JSON object with a "document" string containing your markdown plan.`}
                      </Task>
                      <Task id={`review-plan-${ticket.id}`} output={outputs.review} agent={reviewAgent} retries={1} timeoutMs={1800000}>
                        {`Review the implementation plan for TUI ticket: ${ticket.id}

The planner produced this document:
${ctx.outputMaybe(outputs.planOut, { nodeId: `generate-plan-${ticket.id}` })?.document}

Your job:
1. Verify the plan uses OpenTUI components and hooks correctly.
2. Verify @codeplane/ui-core hooks are used for data access.
3. Verify all code targets apps/tui/src/ and tests target e2e/tui/.
4. Verify keyboard interactions match the TUI design spec.
5. If there is ANY flaw, missing step, or lack of specificity, do NOT LGTM.

Return a JSON object with:
- lgtm: boolean (true ONLY if perfect)
- feedback: string (detailed feedback, or "LGTM" if perfect)`}
                      </Task>
                      <Task id={`write-review-plan-${ticket.id}`} output={outputs.writeReview}>
                        {async () => {
                          const r = ctx.outputMaybe(outputs.review, { nodeId: `review-plan-${ticket.id}` });
                          if (r && !r.lgtm) {
                            const reviewDir = path.join(dir, "reviews");
                            await fs.mkdir(reviewDir, { recursive: true });
                            await fs.writeFile(path.join(reviewDir, `plan-${ticket.id}-iteration-0.md`), r.feedback, "utf-8");
                          }
                          return { success: true };
                        }}
                      </Task>
                      <Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>
                        {async () => {
                          const plansDir = path.join(dir, "plans");
                          await fs.mkdir(plansDir, { recursive: true });
                          const out = ctx.outputMaybe(outputs.planOut, { nodeId: `generate-plan-${ticket.id}` });
                          if (out?.document) {
                            await fs.writeFile(path.join(plansDir, `${ticket.id}.md`), out.document, "utf-8");
                          }
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={
                    <Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>{{ success: true }}</Task>
                  }
                />
              ) : null}
              {ctx.outputMaybe(outputs.writePlan, { nodeId: `write-plan-${ticket.id}` }) ? (
                <Task id={`done-plan-${ticket.id}`} output={outputs.done}>{{ success: true }}</Task>
              ) : null}
            </Sequence>
          );
        }

        if (node.type === "implement") {
          const checkImpl = ctx.outputMaybe(outputs.checkPlan, { nodeId: `check-impl-${ticket.id}` });
          return (
            <Sequence key={node.id}>
              <Task id={`check-impl-${ticket.id}`} output={outputs.checkPlan} dependsOn={node.dependsOn}>
                {async () => {
                  // Check if this ticket's bookmark already exists (meaning impl is done)
                  let needsImpl = true;
                  try {
                    const bookmarks = execJJ(["bookmark", "list", "--all", "-T", "name"], root);
                    if (bookmarks.includes(`tui-impl/${ticket.id}`)) {
                      // Bookmark exists — check if it's an empty commit (previous failed run)
                      try {
                        const diffStat = execJJ(
                          ["diff", "--stat", "-r", `bookmarks("tui-impl/${ticket.id}")"`],
                          root
                        );
                        // If diff --stat is empty, the bookmark has no changes — re-implement
                        if (!diffStat.trim()) {
                          needsImpl = true;
                        } else {
                          needsImpl = false;
                        }
                      } catch {
                        // If we can't check, assume we need to re-implement
                        needsImpl = true;
                      }
                    }
                  } catch {}
                  if (impact.invalidateImplForTickets.includes(ticket.id)) needsImpl = true;
                  return { needsPlan: needsImpl, existingContent: "" };
                }}
              </Task>
              {checkImpl ? (
                <Branch
                  if={checkImpl.needsPlan}
                  then={
                    <Sequence>
                      <Task
                        id={`implement-${ticket.id}`}
                        output={outputs.implement}
                        agent={implementAgent}
                        retries={1}
                        timeoutMs={1800000}
                        dependsOn={node.dependsOn}
                      >
                        {`Implement the TUI feature for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(dir, "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Plan:
${(() => { try { return fsSync.readFileSync(path.join(dir, "plans", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

${ctx.iteration > 0 ? `REVIEW FEEDBACK FROM PREVIOUS ATTEMPT:\n${ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` })?.feedback}` : ""}

Use your tools to write the code, modify files, and ensure tests pass. Follow the plan exactly.
- All TUI code goes in apps/tui/src/
- Use OpenTUI components and hooks
- Consume @codeplane/ui-core hooks for data access
- E2E tests go in e2e/tui/ using @microsoft/tui-test
- Tests that fail due to unimplemented backends stay failing (never skip/comment)
- You are working directly on the repo working copy — all your file writes persist

Return a JSON object with:
- summary: string explaining what you did
- filesChanged: string array of file paths you modified/created`}
                      </Task>

                      <Task id={`review-impl-${ticket.id}`} output={outputs.review} agent={reviewAgent} retries={1} timeoutMs={1800000}>
                        {`Review the TUI implementation for ticket: ${ticket.id}

The implementer claims to have done:
${ctx.outputMaybe(outputs.implement, { nodeId: `implement-${ticket.id}` })?.summary}

Files changed:
${ctx.outputMaybe(outputs.implement, { nodeId: `implement-${ticket.id}` })?.filesChanged.join("\n")}

Your job:
1. Run tests using your bash tool.
2. Read the modified code in apps/tui/src/.
3. Verify OpenTUI components and hooks are used correctly.
4. Verify keyboard interactions match the TUI design spec.
5. Verify @codeplane/ui-core hooks are used for data access (no direct API calls).
6. Be EXTREMELY strict. If you can think of ANY way to improve, including nits, do NOT LGTM.

Return a JSON object with:
- lgtm: boolean (true ONLY if perfect)
- feedback: string (detailed feedback, or "LGTM" if perfect)`}
                      </Task>

                      <Task id={`write-review-impl-${ticket.id}`} output={outputs.writeReview}>
                        {async () => {
                          const r = ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` });
                          if (r && !r.lgtm) {
                            const reviewDir = path.join(dir, "reviews");
                            await fs.mkdir(reviewDir, { recursive: true });
                            await fs.writeFile(path.join(reviewDir, `${ticket.id}-iteration-${ctx.iteration}.md`), r.feedback, "utf-8");
                          }
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={null}
                />
              ) : null}
              <Task id={`done-impl-${ticket.id}`} output={outputs.done}>
                {{ success: true }}
              </Task>
            </Sequence>
          );
        }

        if (node.type === "bookmark") {
          return (
            <Sequence key={node.id}>
              <Task id={`bookmark-${ticket.id}`} output={outputs.bookmark} dependsOn={node.dependsOn}>
                {async () => {
                  const bookmarkName = `tui-impl/${ticket.id}`;
                  // Describe the current change with the ticket info
                  execJJ(["describe", "-m", `🔧 impl(tui/${ticket.id}): ${ticket.title}`], root);
                  // Create a new change so the next ticket starts fresh
                  execJJ(["new"], root);
                  // Get the change ID of the commit we just described (parent of @)
                  const changeId = execJJ(["log", "-r", "@-", "--no-graph", "-T", "change_id"], root);
                  // Bookmark the completed change
                  try {
                    execJJ(["bookmark", "create", bookmarkName, "-r", "@-"], root);
                  } catch {
                    execJJ(["bookmark", "set", bookmarkName, "-r", "@-"], root);
                  }
                  return { ticketId: ticket.id, changeId, bookmarkName };
                }}
              </Task>
            </Sequence>
          );
        }

        return null;
      })}
    </Sequence>
  );
}
