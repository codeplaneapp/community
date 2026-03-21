import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, ORG } from "./helpers";

describe("CLI: Repository Fork", () => {
  const repoName = uniqueName("cli-fork-src");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create source repo for fork tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Fork source repo"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane repo fork creates a fork in user namespace", async () => {
    const forkName = uniqueName("cli-fork-user");
    const result = await cli(
      ["repo", "fork", repoSlug, "--name", forkName],
      { json: true },
    );

    const body = jsonParse<{
      name: string;
      owner: string;
      full_name: string;
      fork: boolean;
      parent: { full_name: string };
    }>(result);
    expect(body.name).toBe(forkName);
    expect(body.owner).toBe(OWNER);
    expect(body.fork).toBe(true);
    expect(body.parent.full_name).toBe(repoSlug);
  });

  test("codeplane repo fork creates a fork in org namespace", async () => {
    const forkName = uniqueName("cli-fork-org");
    const result = await cli(
      ["repo", "fork", repoSlug, "--name", forkName, "--org", ORG],
      { json: true },
    );

    const body = jsonParse<{
      name: string;
      owner: string;
      fork: boolean;
      parent: { full_name: string };
    }>(result);
    expect(body.name).toBe(forkName);
    expect(body.owner).toBe(ORG);
    expect(body.fork).toBe(true);
    expect(body.parent.full_name).toBe(repoSlug);
  });

  test("codeplane repo view shows fork relationship", async () => {
    const forkName = uniqueName("cli-fork-view");
    await cli(
      ["repo", "fork", repoSlug, "--name", forkName],
      { json: true },
    );

    const result = await cli(
      ["repo", "view"],
      { repo: `${OWNER}/${forkName}`, json: true },
    );

    const body = jsonParse<{
      name: string;
      fork: boolean;
      parent: { full_name: string };
    }>(result);
    expect(body.name).toBe(forkName);
    expect(body.fork).toBe(true);
    expect(body.parent.full_name).toBe(repoSlug);
  });

  test("codeplane repo fork of nonexistent repo fails", async () => {
    const result = await cli(
      ["repo", "fork", `${OWNER}/nonexistent-repo-${Date.now()}`],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
