import { describe, expect, test } from "bun:test";
import { cli, jsonParse, WRITE_TOKEN } from "./helpers";

/**
 * Notification CLI tests.
 *
 * Mirrors e2e/api/notifications-sse.test.ts REST endpoint tests.
 * SSE streaming is tested at the API level; CLI tests focus on the
 * list, mark-read, and mark-all-read operations.
 */

describe("CLI: Notifications", () => {
  test("jjhub notification list requires auth", async () => {
    const result = await cli(
      ["notification", "list"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub notification list returns notifications for authenticated user", async () => {
    const result = await cli(
      ["notification", "list"],
      { token: WRITE_TOKEN, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{
      id: number;
      subject: string;
    }>;
    expect(Array.isArray(body)).toBe(true);

    // Verify structure of each notification
    for (const item of body) {
      expect(typeof item.id).toBe("number");
      expect(typeof item.subject).toBe("string");
    }
  });

  test("jjhub notification list respects pagination", async () => {
    const result = await cli(
      ["notification", "list", "--per-page", "5", "--page", "1"],
      { token: WRITE_TOKEN, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  test("jjhub notification mark-read marks a specific notification as read", async () => {
    // Mark notification ID 1 as read (may be a no-op if it doesn't exist for this user)
    const result = await cli(
      ["notification", "mark-read", "1"],
      { token: WRITE_TOKEN, json: true },
    );

    // Should succeed even as a no-op
    expect(result.exitCode).toBe(0);
  });

  test("jjhub notification mark-read rejects zero ID", async () => {
    const result = await cli(
      ["notification", "mark-read", "0"],
      { token: WRITE_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub notification mark-read requires auth", async () => {
    const result = await cli(
      ["notification", "mark-read", "1"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub notification mark-all-read marks all as read", async () => {
    const result = await cli(
      ["notification", "mark-all-read"],
      { token: WRITE_TOKEN, json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("jjhub notification mark-all-read requires auth", async () => {
    const result = await cli(
      ["notification", "mark-all-read"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
