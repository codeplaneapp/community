import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, ORG } from "./helpers";

describe("CLI: Repository Transfer", () => {
  test("codeplane repo transfer moves repo to org", async () => {
    const repoName = uniqueName("cli-xfer-to-org");

    // Create repo under user
    const createResult = await cli(
      ["repo", "create", repoName, "--description", "Transfer to org test"],
      { json: true },
    );
    const created = jsonParse<{ name: string; owner: string }>(createResult);
    expect(created.owner).toBe(OWNER);

    // Transfer to org
    const transferResult = await cli(
      ["repo", "transfer", `${OWNER}/${repoName}`, "--new-owner", ORG, "--yes"],
      { json: true },
    );

    const body = jsonParse<{ name: string; owner: string; full_name: string }>(transferResult);
    expect(body.owner).toBe(ORG);
    expect(body.full_name).toBe(`${ORG}/${repoName}`);
  });

  test("codeplane repo view confirms new ownership after transfer", async () => {
    const repoName = uniqueName("cli-xfer-verify");

    await cli(
      ["repo", "create", repoName, "--description", "Verify transfer"],
      { json: true },
    );

    await cli(
      ["repo", "transfer", `${OWNER}/${repoName}`, "--new-owner", ORG, "--yes"],
      { json: true },
    );

    // View under new owner
    const viewResult = await cli(
      ["repo", "view"],
      { repo: `${ORG}/${repoName}`, json: true },
    );

    const body = jsonParse<{ name: string; owner: string }>(viewResult);
    expect(body.name).toBe(repoName);
    expect(body.owner).toBe(ORG);

    // Old path should not resolve
    const oldResult = await cli(
      ["repo", "view"],
      { repo: `${OWNER}/${repoName}`, json: true },
    );
    expect(oldResult.exitCode).not.toBe(0);
  });

  test("codeplane repo transfer to nonexistent owner fails", async () => {
    const repoName = uniqueName("cli-xfer-bad");

    await cli(
      ["repo", "create", repoName, "--description", "Bad transfer target"],
      { json: true },
    );

    const result = await cli(
      ["repo", "transfer", `${OWNER}/${repoName}`, "--new-owner", `nonexistent-${Date.now()}`, "--yes"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane repo transfer without --yes prompts and fails in non-interactive", async () => {
    const repoName = uniqueName("cli-xfer-noprompt");

    await cli(
      ["repo", "create", repoName, "--description", "No confirm test"],
      { json: true },
    );

    const result = await cli(
      ["repo", "transfer", `${OWNER}/${repoName}`, "--new-owner", ORG],
      { json: true },
    );

    // Without --yes in non-interactive mode, should fail or abort
    expect(result.exitCode).not.toBe(0);
  });
});
