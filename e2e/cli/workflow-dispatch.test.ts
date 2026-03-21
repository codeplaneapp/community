import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Workflow Dispatch", () => {
  const repoName = uniqueName("cli-wf-dispatch");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for workflow dispatch tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Workflow dispatch e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  test("register a workflow definition", async () => {
    const result = await cli(
      [
        "workflow", "register",
        "--name", "ci-pipeline",
        "--path", ".jjhub/workflows/ci.ts",
        "--trigger", "push",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      name: string;
      path: string;
      triggers: string[];
    }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.name).toBe("ci-pipeline");
    expect(body.path).toBe(".jjhub/workflows/ci.ts");
    expect(body.triggers).toContain("push");
  });

  test("manual dispatch creates a workflow run", async () => {
    const result = await cli(
      [
        "workflow", "dispatch", "ci-pipeline",
        "--ref", "main",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      workflow_name: string;
      status: string;
      trigger: string;
    }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.workflow_name).toBe("ci-pipeline");
    expect(["queued", "pending", "running"]).toContain(body.status);
    expect(body.trigger).toBe("workflow_dispatch");
  });

  test("dispatch with inputs passes parameters", async () => {
    const result = await cli(
      [
        "workflow", "dispatch", "ci-pipeline",
        "--ref", "main",
        "--input", "environment=staging",
        "--input", "debug=true",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      inputs: Record<string, string>;
    }>(result);
    expect(body.inputs.environment).toBe("staging");
    expect(body.inputs.debug).toBe("true");
  });

  test("dispatch nonexistent workflow fails", async () => {
    const result = await cli(
      ["workflow", "dispatch", `nonexistent-${Date.now()}`, "--ref", "main"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("workflow list includes registered workflow", async () => {
    const result = await cli(
      ["workflow", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ workflows: Array<{ name: string }> }>(result);
    expect(body.workflows.some((w) => w.name === "ci-pipeline")).toBe(true);
  });
});
