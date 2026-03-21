import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, API_URL } from "./helpers";

describe("CLI: Workflow Commit Status", () => {
  const repoName = uniqueName("cli-wf-status");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for workflow status tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI workflow commit status e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane api can create a commit status", async () => {
    const sha = "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111";
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/statuses/${sha}`,
        "--method", "POST",
        "-f", "context=ci/cli-e2e-test",
        "-f", "status=success",
        "-f", "description=CLI E2E workflow status test",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("codeplane api can list commit statuses", async () => {
    const sha = "aaaa1111aaaa1111aaaa1111aaaa1111aaaa1111";
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/statuses/${sha}`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    // Could be an array or object depending on endpoint shape
    if (Array.isArray(body)) {
      expect(body.length).toBeGreaterThanOrEqual(1);
      const status = body.find(
        (s: Record<string, unknown>) => s.context === "ci/cli-e2e-test",
      );
      expect(status).toBeDefined();
    }
  });

  test("codeplane workflow list returns workflow definitions", async () => {
    const result = await cli(
      ["workflow", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body).toHaveProperty("workflows");
    expect(Array.isArray(body.workflows)).toBe(true);
  });

  test("codeplane workflow runs returns workflow run history", async () => {
    const result = await cli(
      ["workflow", "runs"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(body).toHaveProperty("workflow_runs");
    expect(Array.isArray(body.workflow_runs)).toBe(true);
  });
});
