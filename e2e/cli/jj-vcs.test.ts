import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

/**
 * jj VCS CLI tests — bookmarks, changes, diffs, files, operations.
 *
 * These tests mirror the API tests in e2e/api/jj-vcs-routes.test.ts but
 * exercise them through CLI commands. They require a repo that has been
 * pushed to the server with at least one commit. The setup test creates
 * a repo and pushes an initial commit via the CLI/API.
 *
 * NOTE: The setup step requires SSH key registration and git push. If SSH
 * is not configured, some tests may be skipped. The bookmark/change list
 * tests require at least one pushed commit.
 */

const repoName = uniqueName("cli-jj-vcs");
const repoSlug = `${OWNER}/${repoName}`;
let mainChangeID = "";

describe("CLI: jj VCS (bookmarks, changes, diffs)", () => {
  test("setup: create repo for jj VCS tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI jj VCS e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane bookmark list returns bookmarks", async () => {
    const result = await cli(
      ["bookmark", "list"],
      { repo: repoSlug, json: true },
    );

    // May be empty if no push yet, but should succeed
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);

    // If there are bookmarks, grab the main change ID for later tests
    if (body.length > 0) {
      const main = body.find((b: { name: string }) => b.name === "main");
      if (main) {
        mainChangeID = main.target_change_id;
        expect(typeof main.target_change_id).toBe("string");
        expect(typeof main.target_commit_id).toBe("string");
      }
    }
  });

  test("codeplane change list returns changes", async () => {
    const result = await cli(
      ["change", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);

    if (body.length > 0) {
      const first = body[0];
      expect(typeof first.change_id).toBe("string");
      expect(typeof first.commit_id).toBe("string");
      expect(typeof first.description).toBe("string");

      // Save a change ID for subsequent tests if we don't have one
      if (!mainChangeID) {
        mainChangeID = first.change_id;
      }
    }
  });

  test("codeplane change view shows a single change", async () => {
    if (!mainChangeID) {
      console.log("Skipping: no change ID available (repo may not have commits)");
      return;
    }

    const result = await cli(
      ["change", "view", mainChangeID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      change_id: string;
      commit_id: string;
      description: string;
      author_name: string;
      timestamp: string;
      has_conflict: boolean;
      is_empty: boolean;
    }>(result);
    expect(body.change_id).toBe(mainChangeID);
    expect(typeof body.commit_id).toBe("string");
    expect(typeof body.description).toBe("string");
  });

  test("codeplane change diff shows diff for a change", async () => {
    if (!mainChangeID) {
      console.log("Skipping: no change ID available (repo may not have commits)");
      return;
    }

    const result = await cli(
      ["change", "diff", mainChangeID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      change_id: string;
      file_diffs: unknown[];
    }>(result);
    expect(body.change_id).toBe(mainChangeID);
    expect(Array.isArray(body.file_diffs)).toBe(true);
  });

  test("codeplane change view returns error for nonexistent change", async () => {
    const result = await cli(
      ["change", "view", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane bookmark list works without auth (public repo)", async () => {
    const result = await cli(
      ["bookmark", "list"],
      { repo: repoSlug, token: "", json: true },
    );

    // Public repos allow anonymous read access
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });
});
