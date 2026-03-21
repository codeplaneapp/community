import { describe, expect, test } from "bun:test";
import { cli } from "./helpers";

describe("CLI: Auth Logout", () => {
  test("codeplane auth logout succeeds when authenticated", async () => {
    const result = await cli(
      ["auth", "logout"],
      { json: true },
    );

    // Logout should succeed (CLI uses token-based auth, so this is a client-side operation)
    expect(result.exitCode).toBe(0);
  });

  test("codeplane auth logout succeeds without a token (no-op)", async () => {
    const result = await cli(
      ["auth", "logout"],
      { token: "", json: true },
    );

    // Logout without credentials should still succeed gracefully
    expect(result.exitCode).toBe(0);
  });
});
