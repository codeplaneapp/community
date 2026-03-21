import { describe, expect, test } from "bun:test";
import { cli, jsonParse, WRITE_TOKEN } from "./helpers";

/**
 * Closed alpha access tests via CLI.
 *
 * Mirrors e2e/api/closed-alpha-access.test.ts. Tests waitlist submission,
 * admin approval, whitelist management, and access gating through CLI commands.
 */

describe("CLI: Alpha Access", () => {
  test("codeplane alpha waitlist join submits a waitlist request", async () => {
    const email = `cli-waitlist-${Date.now()}@example.com`;

    const result = await cli(
      ["alpha", "waitlist", "join", "--email", email, "--note", "please invite me", "--source", "cli-e2e"],
      { json: true },
    );

    const body = jsonParse<{ email: string; status: string }>(result);
    expect(body.email).toBe(email);
    expect(body.status).toBe("pending");
  });

  test("codeplane alpha waitlist join works without auth (public endpoint)", async () => {
    const email = `cli-waitlist-noauth-${Date.now()}@example.com`;

    const result = await cli(
      ["alpha", "waitlist", "join", "--email", email, "--source", "cli-e2e"],
      { token: "", json: true },
    );

    // Waitlist submission should work without authentication
    const body = jsonParse<{ email: string; status: string }>(result);
    expect(body.email).toBe(email);
    expect(body.status).toBe("pending");
  });

  test("admin can list pending waitlist entries", async () => {
    const result = await cli(
      ["admin", "alpha", "waitlist", "list", "--status", "pending"],
      { token: WRITE_TOKEN, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { items: Array<{ email: string }> };
    expect(Array.isArray(body.items)).toBe(true);
  });

  test("admin can approve a waitlist entry and manage whitelist", async () => {
    const email = `cli-admin-approve-${Date.now()}@example.com`;

    // Submit a waitlist entry
    const joinResult = await cli(
      ["alpha", "waitlist", "join", "--email", email, "--source", "cli-e2e"],
      { json: true },
    );
    expect(joinResult.exitCode).toBe(0);

    // Approve the waitlist entry
    const approveResult = await cli(
      ["admin", "alpha", "waitlist", "approve", "--email", email],
      { token: WRITE_TOKEN, json: true },
    );
    const approved = jsonParse<{ status: string }>(approveResult);
    expect(approved.status).toBe("approved");

    // List whitelist — should include the approved email
    const whitelistResult = await cli(
      ["admin", "alpha", "whitelist", "list"],
      { token: WRITE_TOKEN, json: true },
    );
    expect(whitelistResult.exitCode).toBe(0);
    const whitelist = JSON.parse(whitelistResult.stdout) as Array<{
      identity_type: string;
      identity_value: string;
    }>;
    expect(Array.isArray(whitelist)).toBe(true);
    expect(
      whitelist.some(
        (entry) =>
          entry.identity_type === "email" &&
          entry.identity_value.toLowerCase() === email.toLowerCase(),
      ),
    ).toBe(true);

    // Delete whitelist entry
    const deleteResult = await cli(
      ["admin", "alpha", "whitelist", "delete", "--type", "email", "--value", email],
      { token: WRITE_TOKEN, json: true },
    );
    expect(deleteResult.exitCode).toBe(0);
  });

  test("non-admin cannot access admin alpha endpoints", async () => {
    const result = await cli(
      ["admin", "alpha", "waitlist", "list"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
