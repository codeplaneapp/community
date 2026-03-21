import { describe, expect, test } from "bun:test";
import { cli } from "./helpers";

/**
 * Sign in with Key flow tests via CLI.
 *
 * The full Key Auth flow (nonce request, EIP-4361 message construction, signing,
 * verification) is primarily a browser/API flow. The CLI tests here verify
 * that the auth status and token-based authentication work correctly, which
 * is the CLI's interaction point with the key-auth system.
 */
describe("CLI: Auth Key", () => {
  test("jjhub auth status shows authenticated user (token-based)", async () => {
    const result = await cli(
      ["auth", "status"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { username: string };
    expect(typeof body.username).toBe("string");
    expect(body.username.length).toBeGreaterThan(0);
  });

  test("jjhub auth status fails with empty token", async () => {
    const result = await cli(
      ["auth", "status"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub auth status fails with invalid token", async () => {
    const result = await cli(
      ["auth", "status"],
      { token: "not-a-jjhub-token", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub auth status fails with malformed jjhub token", async () => {
    const result = await cli(
      ["auth", "status"],
      { token: "jjhub_0000000000000000000000000000000000000000", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
