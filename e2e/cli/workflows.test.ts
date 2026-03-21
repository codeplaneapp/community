import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Workflows", () => {
  const repoName = uniqueName("cli-workflows");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for workflow tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI workflows e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub workflow list lists workflow definitions", async () => {
    const result = await cli(
      ["workflow", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ workflows: Array<{ id: number; name: string; path: string }> }>(result);
    expect(body).toHaveProperty("workflows");
    expect(Array.isArray(body.workflows)).toBe(true);
  });

  test("jjhub workflow runs lists workflow runs", async () => {
    // This tests listing runs for the repo; may return empty if no workflows are seeded
    const result = await cli(
      ["workflow", "runs"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ workflow_runs: Array<{ id: number; status: string }> }>(result);
    expect(body).toHaveProperty("workflow_runs");
    expect(Array.isArray(body.workflow_runs)).toBe(true);
  });

  test("jjhub workflow run view returns 404 for unknown run", async () => {
    const result = await cli(
      ["workflow", "run", "view", "99999"],
      { repo: repoSlug, json: true },
    );

    // Expecting non-zero exit code for missing run
    expect(result.exitCode).not.toBe(0);
  });
});
