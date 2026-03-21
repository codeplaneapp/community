import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, WRITE_TOKEN } from "./helpers";

describe("CLI: Auth", () => {
  test("codeplane auth status shows the current authenticated user", async () => {
    const result = await cli(
      ["auth", "status"],
      { json: true },
    );

    const body = jsonParse<{ username: string }>(result);
    expect(typeof body.username).toBe("string");
    expect(body.username.length).toBeGreaterThan(0);
  });

  test("codeplane auth status fails without a token", async () => {
    const result = await cli(
      ["auth", "status"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane auth token list shows existing tokens", async () => {
    const result = await cli(
      ["auth", "token", "list"],
      { json: true },
    );

    // Should succeed and return a list
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ id: number; name: string }>;
    expect(Array.isArray(body)).toBe(true);
  });

  test("codeplane auth token create and delete round-trip", async () => {
    const tokenName = uniqueName("cli-token");

    // Create a new token
    const createResult = await cli(
      ["auth", "token", "create", tokenName, "--scopes", "read:user,read:repository"],
      { json: true },
    );
    const created = jsonParse<{ id: number; name: string; token: string }>(createResult);
    expect(created.name).toBe(tokenName);
    expect(created.token).toMatch(/^codeplane_[0-9a-f]{40}$/);

    // Delete the token
    const deleteResult = await cli(
      ["auth", "token", "delete", String(created.id), "--yes"],
      { json: true },
    );
    expect(deleteResult.exitCode).toBe(0);
  });
});
