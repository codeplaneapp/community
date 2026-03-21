import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, READ_TOKEN, WRITE_TOKEN } from "./helpers";

/**
 * Token scope authorization tests via CLI.
 *
 * Mirrors e2e/api/token-scope-authz.test.ts and verifies that scoped tokens
 * only grant access to operations within their scope when used through CLI.
 */

describe("CLI: Token Scopes", () => {
  test("jjhub repo create fails with no token (401)", async () => {
    const repoName = uniqueName("cli-scope-notoken");
    const result = await cli(
      ["repo", "create", repoName, "--description", "no token test"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub repo create fails with invalid token", async () => {
    const repoName = uniqueName("cli-scope-bad");
    const result = await cli(
      ["repo", "create", repoName, "--description", "bad token test"],
      { token: "not-a-jjhub-token", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub repo create fails with read-only scope token (403)", async () => {
    const repoName = uniqueName("cli-scope-readonly");
    const result = await cli(
      ["repo", "create", repoName, "--description", "read-only scope test"],
      { token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub repo create succeeds with write scope token", async () => {
    const repoName = uniqueName("cli-scope-write");
    const result = await cli(
      ["repo", "create", repoName, "--description", "write scope test"],
      { token: WRITE_TOKEN, json: true },
    );

    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub repo list succeeds with read-only token", async () => {
    const result = await cli(
      ["repo", "list"],
      { token: READ_TOKEN, json: true },
    );

    // Read-only token should be able to list repos
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });

  test("jjhub auth token create fails with read-only token (scope escalation)", async () => {
    const result = await cli(
      ["auth", "token", "create", uniqueName("cli-escalate"), "--scopes", "write:repository"],
      { token: READ_TOKEN, json: true },
    );

    // Read-only tokens cannot create tokens (requires write:user)
    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub auth token list succeeds with write token", async () => {
    const result = await cli(
      ["auth", "token", "list"],
      { token: WRITE_TOKEN, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });
});
