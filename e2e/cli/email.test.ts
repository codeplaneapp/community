import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Email Management", () => {
  let emailID = 0;
  const uniqueEmail = `cli-e2e-${Date.now()}@example.com`;

  test("codeplane api GET /api/user/emails lists emails", async () => {
    const result = await cli(
      ["api", "/api/user/emails"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    for (const item of body) {
      expect(typeof item.id).toBe("number");
      expect(typeof item.email).toBe("string");
      expect(typeof item.is_activated).toBe("boolean");
      expect(typeof item.is_primary).toBe("boolean");
    }
  });

  test("codeplane api GET /api/user/emails requires auth", async () => {
    const result = await cli(
      ["api", "/api/user/emails"],
      { json: true, token: "" },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane api POST /api/user/emails creates a new email", async () => {
    const result = await cli(
      [
        "api",
        "/api/user/emails",
        "--method", "POST",
        "-f", `email=${uniqueEmail}`,
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(typeof body.id).toBe("number");
    expect(body.email).toBe(uniqueEmail);
    expect(body.is_activated).toBe(false);
    emailID = body.id as number;
  });

  test("codeplane api POST /api/user/emails rejects invalid email", async () => {
    const result = await cli(
      [
        "api",
        "/api/user/emails",
        "--method", "POST",
        "-f", "email=notanemail",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane api POST /api/user/emails rejects empty email", async () => {
    const result = await cli(
      [
        "api",
        "/api/user/emails",
        "--method", "POST",
        "-f", "email=",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane api POST /api/user/emails/{id}/verify requests verification", async () => {
    const result = await cli(
      [
        "api",
        `/api/user/emails/${emailID}/verify`,
        "--method", "POST",
      ],
      { json: true },
    );

    // 204 No Content returns empty, exitCode 0
    expect(result.exitCode).toBe(0);
  });

  test("created email appears in list", async () => {
    const result = await cli(
      ["api", "/api/user/emails"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ id: number }>;
    expect(body.some((e) => e.id === emailID)).toBe(true);
  });

  test("codeplane api DELETE /api/user/emails/{id} removes the email", async () => {
    const result = await cli(
      [
        "api",
        `/api/user/emails/${emailID}`,
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["api", "/api/user/emails"],
      { json: true },
    );
    expect(listResult.exitCode).toBe(0);
    const body = JSON.parse(listResult.stdout) as Array<{ id: number }>;
    expect(body.some((e) => e.id === emailID)).toBe(false);
  });

  test("codeplane api DELETE /api/user/emails/999999 returns 404 for non-existent", async () => {
    const result = await cli(
      [
        "api",
        "/api/user/emails/999999",
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});

describe("CLI: Notifications", () => {
  test("codeplane notification list returns notifications", async () => {
    const result = await cli(
      ["notification", "list"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });

  test("codeplane notification list --unread filters unread notifications", async () => {
    const result = await cli(
      ["notification", "list", "--unread"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });

  test("codeplane notification read --all marks all as read", async () => {
    const result = await cli(
      ["notification", "read", "--all"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });
});
