/** @jsxImportSource smithers-orchestrator */
import { Task, Parallel, Sequence, Branch } from "smithers-orchestrator";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { specsDir } from "./utils";

export const productSpecsSchemas = {
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
};

export function ProductSpecsPhase({
  ctx,
  impact,
  featureNames,
  specAgent,
  outputs,
}: {
  ctx: any;
  impact: any;
  featureNames: string[];
  specAgent: any;
  outputs: any;
}) {
  if (!impact) return null;

  return (
    <Parallel maxConcurrency={8}>
      {featureNames.map((feature) => {
        const check = ctx.outputMaybe(outputs.check, { nodeId: `check-${feature}` });
        const spec = ctx.outputMaybe(outputs.spec, { nodeId: `spec-${feature}` });

        return (
          <Sequence key={`prod-${feature}`}>
            <Task id={`check-${feature}`} output={outputs.check}>
              {async () => {
                const p = path.join(specsDir(),`${feature}.md`);
                let content = "";
                try {
                  content = await fs.readFile(p, "utf-8");
                } catch {
                  content = `# ${feature}\n\nSpecification for ${feature}.\n`;
                }

                let needsSpec =
                  !content.includes("## High-Level User POV") ||
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
                      timeoutMs={1800000}
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
                          const p = path.join(specsDir(),`${feature}.md`);
                          const newContent =
                            check.existingContent.trim() +
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
  );
}
