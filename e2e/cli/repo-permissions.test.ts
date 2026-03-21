import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, ORG, READ_TOKEN } from "./helpers";

/**
 * Repository permission tests via CLI.
 *
 * These mirror the API e2e tests in e2e/api/repo-permissions.test.ts and
 * verify that the permission model is enforced when accessed through CLI
 * commands. Uses seed tokens for alice (write), bob (read), and charlie.
 */

const NON_ADMIN_TOKEN = process.env.CODEPLANE_NON_ADMIN_WRITE_TOKEN ?? "codeplane_cafebabecafebabecafebabecafebabecafebabe";

describe("CLI: Repository Permissions", () => {
  const repoName = uniqueName("cli-perm-repo");

  test("org owner can create an org repo via CLI", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--org", ORG, "--description", "Permission test", "--private"],
      { json: true },
    );

    const body = jsonParse<{ name: string; owner: string }>(result);
    expect(body.name).toBe(repoName);
    expect(body.owner).toBe(ORG);
  });

  test("org member can read private org repo", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: `${ORG}/${repoName}`, token: READ_TOKEN, json: true },
    );

    // Org members have base read permissions
    expect(result.exitCode).toBe(0);
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("non-member cannot read private org repo", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: `${ORG}/${repoName}`, token: NON_ADMIN_TOKEN, json: true },
    );

    // Should be forbidden/denied
    expect(result.exitCode).not.toBe(0);
  });

  test("org member cannot update repo metadata", async () => {
    const result = await cli(
      ["repo", "edit", "--description", "Hacked description"],
      { repo: `${ORG}/${repoName}`, token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("org owner can delete the repo", async () => {
    const result = await cli(
      ["repo", "delete", "--yes"],
      { repo: `${ORG}/${repoName}`, json: true },
    );

    expect(result.exitCode).toBe(0);
  });
});
