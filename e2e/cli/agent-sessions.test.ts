import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

const AGENT_E2E_ENABLED =
  process.env.JJHUB_E2E_FREESTYLE === "true" &&
  Boolean(process.env.JJHUB_FREESTYLE_AGENT_SNAPSHOT_ID);
const agentTest = AGENT_E2E_ENABLED ? test : test.skip;

describe("CLI: Agent Sessions", () => {
  const repoName = uniqueName("cli-agent-sessions");
  const repoSlug = `${OWNER}/${repoName}`;
  let sessionID = "";

  test("setup: create repo for agent session tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI agent sessions e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub agent session list lists sessions (empty initially)", async () => {
    const result = await cli(
      ["agent", "session", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });

  test("jjhub agent session run creates a session and posts a message", async () => {
    const result = await cli(
      ["agent", "session", "run", "Hello from CLI e2e test", "--title", "CLI agent e2e"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: string; status: string }>(result);
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
    sessionID = body.id;
  });

  test("jjhub agent session view shows the session", async () => {
    const result = await cli(
      ["agent", "session", "view", sessionID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: string; status: string }>(result);
    expect(body.id).toBe(sessionID);
  });

  test("jjhub agent session chat sends a follow-up message", async () => {
    const result = await cli(
      ["agent", "session", "chat", sessionID, "Follow-up message from CLI"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("jjhub agent session list includes created session", async () => {
    const result = await cli(
      ["agent", "session", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ id: string }>;
    expect(body.some((s) => s.id === sessionID)).toBe(true);
  });

  agentTest(
    "jjhub api raw DELETE removes the agent session",
    async () => {
      const result = await cli(
        ["api", `/api/repos/${OWNER}/${repoName}/agent/sessions/${sessionID}`, "--method", "DELETE"],
        { json: true },
      );

      expect(result.exitCode).toBe(0);
    },
  );
});
