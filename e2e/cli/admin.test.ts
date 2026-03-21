import { describe, expect, test } from "bun:test";
import { cli, jsonParse, WRITE_TOKEN, READ_TOKEN } from "./helpers";

// WRITE_TOKEN is alice (admin), READ_TOKEN is a non-admin token
const NON_ADMIN_TOKEN =
  process.env.JJHUB_NON_ADMIN_WRITE_TOKEN ??
  "jjhub_cafebabecafebabecafebabecafebabecafebabe";

describe("CLI: Admin", () => {
  test("jjhub admin user list returns users (admin)", async () => {
    const result = await cli(
      ["admin", "user", "list"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });

  test("jjhub admin user list supports pagination", async () => {
    const result = await cli(
      ["admin", "user", "list", "--page", "1", "--limit", "5"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeLessThanOrEqual(5);
  });

  test("jjhub admin runner list returns runners (admin)", async () => {
    const result = await cli(
      ["admin", "runner", "list"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
  });

  test("jjhub admin runner list items have correct shape", async () => {
    const result = await cli(
      ["admin", "runner", "list"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    for (const runner of body) {
      expect(typeof runner.id).toBe("number");
      expect(typeof runner.name).toBe("string");
      expect(typeof runner.status).toBe("string");
      expect(["idle", "busy", "offline", "draining"]).toContain(runner.status as string);
    }
  });

  test("jjhub admin workflow list returns workflow runs (admin)", async () => {
    const result = await cli(
      ["admin", "workflow", "list"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("jjhub admin health returns system health", async () => {
    const result = await cli(
      ["admin", "health"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("jjhub admin user list fails for non-admin user", async () => {
    const result = await cli(
      ["admin", "user", "list"],
      { json: true, token: NON_ADMIN_TOKEN },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub admin runner list fails for non-admin user", async () => {
    const result = await cli(
      ["admin", "runner", "list"],
      { json: true, token: NON_ADMIN_TOKEN },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub admin user list fails without auth", async () => {
    const result = await cli(
      ["admin", "user", "list"],
      { json: true, token: "" },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
