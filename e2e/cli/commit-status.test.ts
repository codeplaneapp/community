import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, READ_TOKEN } from "./helpers";

const MOCK_COMMIT_SHA = "abc123def456789012345678901234567890abcd";
const MOCK_CHANGE_ID = "kxyz123456789abcdef";

const repoName = uniqueName("cli-commit-status");
const repoSlug = `${OWNER}/${repoName}`;

describe("CLI: Commit Status", () => {
  test("setup: create repo for commit status tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI commit-status e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub status create creates a commit status", async () => {
    const result = await cli(
      [
        "status", "create", MOCK_COMMIT_SHA,
        "--context", "ci/build",
        "--status", "pending",
        "--description", "Build is running",
        "--target-url", "https://ci.example.com/build/1",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      context: string;
      status: string;
      description: string;
      target_url: string;
      commit_sha: string;
      created_at: string;
      updated_at: string;
    }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.context).toBe("ci/build");
    expect(body.status).toBe("pending");
    expect(body.description).toBe("Build is running");
    expect(body.target_url).toBe("https://ci.example.com/build/1");
    expect(body.commit_sha).toBe(MOCK_COMMIT_SHA);
    expect(typeof body.created_at).toBe("string");
    expect(typeof body.updated_at).toBe("string");
  });

  test("jjhub status create supports all valid status values", async () => {
    const validStatuses = ["success", "failure", "error", "cancelled"];
    for (const status of validStatuses) {
      const result = await cli(
        [
          "status", "create", MOCK_COMMIT_SHA,
          "--context", `ci/${status}-test`,
          "--status", status,
          "--description", `Testing ${status}`,
        ],
        { repo: repoSlug, json: true },
      );

      const body = jsonParse<{ status: string }>(result);
      expect(body.status).toBe(status);
    }
  });

  test("jjhub status create rejects invalid status value", async () => {
    const result = await cli(
      [
        "status", "create", MOCK_COMMIT_SHA,
        "--context", "ci/bad",
        "--status", "invalid-status",
        "--description", "This should fail",
      ],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub status create fails without auth", async () => {
    const result = await cli(
      [
        "status", "create", MOCK_COMMIT_SHA,
        "--context", "ci/noauth",
        "--status", "success",
      ],
      { repo: repoSlug, token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub status create fails with read-only token", async () => {
    const result = await cli(
      [
        "status", "create", MOCK_COMMIT_SHA,
        "--context", "ci/readonly",
        "--status", "success",
      ],
      { repo: repoSlug, token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub status list returns statuses for a commit", async () => {
    const result = await cli(
      ["status", "list", MOCK_COMMIT_SHA],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{
      context: string;
      status: string;
      commit_sha: string;
    }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);

    // All returned statuses should have the correct commit_sha
    for (const status of body) {
      expect(status.commit_sha).toBe(MOCK_COMMIT_SHA);
    }
  });

  test("jjhub status list supports querying by change_id", async () => {
    // Create a status with a change_id
    const createResult = await cli(
      [
        "status", "create", MOCK_COMMIT_SHA,
        "--context", "ci/change-id-test",
        "--status", "success",
        "--description", "Test with change_id",
        "--change-id", MOCK_CHANGE_ID,
      ],
      { repo: repoSlug, json: true },
    );
    expect(createResult.exitCode).toBe(0);

    // Query by change_id
    const result = await cli(
      ["status", "list", MOCK_CHANGE_ID],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ context: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body.some((s) => s.context === "ci/change-id-test")).toBe(true);
  });

  test("jjhub status list shows multiple contexts per commit", async () => {
    const result = await cli(
      ["status", "list", MOCK_COMMIT_SHA],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ context: string }>>(result);
    expect(Array.isArray(body)).toBe(true);

    const contexts = body.map((s) => s.context);
    expect(contexts).toContain("ci/build");
    expect(contexts.length).toBeGreaterThanOrEqual(2);
  });

  test("jjhub status create on non-existent repo fails", async () => {
    const result = await cli(
      [
        "status", "create", MOCK_COMMIT_SHA,
        "--context", "ci/build",
        "--status", "success",
      ],
      { repo: `${OWNER}/nonexistent-repo-12345`, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("jjhub status list on non-existent repo fails", async () => {
    const result = await cli(
      ["status", "list", MOCK_COMMIT_SHA],
      { repo: `${OWNER}/nonexistent-repo-12345`, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
