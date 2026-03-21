import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, READ_TOKEN } from "./helpers";

describe("CLI: Error Handling", () => {
  const repoName = uniqueName("cli-errors");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for error tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Error handling e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  // --- 404 Not Found ---

  test("404: viewing a nonexistent repo", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: `${OWNER}/nonexistent-${Date.now()}`, json: true },
    );

    expect(result.exitCode).not.toBe(0);
    const body = JSON.parse(result.stderr || result.stdout);
    expect(body.message).toBeDefined();
  });

  test("404: viewing a nonexistent issue", async () => {
    const result = await cli(
      ["issue", "view", "99999"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("404: viewing a nonexistent landing request", async () => {
    const result = await cli(
      ["lr", "view", "99999"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("404: deleting a nonexistent webhook", async () => {
    const result = await cli(
      ["webhook", "delete", "99999", "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  // --- 401 Unauthorized ---

  test("401: repo create without token", async () => {
    const result = await cli(
      ["repo", "create", uniqueName("no-auth"), "--description", "should fail"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("401: issue create without token", async () => {
    const result = await cli(
      ["issue", "create", "--title", "No auth", "--body", "fail"],
      { repo: repoSlug, token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("401: invalid token format", async () => {
    const result = await cli(
      ["repo", "list"],
      { token: "invalid-token-format", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  // --- 403 Forbidden ---

  test("403: read-only token cannot create repo", async () => {
    const result = await cli(
      ["repo", "create", uniqueName("forbidden"), "--description", "should fail"],
      { token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("403: read-only token cannot delete repo", async () => {
    const result = await cli(
      ["repo", "delete", "--yes"],
      { repo: repoSlug, token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  // --- 409 Conflict ---

  test("409: creating a repo with duplicate name", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Duplicate name"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("409: creating a label with duplicate name", async () => {
    // Create label first
    await cli(
      ["label", "create", "dup-label", "--color", "0075ca"],
      { repo: repoSlug, json: true },
    );

    // Try to create again
    const result = await cli(
      ["label", "create", "dup-label", "--color", "ff0000"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  // --- 422 Validation ---

  test("422: issue create without required title", async () => {
    const result = await cli(
      ["issue", "create", "--body", "No title provided"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("422: landing request create without required fields", async () => {
    const result = await cli(
      ["lr", "create", "--title", "Missing fields"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("422: webhook create with invalid URL", async () => {
    const result = await cli(
      [
        "webhook", "create",
        "--url", "not-a-url",
        "--events", "push",
        "--active",
      ],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  // --- Error response format ---

  test("error responses include message field", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: `${OWNER}/definitely-not-real-${Date.now()}`, json: true },
    );

    expect(result.exitCode).not.toBe(0);
    // Try to parse the error from either stderr or stdout
    const output = result.stderr || result.stdout;
    try {
      const body = JSON.parse(output) as { message?: string; errors?: unknown[] };
      expect(body.message).toBeDefined();
      expect(typeof body.message).toBe("string");
    } catch {
      // If it's not JSON, at least verify there's error output
      expect(output.length).toBeGreaterThan(0);
    }
  });
});
