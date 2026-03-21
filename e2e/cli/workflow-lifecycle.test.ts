import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Workflow Run Lifecycle", () => {
  const repoName = uniqueName("cli-wf-life");
  const repoSlug = `${OWNER}/${repoName}`;
  let runId = 0;

  test("setup: create repo and register workflow", async () => {
    await cli(
      ["repo", "create", repoName, "--description", "Workflow lifecycle e2e"],
      { json: true },
    );

    await cli(
      [
        "workflow", "register",
        "--name", "build-pipeline",
        "--path", ".codeplane/workflows/build.ts",
        "--trigger", "push",
      ],
      { repo: repoSlug, json: true },
    );
  });

  test("dispatch workflow to create a run", async () => {
    const result = await cli(
      ["workflow", "dispatch", "build-pipeline", "--ref", "main"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: number; status: string }>(result);
    expect(typeof body.id).toBe("number");
    runId = body.id;
  });

  test("view workflow run details", async () => {
    const result = await cli(
      ["workflow", "run", "view", String(runId)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      status: string;
      workflow_name: string;
      created_at: string;
    }>(result);
    expect(body.id).toBe(runId);
    expect(body.workflow_name).toBe("build-pipeline");
    expect(typeof body.created_at).toBe("string");
  });

  test("list workflow run steps", async () => {
    const result = await cli(
      ["workflow", "run", "steps", String(runId)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      steps: Array<{ name: string; status: string }>;
    }>(result);
    expect(body).toHaveProperty("steps");
    expect(Array.isArray(body.steps)).toBe(true);
  });

  test("cancel a running workflow", async () => {
    const result = await cli(
      ["workflow", "run", "cancel", String(runId)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: number; status: string }>(result);
    expect(body.id).toBe(runId);
    expect(body.status).toBe("cancelled");
  });

  test("rerun a cancelled workflow", async () => {
    const result = await cli(
      ["workflow", "run", "rerun", String(runId)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      status: string;
    }>(result);
    // Rerun creates a new run or re-queues the existing one
    expect(typeof body.id).toBe("number");
    expect(["queued", "pending", "running"]).toContain(body.status);
  });

  test("workflow runs list shows run history", async () => {
    const result = await cli(
      ["workflow", "runs"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      workflow_runs: Array<{ id: number; status: string; workflow_name: string }>;
    }>(result);
    expect(body.workflow_runs.length).toBeGreaterThanOrEqual(1);
  });
});
