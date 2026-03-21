import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

const VM_E2E_ENABLED = process.env.CODEPLANE_E2E_FREESTYLE === "true";
const workspaceTest = VM_E2E_ENABLED ? test : test.skip;

describe("CLI: Workspace Sessions", () => {
  const repoName = uniqueName("cli-ws-sessions");
  const repoSlug = `${OWNER}/${repoName}`;
  let sessionID = "";

  test("setup: create repo for workspace session tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI workspace sessions e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  workspaceTest("codeplane workspace create creates a session", async () => {
    const result = await cli(
      ["workspace", "create", "--name", "cli-session-ws"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: string;
      name: string;
      status: string;
    }>(result);
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("running");
    sessionID = body.id;
  });

  workspaceTest("codeplane workspace list shows the session", async () => {
    const result = await cli(
      ["workspace", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ id: string; status: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((w) => w.id === sessionID)).toBe(true);
  });

  workspaceTest("codeplane workspace delete destroys the session", async () => {
    const result = await cli(
      ["workspace", "delete", sessionID, "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify the session is gone or stopped
    const listResult = await cli(
      ["workspace", "list"],
      { repo: repoSlug, json: true },
    );
    if (listResult.exitCode === 0) {
      const workspaces = JSON.parse(listResult.stdout) as Array<{ id: string; status: string }>;
      const ws = workspaces.find((w) => w.id === sessionID);
      // Either not in the list or status is stopped
      if (ws) {
        expect(ws.status).toBe("stopped");
      }
    }
  });
});
