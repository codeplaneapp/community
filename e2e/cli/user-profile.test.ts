import { describe, expect, test } from "bun:test";
import { cli, jsonParse, OWNER } from "./helpers";

describe("CLI: User Profile", () => {
  test("jjhub user view shows the authenticated user profile", async () => {
    const result = await cli(
      ["user", "view"],
      { json: true },
    );

    // jjhub user view without arguments shows the authenticated user
    const body = jsonParse<{ username: string; display_name: string }>(result);
    expect(body.username).toBe(OWNER);
    expect(typeof body.display_name).toBe("string");
  });

  test("jjhub user view <username> shows a public profile", async () => {
    const result = await cli(
      ["user", "view", OWNER],
      { json: true },
    );

    const body = jsonParse<{ username: string }>(result);
    expect(body.username).toBe(OWNER);
  });

  test("jjhub user view returns error for nonexistent user", async () => {
    const result = await cli(
      ["user", "view", "nonexistent-user-12345"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub ssh-key list shows SSH keys", async () => {
    const result = await cli(
      ["ssh-key", "list"],
      { json: true },
    );

    // Should succeed even if there are no keys
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ id: number; title: string; fingerprint: string }>;
    expect(Array.isArray(body)).toBe(true);
  });
});
