import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, ORG } from "./helpers";

describe("CLI: Organizations", () => {
  const orgName = uniqueName("cli-org");

  test("codeplane org create creates a new organization", async () => {
    const result = await cli(
      ["org", "create", orgName, "--description", "CLI org e2e"],
      { json: true },
    );

    const body = jsonParse<{ name: string; description: string }>(result);
    expect(body.name).toBe(orgName);
    expect(body.description).toBe("CLI org e2e");
  });

  test("codeplane org list lists organizations", async () => {
    const result = await cli(
      ["org", "list"],
      { json: true },
    );

    const body = jsonParse<Array<{ name: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    // At minimum the seeded 'acme' org should be visible
    expect(body.some((o) => o.name === ORG)).toBe(true);
  });

  test("codeplane org create-team creates a team in the org", async () => {
    const teamName = uniqueName("cli-team");
    const result = await cli(
      ["org", "create-team", teamName, "--org", orgName, "--description", "CLI team", "--permission", "write"],
      { json: true },
    );

    const body = jsonParse<{ name: string; description: string; permission: string }>(result);
    expect(body.name).toBe(teamName);
    expect(body.description).toBe("CLI team");
    expect(body.permission).toBe("write");
  });

  test("codeplane org add-member adds a member to the org", async () => {
    const result = await cli(
      ["org", "add-member", "bob", "--org", orgName, "--role", "member"],
      { json: true },
    );

    // Expect success (the exact response shape may vary)
    expect(result.exitCode).toBe(0);
  });
});
