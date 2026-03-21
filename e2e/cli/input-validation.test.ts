import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Input Validation Consistency", () => {
  const repoName = uniqueName("cli-validation");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for validation tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI input validation e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("webhook create without URL fails with validation error", async () => {
    // Omitting --url should fail
    const result = await cli(
      [
        "webhook", "create",
        "--events", "push",
        "--active",
      ],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("webhook create with non-HTTPS URL fails", async () => {
    const result = await cli(
      [
        "webhook", "create",
        "--url", "http://example.com/insecure-webhook",
        "--events", "push",
        "--active",
      ],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("agent session run on unknown repo fails gracefully", async () => {
    const result = await cli(
      ["agent", "session", "run", "test prompt", "--title", "validation test"],
      { repo: `${OWNER}/nonexistent-repo-${Date.now()}`, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("agent session view with invalid session ID fails gracefully", async () => {
    const result = await cli(
      ["agent", "session", "view", "00000000-0000-0000-0000-000000000000"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("email create with invalid format fails", async () => {
    const result = await cli(
      [
        "api",
        "/api/user/emails",
        "--method", "POST",
        "-f", "email=not-an-email",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("email create with empty email fails", async () => {
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

  test("search repositories with invalid page fails", async () => {
    const result = await cli(
      ["api", `/api/search/repositories?q=${repoName}&page=0`],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("search users with invalid per_page fails", async () => {
    const result = await cli(
      ["api", `/api/search/users?q=${OWNER}&per_page=abc`],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("workflow run view with invalid run ID fails", async () => {
    const result = await cli(
      ["workflow", "run", "view", "99999"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("api call with invalid method fails", async () => {
    const result = await cli(
      ["api", "/api/user/repos", "--method", "INVALID"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("api call without leading slash fails", async () => {
    const result = await cli(
      ["api", "api/user/repos"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("bookmark create with empty name via api fails", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/bookmarks`,
        "--method", "POST",
        "-f", "name=",
        "-f", "target_change_id=dummy-change-id",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("bookmark create with empty target_change_id via api fails", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/bookmarks`,
        "--method", "POST",
        "-f", "name=missing-target",
        "-f", "target_change_id=",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
