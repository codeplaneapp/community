import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, ORG } from "./helpers";

describe("CLI: Organization Teams", () => {
  const orgName = uniqueName("cli-orgteam");
  const teamName = uniqueName("cli-team");
  const repoName = uniqueName("cli-team-repo");

  test("setup: create org for team tests", async () => {
    const result = await cli(
      ["org", "create", orgName, "--description", "Org teams e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(orgName);
  });

  test("create team in org with write permission", async () => {
    const result = await cli(
      ["org", "create-team", teamName, "--org", orgName, "--description", "Dev team", "--permission", "write"],
      { json: true },
    );

    const body = jsonParse<{
      name: string;
      description: string;
      permission: string;
    }>(result);
    expect(body.name).toBe(teamName);
    expect(body.description).toBe("Dev team");
    expect(body.permission).toBe("write");
  });

  test("list teams in org", async () => {
    const result = await cli(
      ["org", "list-teams", "--org", orgName],
      { json: true },
    );

    const body = jsonParse<Array<{ name: string; permission: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((t) => t.name === teamName)).toBe(true);
  });

  test("add member to team", async () => {
    // First add user to org
    await cli(
      ["org", "add-member", "bob", "--org", orgName, "--role", "member"],
      { json: true },
    );

    const result = await cli(
      ["org", "team", "add-member", "bob", "--org", orgName, "--team", teamName],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("list team members", async () => {
    const result = await cli(
      ["org", "team", "members", "--org", orgName, "--team", teamName],
      { json: true },
    );

    const body = jsonParse<Array<{ username: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((m) => m.username === "bob")).toBe(true);
  });

  test("add repo to team", async () => {
    // Create a repo in the org first
    await cli(
      ["repo", "create", repoName, "--org", orgName, "--description", "Team repo"],
      { json: true },
    );

    const result = await cli(
      ["org", "team", "add-repo", `${orgName}/${repoName}`, "--org", orgName, "--team", teamName],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("list team repos", async () => {
    const result = await cli(
      ["org", "team", "repos", "--org", orgName, "--team", teamName],
      { json: true },
    );

    const body = jsonParse<Array<{ name: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((r) => r.name === repoName)).toBe(true);
  });

  test("remove member from team", async () => {
    const result = await cli(
      ["org", "team", "remove-member", "bob", "--org", orgName, "--team", teamName],
      { json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify removal
    const listResult = await cli(
      ["org", "team", "members", "--org", orgName, "--team", teamName],
      { json: true },
    );
    if (listResult.exitCode === 0) {
      const members = JSON.parse(listResult.stdout) as Array<{ username: string }>;
      expect(members.some((m) => m.username === "bob")).toBe(false);
    }
  });
});
