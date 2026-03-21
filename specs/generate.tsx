/** @jsxImportSource smithers-orchestrator */
import { createSmithers, Parallel, Sequence, Task, Branch, Loop } from "smithers-orchestrator";
import { ClaudeCodeAgent } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as fsSync from "node:fs";
import { Features } from "./features";

const { Workflow, smithers, outputs } = createSmithers({
  // Impact Analysis (Only runs if diffs are provided)
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

  // Phase 1: Product Specs
  check: z.object({
    feature: z.string(),
    needsSpec: z.boolean(),
    existingContent: z.string(),
  }),
  spec: z.object({
    userPov: z.string().describe("High-level user POV description. Markdown paragraphs, no technical details."),
    acceptanceCriteria: z.string().describe("Bulleted checklist of business rules, constraints, and edge cases. Markdown format."),
    design: z.string().describe("Comprehensive design details (UI, API, SDK, CLI, TUI, Docs) from an end-user perspective. Markdown format."),
    permissions: z.string().describe("Permissions, authorization roles, security constraints, and rate limits. Markdown format."),
    telemetry: z.string().describe("Product analytics, business events, funnel metrics, and success indicators. Markdown format."),
    observability: z.string().describe("Comprehensive observability plan including logging, Prometheus metrics, alerts, runbooks, and error cases. Markdown format."),
    verification: z.string().describe("Comprehensive list of tests for this feature. Markdown format, organized by test type."),
  }),
  write: z.object({
    success: z.boolean(),
  }),

  // Phase 2: High Level Architecture
  checkArch: z.object({
    needsArch: z.boolean(),
    existingContent: z.string(),
  }),
  arch: z.object({
    document: z.string().describe("High-level engineering architecture document. Markdown format."),
  }),
  writeArch: z.object({
    success: z.boolean(),
  }),

  // Phase 3.1: Feature Groups
  checkGroups: z.object({ needsGroups: z.boolean(), existingContent: z.string() }),
  featureGroupsOut: z.object({
    groups: z.array(z.object({
      id: z.string().describe("Lowercase kebab-case group ID (e.g. 'auth-core', 'ws-networking')"),
      description: z.string().describe("What this group encompasses"),
      features: z.array(z.string()).describe("List of EXACT FeatureNames from the Features enum belonging to this group"),
    })).describe("Logical grouping of all features to minimize cross-group dependencies"),
  }),
  writeGroups: z.object({ success: z.boolean() }),

  // Phase 3.2: Engineering Tickets per Group
  checkGroupTickets: z.object({ groupId: z.string(), needsTickets: z.boolean(), existingContent: z.string() }),
  groupTicketsOut: z.object({
    tickets: z.array(z.object({
      id: z.string().describe("Unique lowercase kebab-case slug (e.g., 'db-schema-users', 'feat-auth-login')"),
      title: z.string().describe("Short imperative title"),
      type: z.enum(["feature", "engineering"]).describe("'feature' if it completes a user-facing FeatureName, 'engineering' if it is a prerequisite abstraction/infra/library"),
      featureName: z.string().nullable().describe("If type is 'feature', the exact FeatureName from the Features object it fulfills. Null if 'engineering'"),
      description: z.string().describe("Detailed description of what this ticket implements"),
      dependencies: z.array(z.string()).describe("IDs of other tickets this depends on (can be from other groups)"),
    })).describe("A DAG of tickets for this specific feature group."),
  }),
  writeGroupTickets: z.object({ success: z.boolean() }),
  allTicketsDone: z.object({ success: z.boolean() }),

  // Phase 4: Dynamic Ticket Nodes (Spec, Research, Plan, Implement)
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
});

