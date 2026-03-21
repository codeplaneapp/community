import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, WRITE_TOKEN, READ_TOKEN } from "./helpers";

describe("CLI: Auth Token CRUD", () => {
  test("jjhub auth token create creates a new token with scopes", async () => {
    const tokenName = uniqueName("cli-crud-token");

    const result = await cli(
      ["auth", "token", "create", tokenName, "--scopes", "read:repository"],
      { json: true },
    );

    const body = jsonParse<{
      id: number;
      name: string;
      token: string;
      token_last_eight: string;
      scopes: string[];
    }>(result);
    expect(body.name).toBe(tokenName);
    expect(body.token).toMatch(/^jjhub_[0-9a-f]{40}$/);
    expect(body.token_last_eight).toHaveLength(8);
    expect(body.scopes).toEqual(["read:repository"]);
    expect(body.id).toBeGreaterThan(0);
  });

  test("jjhub auth token list returns an array of tokens", async () => {
    const result = await cli(
      ["auth", "token", "list"],
      { json: true },
    );

    const body = jsonParse<Array<{
      id: number;
      name: string;
      token_last_eight: string;
      scopes: string[];
    }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    // Each token should have expected fields
    expect(body[0]).toHaveProperty("id");
    expect(body[0]).toHaveProperty("name");
    expect(body[0]).toHaveProperty("token_last_eight");
    expect(body[0]).toHaveProperty("scopes");
    // Raw token should NOT be in list response
    expect((body[0] as Record<string, unknown>).token).toBeUndefined();
  });

  test("jjhub auth token create then delete round-trip", async () => {
    const tokenName = uniqueName("cli-delete-token");

    // Create a token
    const createResult = await cli(
      ["auth", "token", "create", tokenName, "--scopes", "read:repository"],
      { json: true },
    );
    const created = jsonParse<{ id: number; name: string; token: string }>(createResult);
    expect(created.id).toBeGreaterThan(0);

    // Delete the token
    const deleteResult = await cli(
      ["auth", "token", "delete", String(created.id), "--yes"],
      { json: true },
    );
    expect(deleteResult.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["auth", "token", "list"],
      { json: true },
    );
    const tokens = jsonParse<Array<{ id: number }>>(listResult);
    const found = tokens.find((t) => t.id === created.id);
    expect(found).toBeUndefined();
  });

  test("jjhub auth token list fails without a token", async () => {
    const result = await cli(
      ["auth", "token", "list"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub auth token delete fails for non-existent token id", async () => {
    const result = await cli(
      ["auth", "token", "delete", "999999", "--yes"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub auth token create fails with read-only token", async () => {
    const result = await cli(
      ["auth", "token", "create", uniqueName("should-fail"), "--scopes", "read:repository"],
      { token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub auth token create fails with unknown scopes", async () => {
    const result = await cli(
      ["auth", "token", "create", uniqueName("bad-scope"), "--scopes", "write:repository,destroy:instance"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
