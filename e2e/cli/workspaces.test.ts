import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Workspaces", () => {
  const repoName = uniqueName("cli-workspaces");
  const repoSlug = `${OWNER}/${repoName}`;
  let workspaceID = "";

  test("setup: create repo for workspace tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI workspaces e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane workspace create creates a workspace", async () => {
    const result = await cli(
      ["workspace", "create", "--name", "cli-ws"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: string;
      name: string;
      status: string;
    }>(result);
    expect(typeof body.id).toBe("string");
    expect(body.name).toBe("cli-ws");
    expect(body.status).toBe("running");
    workspaceID = body.id;
  });

  test("codeplane workspace list lists workspaces", async () => {
    const result = await cli(
      ["workspace", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ id: string; name: string; status: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((w) => w.id === workspaceID)).toBe(true);
  });

  test("codeplane workspace suspend suspends a workspace", async () => {
    const result = await cli(
      ["workspace", "suspend", workspaceID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: string; status: string }>(result);
    expect(body.id).toBe(workspaceID);
    expect(body.status).toBe("suspended");
  });

  test("codeplane workspace resume resumes a workspace", async () => {
    const result = await cli(
      ["workspace", "resume", workspaceID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: string; status: string }>(result);
    expect(body.id).toBe(workspaceID);
    expect(body.status).toBe("running");
  });

  test("codeplane workspace delete deletes a workspace", async () => {
    const result = await cli(
      ["workspace", "delete", workspaceID, "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
  });
});
