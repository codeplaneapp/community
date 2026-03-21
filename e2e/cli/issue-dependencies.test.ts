import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Issue Dependencies", () => {
  const repoName = uniqueName("cli-issue-deps");
  const repoSlug = `${OWNER}/${repoName}`;
  let parentIssue = 0;
  let childIssue1 = 0;
  let childIssue2 = 0;

  test("setup: create repo and issues for dependency tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Issue dependency e2e"],
      { json: true },
    );
    jsonParse(result);

    const parent = await cli(
      ["issue", "create", "--title", "Parent task", "--body", "This is the parent"],
      { repo: repoSlug, json: true },
    );
    parentIssue = jsonParse<{ number: number }>(parent).number;

    const child1 = await cli(
      ["issue", "create", "--title", "Child task 1", "--body", "First subtask"],
      { repo: repoSlug, json: true },
    );
    childIssue1 = jsonParse<{ number: number }>(child1).number;

    const child2 = await cli(
      ["issue", "create", "--title", "Child task 2", "--body", "Second subtask"],
      { repo: repoSlug, json: true },
    );
    childIssue2 = jsonParse<{ number: number }>(child2).number;
  });

  test("add dependency: child blocks parent", async () => {
    const result = await cli(
      ["issue", "dependency", "add", String(parentIssue), "--blocked-by", String(childIssue1)],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("add second dependency to parent", async () => {
    const result = await cli(
      ["issue", "dependency", "add", String(parentIssue), "--blocked-by", String(childIssue2)],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("list dependencies shows blockers", async () => {
    const result = await cli(
      ["issue", "dependency", "list", String(parentIssue)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      blocked_by: Array<{ number: number; title: string }>;
    }>(result);
    expect(body.blocked_by.length).toBeGreaterThanOrEqual(2);
    expect(body.blocked_by.some((d) => d.number === childIssue1)).toBe(true);
    expect(body.blocked_by.some((d) => d.number === childIssue2)).toBe(true);
  });

  test("remove dependency removes the relationship", async () => {
    const result = await cli(
      ["issue", "dependency", "remove", String(parentIssue), "--blocked-by", String(childIssue2)],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify only one dependency remains
    const listResult = await cli(
      ["issue", "dependency", "list", String(parentIssue)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      blocked_by: Array<{ number: number }>;
    }>(listResult);
    expect(body.blocked_by.some((d) => d.number === childIssue1)).toBe(true);
    expect(body.blocked_by.some((d) => d.number === childIssue2)).toBe(false);
  });

  test("adding self-dependency fails", async () => {
    const result = await cli(
      ["issue", "dependency", "add", String(parentIssue), "--blocked-by", String(parentIssue)],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
