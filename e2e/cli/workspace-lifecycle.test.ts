import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, READ_TOKEN } from "./helpers";

const VM_E2E_ENABLED = process.env.CODEPLANE_E2E_FREESTYLE === "true";
const workspaceTest = VM_E2E_ENABLED ? test : test.skip;

describe("CLI: Workspace Full Lifecycle", () => {
  const repoName = uniqueName("cli-ws-life");
  const repoSlug = `${OWNER}/${repoName}`;
  let workspaceID = "";

  test("setup: create repo for workspace lifecycle tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Workspace lifecycle e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  workspaceTest("create workspace with custom config", async () => {
    const result = await cli(
      [
        "workspace", "create",
        "--name", "lifecycle-ws",
        "--size", "small",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: string;
      name: string;
      status: string;
      size: string;
    }>(result);
    expect(typeof body.id).toBe("string");
    expect(body.name).toBe("lifecycle-ws");
    expect(body.status).toBe("running");
    workspaceID = body.id;
  });

  workspaceTest("check workspace status", async () => {
    const result = await cli(
      ["workspace", "status", workspaceID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: string;
      status: string;
      uptime_seconds: number;
    }>(result);
    expect(body.id).toBe(workspaceID);
    expect(body.status).toBe("running");
    expect(typeof body.uptime_seconds).toBe("number");
  });

  workspaceTest("suspend workspace", async () => {
    const result = await cli(
      ["workspace", "suspend", workspaceID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: string; status: string }>(result);
    expect(body.id).toBe(workspaceID);
    expect(body.status).toBe("suspended");
  });

  workspaceTest("resume suspended workspace", async () => {
    const result = await cli(
      ["workspace", "resume", workspaceID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: string; status: string }>(result);
    expect(body.id).toBe(workspaceID);
    expect(body.status).toBe("running");
  });

  workspaceTest("delete workspace", async () => {
    const result = await cli(
      ["workspace", "delete", workspaceID, "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify workspace is gone or stopped
    const listResult = await cli(
      ["workspace", "list"],
      { repo: repoSlug, json: true },
    );
    if (listResult.exitCode === 0) {
      const workspaces = JSON.parse(listResult.stdout) as Array<{ id: string; status: string }>;
      const ws = workspaces.find((w) => w.id === workspaceID);
      if (ws) {
        expect(ws.status).toBe("stopped");
      }
    }
  });

  test("workspace create fails without auth", async () => {
    const result = await cli(
      ["workspace", "create", "--name", "no-auth"],
      { repo: repoSlug, token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
