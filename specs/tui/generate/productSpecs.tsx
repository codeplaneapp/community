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
    design: z.string().describe("Comprehensive design details (TUI screen layout, keybindings, component usage, data hooks) from an end-user perspective. Markdown format."),
    permissions: z.string().describe("Permissions, authorization roles, security constraints, and rate limits. Markdown format."),
    telemetry: z.string().describe("Product analytics, business events, funnel metrics, and success indicators. Markdown format."),
    observability: z.string().describe("Comprehensive observability plan including logging, Prometheus metrics, alerts, runbooks, and error cases. Markdown format."),
    verification: z.string().describe("Comprehensive list of tests for this feature using @microsoft/tui-test. Markdown format, organized by test type."),
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

  const dir = specsDir();

  return (
    <Parallel maxConcurrency={8}>
      {featureNames.map((feature) => {
        const check = ctx.outputMaybe(outputs.check, { nodeId: `check-${feature}` });
        const spec = ctx.outputMaybe(outputs.spec, { nodeId: `spec-${feature}` });

        return (
          <Sequence key={`prod-${feature}`}>
            <Task id={`check-${feature}`} output={outputs.check}>
              {async () => {
                const p = path.join(dir, `${feature}.md`);
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
                      {`Write a specification for the TUI feature: ${feature}.

This is a terminal UI feature built with React 19 + OpenTUI. The TUI is keyboard-first, runs in 80x24+ terminals, uses ANSI colors, and consumes @codeplane/ui-core hooks.

1. **User POV**:
   - Write a high-level user POV description of this TUI feature.
   - Focus on what the terminal user experiences, the keyboard interactions, and the visual layout.
   - Do not include implementation details or database schemas.
   - Format as markdown paragraphs.

2. **Acceptance Criteria**:
   - Provide a bulleted checklist of strict product constraints.
   - Define the "Definition of Done" for the TUI implementation.
   - Cover edge cases specific to terminal environments (small terminals, no color support, rapid key input).
   - Detail boundary constraints (max string lengths, truncation behavior, scrollbox limits).

3. **Design**:
   - Specify the TUI screen layout using OpenTUI components (<box>, <scrollbox>, <text>, <input>, <select>, <code>, <diff>, <markdown>).
   - Define all keybindings for this screen/feature.
   - Specify how the feature responds to terminal resize.
   - Describe data hooks from @codeplane/ui-core that this feature consumes.
   - Focus on end-user experience, not internal implementation.

4. **Permissions & Security**:
   - Detail which authorization roles are required.
   - Outline rate limiting considerations.
   - Note that the TUI uses token-based auth (no OAuth browser flow).

5. **Telemetry & Product Analytics**:
   - Identify key business events for TUI usage tracking.
   - List properties attached to these events.
   - Define success indicators for this TUI feature.

6. **Observability**:
   - Specify logging requirements for this feature.
   - Define error cases specific to TUI (terminal resize during operation, SSE disconnect, etc.).
   - Document failure modes and recovery behavior.

7. **Verification**:
   - Create a complete list of tests using @microsoft/tui-test.
   - Include terminal snapshot tests for key visual states.
   - Include keyboard interaction tests (key sequence → expected state change).
   - Include responsive tests at 80x24, 120x40, and 200x60 sizes.
   - Tests that fail due to unimplemented backends are left failing (never skipped).
   - Focus on E2E/integration tests, not unit tests.`}
                    </Task>

                    {spec ? (
                      <Task id={`write-${feature}`} output={outputs.write}>
                        {async () => {
                          const p = path.join(dir, `${feature}.md`);
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
