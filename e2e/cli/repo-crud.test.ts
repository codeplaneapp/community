import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, ORG } from "./helpers";

describe("CLI: Repository CRUD", () => {
  const repoName = uniqueName("cli-repo-crud");

  test("jjhub repo create creates a new user repository", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI e2e repo"],
      { json: true },
    );

    const body = jsonParse<{ name: string; owner: string; full_name: string; description: string }>(result);
    expect(body.name).toBe(repoName);
    expect(body.owner).toBe(OWNER);
    expect(body.full_name).toBe(`${OWNER}/${repoName}`);
    expect(body.description).toBe("CLI e2e repo");
  });

  test("jjhub repo view returns repo details", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: `${OWNER}/${repoName}`, json: true },
    );

    const body = jsonParse<{ name: string; owner: string; full_name: string }>(result);
    expect(body.name).toBe(repoName);
    expect(body.owner).toBe(OWNER);
    expect(body.full_name).toBe(`${OWNER}/${repoName}`);
  });

  test("jjhub repo list returns a list of repos", async () => {
    const result = await cli(
      ["repo", "list"],
      { json: true },
    );

    const body = jsonParse<Array<{ name: string; owner: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((r) => r.name === repoName)).toBe(true);
  });

  test("jjhub repo create creates an org repository", async () => {
    const orgRepoName = uniqueName("cli-repo-org");

    const result = await cli(
      ["repo", "create", orgRepoName, "--org", ORG, "--description", "CLI org repo"],
      { json: true },
    );

    const body = jsonParse<{ name: string; owner: string; full_name: string }>(result);
    expect(body.name).toBe(orgRepoName);
    expect(body.owner).toBe(ORG);
    expect(body.full_name).toBe(`${ORG}/${orgRepoName}`);
  });

  test("jjhub repo delete removes the repository", async () => {
    const deleteResult = await cli(
      ["repo", "delete", "--yes"],
      { repo: `${OWNER}/${repoName}`, json: true },
    );
    expect(deleteResult.exitCode).toBe(0);

    // Verify it is gone
    const viewResult = await cli(
      ["repo", "view"],
      { repo: `${OWNER}/${repoName}`, json: true },
    );
    expect(viewResult.exitCode).not.toBe(0);
  });
});