export default smithers((ctx) => {
  const featureNames = Object.keys(Features);

  let prdContent = "";
  let designContent = "";
  try {
    prdContent = fsSync.readFileSync(path.join(process.cwd(), "specs", "prd.md"), "utf-8");
    designContent = fsSync.readFileSync(path.join(process.cwd(), "specs", "design.md"), "utf-8");
  } catch {}

  const hasDiffs = ctx.input && (ctx.input as any).diffs && Object.keys((ctx.input as any).diffs).length > 0;
  const diffText = hasDiffs 
    ? `\n\n--- RECENT CHANGES IN THIS RUN ---\nThe following files were just changed by the user. Use this diff to understand what you need to update:\n${Object.entries((ctx.input as any).diffs).map(([f, d]) => `File: ${f}\nDiff:\n${d}`).join("\n\n")}`
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

  const implementAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt: baseSystemPrompt + "\n\nYou are an elite software engineer. You implement features meticulously, running tests to verify your work. You have full access to the codebase via your tools. Use them to read, write, edit, and run tests. Your goal is to produce flawless, working code that exactly matches the specifications.",
    dangerouslySkipPermissions: true,
  });

  const reviewAgent = new ClaudeCodeAgent({
    model: "claude-opus-4-6",
    systemPrompt: baseSystemPrompt + "\n\nYou are the strictest code reviewer in the world. You run tests, read code, and look for edge cases. If there is ANY way to improve the code, even nits, you reject it. You demand perfection.",
    dangerouslySkipPermissions: true,
  });

  const checkArch = ctx.outputMaybe(outputs.checkArch, { nodeId: "check-arch" });
  const archOut = ctx.outputMaybe(outputs.arch, { nodeId: "generate-arch" });
  const writeArch = ctx.outputMaybe(outputs.writeArch, { nodeId: "write-arch" });

  const impact = ctx.outputMaybe(outputs.impactAnalysis, { nodeId: "impact-analysis" });

  const archContent = archOut?.document || checkArch?.existingContent || "";

  const checkGroups = ctx.outputMaybe(outputs.checkGroups, { nodeId: "check-groups" });
  const writeGroups = ctx.outputMaybe(outputs.writeGroups, { nodeId: "write-groups" });

  let featureGroups: any[] = [];
  if (writeGroups?.success) {
    try {
      const raw = fsSync.readFileSync(path.join(process.cwd(), "specs", "feature-groups.json"), "utf-8");
      featureGroups = JSON.parse(raw);
      if (featureGroups.groups) featureGroups = featureGroups.groups; // handle object wrapper if any
    } catch {}
  }

  const allTicketsDone = ctx.outputMaybe(outputs.allTicketsDone, { nodeId: "all-tickets-done" });
  let masterTickets: any[] = [];
  if (allTicketsDone?.success && featureGroups.length > 0) {
    for (const g of featureGroups) {
      try {
        const raw = fsSync.readFileSync(path.join(process.cwd(), "specs", `tickets-${g.id}.json`), "utf-8");
        masterTickets.push(...JSON.parse(raw));
      } catch {}
    }
  }

  // Instead of nesting everything, we flatten out the ticket items into explicit sequential tasks that depend on each other.
  // A ticket goes through 4 nodes: spec -> research -> plan -> implement
  // It only begins its 'spec' node once its master dependencies' 'implement' nodes finish.
  const flatNodes: any[] = [];
  if (masterTickets && Array.isArray(masterTickets)) {
    for (const t of masterTickets) {
      // 1. Engineering Spec (depends on upstream tickets finishing entirely)
      flatNodes.push({
        id: `spec-${t.id}`,
        type: "spec",
        ticket: t,
        dependsOn: (t.dependencies || []).map((d: string) => `done-impl-${d}`),
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
    }
  }

  return (
    <Workflow name="generate-specs">
      <Sequence>
        
        {/* ================================================================= */}
        {/* IMPACT ANALYSIS (Only if there are diffs)                         */}
        {/* ================================================================= */}
        {hasDiffs ? (
          <Task id="impact-analysis" output={outputs.impactAnalysis} agent={specAgent} timeoutMs={60000}>
            {`The user has made changes to the documentation. We need to determine which features and tickets need to be invalidated and rebuilt.
Here are the diffs:
${diffText}

Available Product Features:
${featureNames.join(", ")}

Master Engineering Tickets:
${masterTickets.map(t => t.id).join(", ")}

Your job is to analyze the impact of the diffs and output a JSON array specifying what needs to be invalidated.
If a core document like PRD or Design changed drastically, you might need to invalidate everything.
If only a specific API or route changed, only invalidate the features and tickets that rely on it.
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
              explanation: "No diffs provided, running standard idempotent sync."
            }}
          </Task>
        )}

        {/* ================================================================= */}
        {/* PHASE 1: PRODUCT SPECS                                            */}
        {/* ================================================================= */}
        {impact ? (
          <Parallel maxConcurrency={8}>
            {featureNames.map((feature) => {
              const check = ctx.outputMaybe(outputs.check, { nodeId: `check-${feature}` });
              const spec = ctx.outputMaybe(outputs.spec, { nodeId: `spec-${feature}` });

              return (
                <Sequence key={`prod-${feature}`}>
                  <Task id={`check-${feature}`} output={outputs.check}>
                    {async () => {
                      const p = path.join(process.cwd(), "specs", `${feature}.md`);
                      let content = "";
                      try {
                        content = await fs.readFile(p, "utf-8");
                      } catch {
                        content = `# ${feature}\n\nSpecification for ${feature}.\n`;
                      }
                      
                      let needsSpec = !content.includes("## High-Level User POV") || 
                                        !content.includes("## Acceptance Criteria") || 
                                        !content.includes("## Design") || 
                                        !content.includes("## Permissions & Security") || 
                                        !content.includes("## Telemetry & Product Analytics") || 
                                        !content.includes("## Observability") || 
                                        !content.includes("## Verification");

                      if (impact.invalidateAllProdSpecs || impact.invalidateProdSpecsForFeatures.includes(feature)) {
                        needsSpec = true;
                      }

                      return { feature, needsSpec, existingContent: content };
                    }}
                  </Task>

                {check ? (
                  <Branch
                    if={check.needsSpec}
                    then={
                      <Sequence>
                        <Task
                          id={`spec-${feature}`}
                          output={outputs.spec}
                          agent={specAgent}
                          retries={2}
                          timeoutMs={60000}
                        >
                          {`Write a specification for the feature: ${feature}.

1. **User POV**:
   - Write a high-level user POV description.
   - Do not include technical details, database schemas, or API routes.
   - Focus purely on what the user experiences, the value it provides, and the general workflow.
   - Format as markdown paragraphs.

2. **Acceptance Criteria**:
   - Provide a bulleted checklist of strict product constraints.
   - Define the "Definition of Done".
   - Thoroughly cover edge cases (e.g., duplicate names, empty payloads).
   - Detail boundary constraints (e.g., maximum string length, special characters allowed).

3. **Design**:
   - Comprehensively specify the design details from an end-user perspective.
   - Include specific subsections ONLY if they are relevant to this feature.
   - Examples of subsections: "Web UI Design", "API Shape", "SDK Shape", "CLI Command", "TUI UI", "Neovim Plugin API", "Documentation".
   - If the feature is a UI feature, specify the UI design details comprehensively.
   - Specify exactly what documentation should be written for the end user.
   - Focus strictly on documenting what should be happening from the end-user's point of view, avoiding implementation details like SQL.

4. **Permissions & Security**:
   - Detail which authorization roles (e.g., Owner, Admin, Member, Read-Only, Anonymous) are required to trigger this feature.
   - Outline what rate limiting should be in place to prevent abuse.
   - Document any data privacy constraints or PII exposure risks.

5. **Telemetry & Product Analytics**:
   - Identify the key business events that should be fired (e.g., \`IssueCreated\`).
   - List the properties that must be attached to these events.
   - Define funnel metrics or success indicators that tell the product team this feature is working well.

6. **Observability**:
   - Create a comprehensive observability and monitoring plan for this feature.
   - Specify strong logging requirements (what needs to be logged, log levels, structured context).
   - Specify Prometheus metrics (counters, gauges, histograms).
   - Define alerts that should be triggered when things go wrong.
   - For *every* alert defined, provide a concise runbook outlining how an on-call engineer should investigate and resolve the issue.
   - Document all error cases and predictable failure modes.

7. **Verification**:
   - Create a complete and granular list of all tests we should use to validate this feature works as expected.
   - Think deeply about valid inputs, such as input sizes.
   - Include a test that verifies the maximum valid size of an input works.
   - Include a test that verifies an input larger than the maximum size predictably errors.
   - Include all relevant end-to-end (e2e) tests to validate the feature. This includes Playwright (UI), CLI tests, API tests.
   - Do NOT be opinionated about unit tests here. Focus exclusively on integration/E2E testing.
   - The testing should be so comprehensive that our confidence the feature works if the tests pass is near 100%.`}
                        </Task>
                        
                        {spec ? (
                          <Task id={`write-${feature}`} output={outputs.write}>
                            {async () => {
                              const p = path.join(process.cwd(), "specs", `${feature}.md`);
                              const newContent = check.existingContent.trim() + 
                                `\n\n## High-Level User POV\n\n${spec.userPov}\n\n## Acceptance Criteria\n\n${spec.acceptanceCriteria}\n\n## Design\n\n${spec.design}\n\n## Permissions & Security\n\n${spec.permissions}\n\n## Telemetry & Product Analytics\n\n${spec.telemetry}\n\n## Observability\n\n${spec.observability}\n\n## Verification\n\n${spec.verification}\n`;
                              await fs.writeFile(p, newContent, "utf-8");
                              return { success: true };
                            }}
                          </Task>
                        ) : null}
                      </Sequence>
                    }
                    else={
                      <Task id={`write-${feature}`} output={outputs.write}>
                        {{ success: true }}
                      </Task>
                    }
                  />
                ) : null}
              </Sequence>
            );
          })}
        </Parallel>
        ) : null}

        {/* ================================================================= */}
        {/* PHASE 2: HIGH-LEVEL ARCHITECTURE                                  */}
        {/* ================================================================= */}
        {impact ? (
          <Task id="check-arch" output={outputs.checkArch}>
            {async () => {
              const p = path.join(process.cwd(), "specs", "engineering-architecture.md");
              let content = "";
              try {
                content = await fs.readFile(p, "utf-8");
              } catch {
                content = "";
              }
              let needsArch = !content.includes("## Testing Philosophy") || !content.includes("## 3rd Party Dependencies");
              if (impact.invalidateArch) needsArch = true;
              return { needsArch, existingContent: content };
            }}
          </Task>
        ) : null}

        {checkArch ? (
          <Branch
            if={checkArch.needsArch}
            then={
              <Sequence>
                <Task
                  id="generate-arch"
                  output={outputs.arch}
                  agent={specAgent}
                  retries={2}
                  timeoutMs={120000}
                >
                  {`Write the High-Level Engineering Architecture document for this project.

System features overview (to understand the scope):
${featureNames.slice(0, 50).join(", ")} ...and ${featureNames.length - 50} more.

Requirements:
1. Define the high-level architecture before diving into feature-specific engineering docs.
2. Identify potential engineering-specific work (creating libraries or abstractions) used to implement groups of features, broken off into its own engineering tasks.
3. Define the testing philosophy:
   - Super strong unit and integration tests providing 100% certainty.
   - Prefer NOT mocking whenever possible. If we do mock, it MUST only mock a stable boundary, NEVER an implementation detail.
   - Think through corner cases.
4. Define the 3rd-party dependency philosophy:
   - For problems solved by 3rd-party dependencies, specify requirements independent of the dependency.
   - We should NEVER use a 3rd-party dependency (except frameworks like React, OpenTUI) unless we write a PoC test only importing the dependency and showing how we plan on using it.
   - This PoC test must be its own engineering ticket that the feature depends on.
5. MUST include the following exact sections: "## High-Level Architecture", "## Core Abstractions", "## Testing Philosophy", "## 3rd Party Dependencies".

If existing content is provided, review, update, and improve it. Otherwise build from scratch.

Existing Content:
${checkArch.existingContent || "None"}`}
                </Task>

                {archOut ? (
                  <Task id="write-arch" output={outputs.writeArch}>
                    {async () => {
                      const p = path.join(process.cwd(), "specs", "engineering-architecture.md");
                      await fs.writeFile(p, archOut.document, "utf-8");
                      return { success: true };
                    }}
                  </Task>
                ) : null}
              </Sequence>
            }
            else={
              <Task id="write-arch" output={outputs.writeArch}>
                {{ success: true }}
              </Task>
            }
          />
        ) : null}

        {/* ================================================================= */}
        {/* PHASE 3.1: FEATURE GROUPS                                         */}
        {/* ================================================================= */}
        {writeArch && impact ? (
          <Sequence>
            <Task id="check-groups" output={outputs.checkGroups}>
              {async () => {
                const p = path.join(process.cwd(), "specs", "feature-groups.json");
                let content = "";
                try {
                  content = await fs.readFile(p, "utf-8");
                  const json = JSON.parse(content);
                  if (Array.isArray(json.groups) && json.groups.length > 0) {
                    let needsGroups = false;
                    if (impact.invalidateGroups) needsGroups = true;
                    return { needsGroups, existingContent: content };
                  }
                } catch {}
                return { needsGroups: true, existingContent: content };
              }}
            </Task>

            {checkGroups ? (
              <Branch
                if={checkGroups.needsGroups}
                then={
                  <Sequence>
                    <Task
                      id="generate-groups"
                      output={outputs.featureGroupsOut}
                      agent={specAgent}
                      retries={2}
                      timeoutMs={120000}
                    >
                      {`You are the lead architect. We have ${featureNames.length} end-user features that must be implemented.
To avoid token limits, we need to break these features down into logical groups (epics).

Here is the High-Level Architecture:
${archContent}

Your job is to generate a comprehensive JSON array of GROUPS.

RULES:
1. Distribute the ${featureNames.length} features into 10-20 logical groups.
2. The goal is to MINIMIZE cross-group dependencies. Features that heavily interact should be in the same group.
3. Every single feature in the feature list MUST be assigned to exactly one group.
4. Output must be a valid JSON array matching the schema.

Feature list:
${featureNames.join(", ")}`}
                    </Task>

                    {ctx.outputMaybe(outputs.featureGroupsOut, { nodeId: "generate-groups" }) ? (
                      <Task id="write-groups" output={outputs.writeGroups}>
                        {async () => {
                          const p = path.join(process.cwd(), "specs", "feature-groups.json");
                          const g = ctx.outputMaybe(outputs.featureGroupsOut, { nodeId: "generate-groups" });
                          await fs.writeFile(p, JSON.stringify(g, null, 2), "utf-8");
                          return { success: true };
                        }}
                      </Task>
                    ) : null}
                  </Sequence>
                }
                else={
                  <Task id="write-groups" output={outputs.writeGroups}>
                    {{ success: true }}
                  </Task>
                }
              />
            ) : null}
          </Sequence>
        ) : null}

        {/* ================================================================= */}
        {/* PHASE 3.2: TICKETS PER GROUP                                      */}
        {/* ================================================================= */}
        {writeGroups && featureGroups.length > 0 ? (
          <Sequence>
            <Parallel maxConcurrency={8}>
              {featureGroups.map((group) => {
                const checkGroupTix = ctx.outputMaybe(outputs.checkGroupTickets, { nodeId: `check-tickets-${group.id}` });

                return (
                  <Sequence key={`group-tickets-${group.id}`}>
                    <Task id={`check-tickets-${group.id}`} output={outputs.checkGroupTickets}>
                      {async () => {
                        const p = path.join(process.cwd(), "specs", `tickets-${group.id}.json`);
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
                              timeoutMs={180000}
                            >
                              {`You are the lead architect defining the execution DAG for a specific feature group.
Group ID: ${group.id}
Group Description: ${group.description}
Features in this group:
${group.features.join(", ")}

Here is the High-Level Architecture:
${archContent}

Your job is to generate a comprehensive JSON array of TICKETS for ONLY this group.

RULES FOR TICKETS:
1. Every single feature in this group MUST be fulfilled by exactly one "feature" ticket.
   (The ticket closes the feature. Its featureName field must exactly match the feature).
2. "engineering" tickets MUST be created for prerequisites, shared libraries, DB schema migrations, or shared UI components needed by this group.
3. Dependencies must form a strict DAG. An engineering ticket should come before the feature tickets that use it.
4. "feature" tickets should depend on any necessary "engineering" tickets.
5. "engineering" tickets have \`type: "engineering"\` and \`featureName: null\`.
6. "feature" tickets have \`type: "feature"\` and \`featureName: "THE_EXACT_FEATURE_NAME"\`.
7. You may declare dependencies on tickets from other groups if you know they exist or are obvious core requirements (e.g. 'db-schema-users').`}
                            </Task>

                            {ctx.outputMaybe(outputs.groupTicketsOut, { nodeId: `generate-tickets-${group.id}` }) ? (
                              <Task id={`write-tickets-${group.id}`} output={outputs.writeGroupTickets}>
                                {async () => {
                                  const p = path.join(process.cwd(), "specs", `tickets-${group.id}.json`);
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

            {/* Sync barrier: Wait for all group tickets to be written */}
            <Task 
              id="all-tickets-done" 
              output={outputs.allTicketsDone} 
              dependsOn={featureGroups.map(g => `write-tickets-${g.id}`)}
            >
              {{ success: true }}
            </Task>
          </Sequence>
        ) : null}

        {/* ================================================================= */}
        {/* PHASE 4: TICKET PIPELINE (Spec, Research, Plan, Implement)        */}
        {/* ================================================================= */}
        {allTicketsDone && flatNodes.length > 0 && impact ? (
          <Parallel maxConcurrency={8}>
            {flatNodes.map((node) => {
              const ticket = node.ticket;
              
              if (node.type === "spec") {
                const checkSpec = ctx.outputMaybe(outputs.checkTicketSpec, { nodeId: `check-spec-${ticket.id}` });
                return (
                  <Sequence key={node.id} skipIf={false}>
                    <Task id={`check-spec-${ticket.id}`} output={outputs.checkTicketSpec} dependsOn={node.dependsOn}>
                      {async () => {
                        const engDir = path.join(process.cwd(), "specs", "engineering");
                        await fs.mkdir(engDir, { recursive: true });
                        const p = path.join(engDir, `${ticket.id}.md`);
                        let content = "";
                        try { content = await fs.readFile(p, "utf-8"); } catch {}
                        let prodContent = null;
                        if (ticket.type === "feature" && ticket.featureName) {
                          try { prodContent = await fs.readFile(path.join(process.cwd(), "specs", `${ticket.featureName}.md`), "utf-8"); } catch {}
                        }
                        let needsSpec = !content.includes("## Implementation Plan") || !content.includes("## Unit & Integration Tests");
                        if (impact.invalidateTicketSpecsForTickets.includes(ticket.id)) needsSpec = true;
                        return { ticketId: ticket.id, needsSpec, existingContent: content, productSpec: prodContent };
                      }}
                    </Task>
                    {checkSpec ? (
                      <Branch
                        if={checkSpec.needsSpec}
                        then={
                          <Sequence>
                            <Task id={`generate-spec-${ticket.id}`} output={outputs.ticketSpec} agent={specAgent} retries={2} timeoutMs={60000}>
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
8. If this ticket affects user-facing behavior, specify how the `docs/` folder documentation must be updated.
9. If this ticket affects CLI or API behavior, specify what E2E tests in `e2e/` must be created or updated.
10. There is POC (Proof of Concept) code in `apps/`, `packages/sdk`, and `packages/workflow`. Your spec must explicitly outline how to productionize this code (adding robust error handling, tests, removing stubs, strict typing, and adhering to architecture rules) rather than blindly trusting the poc code.

If an existing engineering spec is provided, update and improve it. Otherwise, build from scratch.

Existing Content:
${checkSpec.existingContent || "None"}`}
                            </Task>
                            {ctx.outputMaybe(outputs.ticketSpec, { nodeId: `generate-spec-${ticket.id}` }) ? (
                              <Task id={`write-spec-${ticket.id}`} output={outputs.writeTicketSpec}>
                                {async () => {
                                  const p = path.join(process.cwd(), "specs", "engineering", `${ticket.id}.md`);
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
                  <Sequence key={node.id} skipIf={false}>
                    <Task id={`check-research-${ticket.id}`} output={outputs.checkResearch} dependsOn={node.dependsOn}>
                      {async () => {
                        const p = path.join(process.cwd(), "specs", "research", `${ticket.id}.md`);
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
                            <Loop id={`research-loop-${ticket.id}`} until={ctx.outputMaybe(outputs.review, { nodeId: `review-research-${ticket.id}` })?.lgtm === true} maxIterations={3} onMaxReached="return-last">
                              <Sequence>
                                <Task id={`generate-research-${ticket.id}`} output={outputs.researchOut} agent={implementAgent} retries={2} timeoutMs={120000}>
                                  {`Research context for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(process.cwd(), "specs", "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

${ctx.iteration > 0 ? `REVIEW FEEDBACK FROM PREVIOUS ATTEMPT:\n${ctx.outputMaybe(outputs.review, { nodeId: `review-research-${ticket.id}` })?.feedback}` : ""}

Your job is to find any and all useful context in the codebase that can help implement this feature.
NOTE: There is a significant amount of Proof of Concept (POC) code already present in `apps/server`, `apps/cli`, `packages/sdk`, and `packages/workflow`. 
You MUST explore this existing code to see if the feature (or parts of it) is already stubbed out, partially implemented, or has existing architectural patterns you should follow.
Use your tools to read files, search the codebase, and understand the current state of the architecture and POC implementations.
Document your findings comprehensively. Do NOT write the implementation plan yet. Just research.

Return a JSON object with a "document" string containing your markdown research.`}
                                </Task>
                                <Task id={`review-research-${ticket.id}`} output={outputs.review} agent={reviewAgent} retries={1} timeoutMs={120000}>
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
                                      const reviewDir = path.join(process.cwd(), "specs", "reviews");
                                      await fs.mkdir(reviewDir, { recursive: true });
                                      await fs.writeFile(path.join(reviewDir, `research-${ticket.id}-iteration-${ctx.iteration}.md`), r.feedback, "utf-8");
                                    }
                                    return { success: true };
                                  }}
                                </Task>
                              </Sequence>
                            </Loop>
                            {ctx.latest("researchOut", `generate-research-${ticket.id}`) ? (
                              <Task id={`write-research-${ticket.id}`} output={outputs.writeResearch}>
                                {async () => {
                                  const dir = path.join(process.cwd(), "specs", "research");
                                  await fs.mkdir(dir, { recursive: true });
                                  await fs.writeFile(path.join(dir, `${ticket.id}.md`), ctx.latest("researchOut", `generate-research-${ticket.id}`).document, "utf-8");
                                  return { success: true };
                                }}
                              </Task>
                            ) : null}
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
                  <Sequence key={node.id} skipIf={false}>
                    <Task id={`check-plan-${ticket.id}`} output={outputs.checkPlan} dependsOn={node.dependsOn}>
                      {async () => {
                        const p = path.join(process.cwd(), "specs", "plans", `${ticket.id}.md`);
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
                            <Loop id={`plan-loop-${ticket.id}`} until={ctx.outputMaybe(outputs.review, { nodeId: `review-plan-${ticket.id}` })?.lgtm === true} maxIterations={3} onMaxReached="return-last">
                              <Sequence>
                                <Task id={`generate-plan-${ticket.id}`} output={outputs.planOut} agent={implementAgent} retries={2} timeoutMs={120000}>
                                  {`Create an implementation plan for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(process.cwd(), "specs", "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Research Findings:
${(() => { try { return fsSync.readFileSync(path.join(process.cwd(), "specs", "research", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

${ctx.iteration > 0 ? `REVIEW FEEDBACK FROM PREVIOUS ATTEMPT:\n${ctx.outputMaybe(outputs.review, { nodeId: `review-plan-${ticket.id}` })?.feedback}` : ""}

Your job is to come up with a clear, step-by-step implementation plan based on the research.
Specify exactly which files will be modified, what new files will be created, and the logic to be added.
Be mindful of corner cases.
IMPORTANT: You must explicitly include steps to refactor and productionize any POC code you touch. Don't just paste POC code into production. Make sure it has proper error handling, types, and logging.
CRITICAL: Include explicit steps in your plan to update or create the relevant E2E tests in `e2e/` and User Documentation in `docs/` if this feature affects them. Ensure any documentation or test changes are tracked under proper `jj bookmark` scope.

Return a JSON object with a "document" string containing your markdown plan.`}
                                </Task>
                                <Task id={`review-plan-${ticket.id}`} output={outputs.review} agent={reviewAgent} retries={1} timeoutMs={120000}>
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
                                      const reviewDir = path.join(process.cwd(), "specs", "reviews");
                                      await fs.mkdir(reviewDir, { recursive: true });
                                      await fs.writeFile(path.join(reviewDir, `plan-${ticket.id}-iteration-${ctx.iteration}.md`), r.feedback, "utf-8");
                                    }
                                    return { success: true };
                                  }}
                                </Task>
                              </Sequence>
                            </Loop>
                            {ctx.latest("planOut", `generate-plan-${ticket.id}`) ? (
                              <Task id={`write-plan-${ticket.id}`} output={outputs.writePlan}>
                                {async () => {
                                  const dir = path.join(process.cwd(), "specs", "plans");
                                  await fs.mkdir(dir, { recursive: true });
                                  await fs.writeFile(path.join(dir, `${ticket.id}.md`), ctx.latest("planOut", `generate-plan-${ticket.id}`).document, "utf-8");
                                  return { success: true };
                                }}
                              </Task>
                            ) : null}
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
                const checkImpl = ctx.outputMaybe(outputs.checkPlan, { nodeId: `check-impl-${ticket.id}` }); // reusing checkPlan shape for simplicity
                return (
                  <Sequence key={node.id} skipIf={false}>
                    <Task id={`check-impl-${ticket.id}`} output={outputs.checkPlan} dependsOn={node.dependsOn}>
                      {async () => {
                        let needsImpl = false;
                        if (impact.invalidateImplForTickets.includes(ticket.id)) needsImpl = true;
                        // Also logic for checking if impl is done would go here, 
                        // but since the original didn't have an idempotency check for impl (it just ran if writePlan ran),
                        // we use the impact invalidation to force it if needed.
                        return { needsPlan: needsImpl, existingContent: "" };
                      }}
                    </Task>
                    <Branch
                      if={checkImpl?.needsPlan ?? true}
                      then={
                        <Loop
                          id={`impl-loop-${ticket.id}`}
                          until={ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` })?.lgtm === true}
                          maxIterations={5}
                          onMaxReached="return-last"
                        >
                      <Sequence>
                        <Task 
                          id={`implement-${ticket.id}`} 
                          output={outputs.implement} 
                          agent={implementAgent} 
                          retries={1} 
                          timeoutMs={600000}
                          dependsOn={node.dependsOn} // The actual code writing waits for the plan to finish
                        >
                          {`Implement the feature for ticket: ${ticket.id}
Title: ${ticket.title}

Engineering Spec:
${(() => { try { return fsSync.readFileSync(path.join(process.cwd(), "specs", "engineering", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

Plan:
${(() => { try { return fsSync.readFileSync(path.join(process.cwd(), "specs", "plans", `${ticket.id}.md`), "utf-8"); } catch { return ""; } })()}

${ctx.iteration > 0 ? `REVIEW FEEDBACK FROM PREVIOUS ATTEMPT:\n${ctx.outputMaybe(outputs.review, { nodeId: `review-impl-${ticket.id}` })?.feedback}` : ""}

Use your tools to write the code, modify files, and ensure tests pass. Follow the plan exactly.
Ensure you also write or update the necessary E2E tests in `e2e/` and User Documentation in `docs/` as outlined in the plan.
If you update any E2E tests or User Documentation, make sure you use `jj bookmark create` to create scoped, atomic emoji conventional commits for those specific changes.

Return a JSON object with:
- summary: string explaining what you did
- filesChanged: string array of file paths you modified/created`}
                        </Task>

                        <Task 
                          id={`review-impl-${ticket.id}`} 
                          output={outputs.review} 
                          agent={reviewAgent} 
                          retries={1} 
                          timeoutMs={300000}
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
                              const reviewDir = path.join(process.cwd(), "specs", "reviews");
                              await fs.mkdir(reviewDir, { recursive: true });
                              await fs.writeFile(path.join(reviewDir, `${ticket.id}-iteration-${ctx.iteration}.md`), r.feedback, "utf-8");
                            }
                            return { success: true };
                          }}
                        </Task>
                      </Sequence>
                    </Loop>
                  }
                  else={
                    <Task id={`skip-impl-${ticket.id}`} output={outputs.done}>
                      {{ success: true }}
                    </Task>
                  }
                />

                {ctx.latest("implement", `implement-${ticket.id}`) || ctx.outputMaybe(outputs.done, { nodeId: `skip-impl-${ticket.id}` }) ? (
                  <Task id={`done-impl-${ticket.id}`} output={outputs.done}>
                    {{ success: true }}
                  </Task>
                ) : null}
              </Sequence>
            );
          }

              return null;
            })}
          </Parallel>
        ) : null}

      </Sequence>
    </Workflow>
  );
});
