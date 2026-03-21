/** @jsxImportSource smithers-orchestrator */
import { Task, Parallel, Sequence, Branch, Loop, Worktree } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as fsSync from "node:fs";
import { execJJ, specsDir } from "./utils";

export const ticketPipelineSchemas = {
  checkTicketSpec: z.object({
    ticketId: z.string(),
    needsSpec: z.boolean(),
    existingContent: z.string(),
    productSpec: z.string().nullable(),
  }),
  ticketSpec: z.object({
    document: z.string().describe("Detailed engineering specification for this specific ticket. Markdown format."),
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
  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });
  if (!allTicketsDone || flatNodes.length === 0 || !impact) return null;

  return (
    <Parallel maxConcurrency={8}>
      {flatNodes.map((node) => {
        const ticket = node.ticket;

        if (node.type === "spec") {
          const checkSpec = ctx.outputMaybe(outputs.checkTicketSpec, { nodeId: `check-spec-${ticket.id}` });
          return (
            <Sequence key={node.id} skipIf={false}>
              <Task id={`check-spec-${ticket.id}`} output={outputs.checkTicketSpec} dependsOn={node.dependsOn}>
                {async () => {
                  const engDir = path.join(specsDir(),"engineering");
                  await fs.mkdir(engDir, { recursive: true });
                  const p = path.join(engDir, `${ticket.id}.md`);
                  let content = "";
                  try {
                    content = await fs.readFile(p, "utf-8");
                  } catch {}
                  let prodContent = null;
                  if (ticket.type === "feature" && ticket.featureName) {
                    try {
                      prodContent = await fs.readFile(
                        path.join(specsDir(),`${ticket.featureName}.md`),
                        "utf-8"
                      );
                    } catch {}
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
                      <Task
                        id={`generate-spec-${ticket.id}`}
                        output={outputs.ticketSpec}
                        agent={specAgent}
                        retries={2}
                        timeoutMs={1800000}
                      >
                        {`Write the detailed Engineering Specification for the ticket: ${ticket.id}.

Ticket Details:
Title: ${ticket.title}
Type: ${ticket.type}
Description: ${ticket.description}
Dependencies: ${ticket.dependencies.join(", ") || "None"}

${checkSpec.productSpec ? `Product Spec Context:\n${checkSpec.productSpec}\n` : ""}
High-Level Architecture Context:
${archContent}

Requirements:
1. Create a section "## Implementation Plan" that breaks this ticket down into vertical engineering steps.
2. Go into detail for anything important, but do NOT specify arbitrary decisions where there are multiple good options.
3. If this ticket relies on a new 3rd-party dependency (other than core frameworks like React), outline exactly how the PoC test must be written to prove it works before integration.
4. Create a section "## Unit & Integration Tests".
5. Provide clear Acceptance Criteria including unit and integration tests that provide 100% certainty.
6. Test specifications must think through corner cases, boundary inputs, and error states.
7. Follow the architecture rules: No mocking of implementation details (only stable boundaries if absolutely necessary).
8. If this ticket affects user-facing behavior, specify how the docs/ folder documentation must be updated.
9. If this ticket affects CLI or API behavior, specify what E2E tests in e2e/ must be created or updated.
10. There is POC (Proof of Concept) code in apps/, packages/sdk, and packages/workflow. Your spec must explicitly outline how to productionize this code (adding robust error handling, tests, removing stubs, strict typing, and adhering to architecture rules) rather than blindly trusting the poc code.

If an existing engineering spec is provided, update and improve it. Otherwise, build from scratch.

Existing Content:
${checkSpec.existingContent || "None"}`}
                      </Task>
                      {ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` }) ? (
                        <Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>
                          {async () => {
                            const p = path.join(specsDir(),"engineering", `${ticket.id}.md`);
                            await fs.writeFile(
                              p,
                              ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` })!.document,
                              "utf-8"
                            );
                            return { success: true };
                          }}
                        </Task>
                      ) : null}
                    </Sequence>
                  }
                  else={
                    <Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>
                      {{ success: true }}
                    </Task>
                  }
                />
              ) : null}
              {ctx.outputMaybe(outputs.writeTicketSpec, { nodeId: `write-spec-${ticket.id}` }) ? (
                <Task id={`done-spec-${ticket.id}`} output={outputs.done}>
                  {{ success: true }}
                </Task>
              ) : null}
            </Sequence>
          );
        }

        if (node.type === "research") {
          const checkResearch = ctx.outputMaybe(outputs.checkResearch, { nodeId: `check-research-${ticket.id}` });
          return (
            <Sequence key={node.id} skipIf={false}>
              <Task id={`check-research-${ticket.id}`} output={outputs.checkResearch} dependsOn={node.dependsOn}>
                {async () => {
                  const p = path.join(specsDir(),"research", `${ticket.id}.md`);
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
                      <Task
                        id={`generate-research-${ticket.id}`}
                        output={outputs.researchOut}
                        agent={implementAgent}
                        retries={2}
                        timeoutMs={1800000}
                      >
                        {`Research context for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => {
  try {
    return fsSync.readFileSync(path.join(specsDir(),"engineering", `${ticket.id}.md`), "utf-8");
  } catch {
    return "";
  }
})()}

Your job is to find any and all useful context in the codebase that can help implement this feature.
NOTE: There is a significant amount of Proof of Concept (POC) code already present in apps/server, apps/cli, packages/sdk, and packages/workflow.
You MUST explore this existing code to see if the feature (or parts of it) is already stubbed out, partially implemented, or has existing architectural patterns you should follow.
Use your tools to read files, search the codebase, and understand the current state of the architecture and POC implementations.
Document your findings comprehensively. Do NOT write the implementation plan yet. Just research.

Return a JSON object with a "document" string containing your markdown research.`}
                      </Task>
                      <Task
                        id={`review-research-${ticket.id}`}
                        output={outputs.review}
                        agent={reviewAgent}
                        retries={1}
                        timeoutMs={1800000}
                      >
                        {`Review the research for ticket: ${ticket.id}

The researcher produced this document:
${ctx.outputMaybe(outputs.researchOut, { nodeId: `generate-research-${ticket.id}` })?.document}

Your job:
1. Verify the research is comprehensive and covers all necessary context to implement the feature.
2. Ensure no edge cases or boundary conditions in the codebase were missed.
3. If it lacks depth, references to specific files/lines, or misses architectural context, do NOT LGTM.

Return a JSON object with:
- lgtm: boolean (true ONLY if perfect)
- feedback: string (detailed feedback, or "LGTM" if perfect)`}
                      </Task>
                      <Task id={`write-review-research-${ticket.id}`} output={outputs.writeReview}>
                        {async () => {
                          const r = ctx.outputMaybe(outputs.review, { nodeId: `review-research-${ticket.id}` });
                          if (r && !r.lgtm) {
                            const reviewDir = path.join(specsDir(),"reviews");
                            await fs.mkdir(reviewDir, { recursive: true });
                            await fs.writeFile(
                              path.join(reviewDir, `research-${ticket.id}-iteration-0.md`),
                              r.feedback,
                              "utf-8"
                            );
                          }
                          return { success: true };
                        }}
                      </Task>
                      <Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>
                        {async () => {
                          const dir = path.join(specsDir(),"research");
                          await fs.mkdir(dir, { recursive: true });
                          const out = ctx.outputMaybe(outputs.researchOut, { nodeId: `generate-research-${ticket.id}` });
                          if (out?.document) {
                            await fs.writeFile(
                              path.join(dir, `${ticket.id}.md`),
                              out.document,
                              "utf-8"
                            );
                          }
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={
                    <Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>
                      {{ success: true }}
                    </Task>
                  }
                />
              ) : null}
              {ctx.outputMaybe(outputs.writeResearch, { nodeId: `write-research-${ticket.id}` }) ? (
                <Task id={`done-research-${ticket.id}`} output={outputs.done}>
                  {{ success: true }}
                </Task>
              ) : null}
            </Sequence>
          );
        }

        if (node.type === "plan") {
          const checkPlan = ctx.outputMaybe(outputs.checkPlan, { nodeId: `check-plan-${ticket.id}` });
          return (
            <Sequence key={node.id} skipIf={false}>
              <Task id={`check-plan-${ticket.id}`} output={outputs.checkPlan} dependsOn={node.dependsOn}>
                {async () => {
                  const p = path.join(specsDir(),"plans", `${ticket.id}.md`);
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
                      <Task
                        id={`generate-plan-${ticket.id}`}
                        output={outputs.planOut}
                        agent={implementAgent}
                        retries={2}
                        timeoutMs={1800000}
                      >
                        {`Create an implementation plan for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => {
  try {
    return fsSync.readFileSync(path.join(specsDir(),"engineering", `${ticket.id}.md`), "utf-8");
  } catch {
    return "";
  }
})()}

Research Findings:
${(() => {
  try {
    return fsSync.readFileSync(path.join(specsDir(),"research", `${ticket.id}.md`), "utf-8");
  } catch {
    return "";
  }
})()}

Your job is to come up with a clear, step-by-step implementation plan based on the research.
Specify exactly which files will be modified, what new files will be created, and the logic to be added.
Be mindful of corner cases.
IMPORTANT: You must explicitly include steps to refactor and productionize any POC code you touch. Don't just paste POC code into production. Make sure it has proper error handling, types, and logging.
CRITICAL: Include explicit steps in your plan to update or create the relevant E2E tests in e2e/ and User Documentation in docs/ if this feature affects them. Ensure any documentation or test changes are tracked under proper jj bookmark scope.

Return a JSON object with a "document" string containing your markdown plan.`}
                      </Task>
                      <Task
                        id={`review-plan-${ticket.id}`}
                        output={outputs.review}
                        agent={reviewAgent}
                        retries={1}
                        timeoutMs={1800000}
                      >
                        {`Review the implementation plan for ticket: ${ticket.id}

The planner produced this document:
${ctx.outputMaybe(outputs.planOut, { nodeId: `generate-plan-${ticket.id}` })?.document}

Your job:
1. Verify the plan perfectly matches the Engineering Spec and Design constraints.
2. Verify all edge cases and boundary conditions found in Research are accounted for.
3. Verify there are no missing steps or logical gaps.
4. If there is ANY flaw, missing dependency, or lack of specificity, do NOT LGTM.

Return a JSON object with:
- lgtm: boolean (true ONLY if perfect)
- feedback: string (detailed feedback, or "LGTM" if perfect)`}
                      </Task>
                      <Task id={`write-review-plan-${ticket.id}`} output={outputs.writeReview}>
                        {async () => {
                          const r = ctx.outputMaybe(outputs.review, { nodeId: `review-plan-${ticket.id}` });
                          if (r && !r.lgtm) {
                            const reviewDir = path.join(specsDir(),"reviews");
                            await fs.mkdir(reviewDir, { recursive: true });
                            await fs.writeFile(
                              path.join(reviewDir, `plan-${ticket.id}-iteration-0.md`),
                              r.feedback,
                              "utf-8"
                            );
                          }
                          return { success: true };
                        }}
                      </Task>
                      <Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>
                        {async () => {
                          const dir = path.join(specsDir(),"plans");
                          await fs.mkdir(dir, { recursive: true });
                          const out = ctx.outputMaybe(outputs.planOut, { nodeId: `generate-plan-${ticket.id}` });
                          if (out?.document) {
                            await fs.writeFile(
                              path.join(dir, `${ticket.id}.md`),
                              out.document,
                              "utf-8"
                            );
                          }
                          return { success: true };
                        }}
                      </Task>
                    </Sequence>
                  }
                  else={
                    <Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>
                      {{ success: true }}
                    </Task>
                  }
                />
              ) : null}
              {ctx.outputMaybe(outputs.writePlan, { nodeId: `write-plan-${ticket.id}` }) ? (
                <Task id={`done-plan-${ticket.id}`} output={outputs.done}>
                  {{ success: true }}
                </Task>
              ) : null}
            </Sequence>
          );
        }

        if (node.type === "implement") {
          const checkImpl = ctx.outputMaybe(outputs.checkPlan, { nodeId: `check-impl-${ticket.id}` }); // reusing checkPlan shape for simplicity
          const parentBookmark = `impl/${ticket.id}`;
          const worktreePath = path.join(process.cwd(), ".worktrees", ticket.id);
          return (
            <Sequence key={node.id} skipIf={false}>
              <Task id={`check-impl-${ticket.id}`} output={outputs.checkPlan} dependsOn={node.dependsOn}>
                {async () => {
                  let needsImpl = false;
                  if (impact.invalidateImplForTickets.includes(ticket.id)) needsImpl = true;
                  return { needsPlan: needsImpl, existingContent: "" };
                }}
              </Task>
              <Worktree id={`worktree-${ticket.id}`} path={worktreePath} branch={parentBookmark} baseBranch="main">
                <Sequence>
                  <Branch
                    if={checkImpl?.needsPlan ?? true}
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
                          {`Implement the feature for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => {
  try {
    return fsSync.readFileSync(path.join(specsDir(),"engineering", `${ticket.id}.md`), "utf-8");
  } catch {
    return "";
  }
})()}

Plan:
${(() => {
  try {
    return fsSync.readFileSync(path.join(specsDir(),"plans", `${ticket.id}.md`), "utf-8");
  } catch {
    return "";
  }
})()}

${
  ctx.iteration > 0
    ? `REVIEW FEEDBACK FROM PREVIOUS ATTEMPT:\n${
        ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` })?.feedback
      }`
    : ""
}

Use your tools to write the code, modify files, and ensure tests pass. Follow the plan exactly.
Ensure you also write or update the necessary E2E tests in e2e/ and User Documentation in docs/ as outlined in the plan.
If you update any E2E tests or User Documentation, make sure you use jj bookmark create to create scoped, atomic emoji conventional commits for those specific changes.

Return a JSON object with:
- summary: string explaining what you did
- filesChanged: string array of file paths you modified/created`}
                        </Task>

                        <Task
                          id={`review-impl-${ticket.id}`}
                          output={outputs.review}
                          agent={reviewAgent}
                          retries={1}
                          timeoutMs={1800000}
                        >
                          {`Review the implementation for ticket: ${ticket.id}

The implementer claims to have done:
${ctx.outputMaybe(outputs.implement, { nodeId: `implement-${ticket.id}` })?.summary}

Files changed:
${ctx.outputMaybe(outputs.implement, { nodeId: `implement-${ticket.id}` })?.filesChanged.join("\n")}

Your job:
1. Run tests using your bash tool.
2. Read the modified code.
3. Be EXTREMELY strict. If you can think of ANY way to improve, including nits, do NOT LGTM.
4. Verify it perfectly matches the Product Spec, Engineering Spec, and Plan.

Return a JSON object with:
- lgtm: boolean (true ONLY if perfect)
- feedback: string (detailed feedback, or "LGTM" if perfect)`}
                        </Task>

                        <Task id={`write-review-impl-${ticket.id}`} output={outputs.writeReview}>
                          {async () => {
                            const r = ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` });
                            if (r && !r.lgtm) {
                              const reviewDir = path.join(specsDir(),"reviews");
                              await fs.mkdir(reviewDir, { recursive: true });
                              await fs.writeFile(
                                path.join(reviewDir, `${ticket.id}-iteration-${ctx.iteration}.md`),
                                r.feedback,
                                "utf-8"
                              );
                            }
                            return { success: true };
                          }}
                        </Task>
                      </Sequence>
                    }
                    else={null}
                  />
                  <Task id={`done-impl-${ticket.id}`} output={outputs.done}>
                    {{ success: true }}
                  </Task>
                </Sequence>
              </Worktree>
            </Sequence>
          );
        }

        if (node.type === "bookmark") {
          const wtPath = path.join(process.cwd(), ".worktrees", ticket.id);
          return (
            <Sequence key={node.id}>
              <Task id={`bookmark-${ticket.id}`} output={outputs.bookmark} dependsOn={node.dependsOn}>
                {async () => {
                  const bookmarkName = `impl/${ticket.id}`;

                  // Describe the current change in the worktree
                  execJJ(["describe", "-m", `🔧 impl(${ticket.id}): ${ticket.title}`], wtPath);

                  // Get the change ID of the working copy
                  const changeId = execJJ(["log", "-r", "@", "--no-graph", "-T", "change_id"], wtPath);

                  // Create bookmark pointing at the working copy (idempotent: set if exists)
                  try {
                    execJJ(["bookmark", "create", bookmarkName, "-r", "@"], wtPath);
                  } catch {
                    execJJ(["bookmark", "set", bookmarkName, "-r", "@"], wtPath);
                  }

                  return { ticketId: ticket.id, changeId, bookmarkName };
                }}
              </Task>
            </Sequence>
          );
        }

        return null;
      })}
    </Parallel>
  );
}
