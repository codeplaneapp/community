import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, READ_TOKEN } from "./helpers";

describe("CLI: Collaborators", () => {
  const repoName = uniqueName("cli-collabs");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create private repo for collaborator tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Collaborator e2e", "--private"],
      { json: true },
    );
    const body = jsonParse<{ name: string; private: boolean }>(result);
    expect(body.name).toBe(repoName);
    expect(body.private).toBe(true);
  });

  test("add collaborator with write permission", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/collaborators/bob`,
        "--method", "PUT",
        "-f", "permission=write",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("list collaborators includes added user", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/collaborators`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{
      username: string;
      permission: string;
    }>;
    expect(Array.isArray(body)).toBe(true);
    const bob = body.find((c) => c.username === "bob");
    expect(bob).toBeDefined();
    expect(bob?.permission).toBe("write");
  });

  test("check collaborator access returns true", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/collaborators/bob`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("remove collaborator", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/collaborators/bob`,
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify collaborator is removed
    const checkResult = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/collaborators/bob`],
      { json: true },
    );
    expect(checkResult.exitCode).not.toBe(0);
  });

  test("adding nonexistent user as collaborator fails", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/collaborators/nonexistent-user-${Date.now()}`,
        "--method", "PUT",
        "-f", "permission=read",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
