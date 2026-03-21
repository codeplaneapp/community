import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Bulk Operations", () => {
  const repoName = uniqueName("cli-bulk");
  const repoSlug = `${OWNER}/${repoName}`;
  const ISSUE_COUNT = 10;

  test("setup: create repo for bulk tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Bulk operations e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  test("create 10 issues in sequence", async () => {
    for (let i = 1; i <= ISSUE_COUNT; i++) {
      const result = await cli(
        ["issue", "create", "--title", `Bulk issue ${i}`, "--body", `Body for issue ${i}`],
        { repo: repoSlug, json: true },
      );

      const body = jsonParse<{ number: number; title: string }>(result);
      expect(body.number).toBe(i);
      expect(body.title).toBe(`Bulk issue ${i}`);
    }
  });

  test("list all issues returns correct count", async () => {
    const result = await cli(
      ["issue", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ number: number; title: string }>>(result);
    expect(body.length).toBe(ISSUE_COUNT);
  });

  test("list issues with per-page pagination", async () => {
    const page1 = await cli(
      ["issue", "list", "--per-page", "3", "--page", "1"],
      { repo: repoSlug, json: true },
    );

    const body1 = jsonParse<Array<{ number: number }>>(page1);
    expect(body1.length).toBe(3);

    const page2 = await cli(
      ["issue", "list", "--per-page", "3", "--page", "2"],
      { repo: repoSlug, json: true },
    );

    const body2 = jsonParse<Array<{ number: number }>>(page2);
    expect(body2.length).toBe(3);

    // Ensure no overlap between pages
    const page1Numbers = new Set(body1.map((i) => i.number));
    for (const issue of body2) {
      expect(page1Numbers.has(issue.number)).toBe(false);
    }
  });

  test("close multiple issues and verify state", async () => {
    // Close issues 1 through 5
    for (let i = 1; i <= 5; i++) {
      const result = await cli(
        ["issue", "close", String(i)],
        { repo: repoSlug, json: true },
      );
      const body = jsonParse<{ number: number; state: string }>(result);
      expect(body.state).toBe("closed");
    }

    // List only open issues
    const openResult = await cli(
      ["issue", "list", "--state", "open"],
      { repo: repoSlug, json: true },
    );
    const openIssues = jsonParse<Array<{ number: number; state: string }>>(openResult);
    expect(openIssues.length).toBe(5);
    for (const issue of openIssues) {
      expect(issue.state).toBe("open");
    }

    // List only closed issues
    const closedResult = await cli(
      ["issue", "list", "--state", "closed"],
      { repo: repoSlug, json: true },
    );
    const closedIssues = jsonParse<Array<{ number: number; state: string }>>(closedResult);
    expect(closedIssues.length).toBe(5);
    for (const issue of closedIssues) {
      expect(issue.state).toBe("closed");
    }
  });

  test("create multiple labels and assign to issue", async () => {
    const labels = ["bug", "enhancement", "documentation"];
    for (const label of labels) {
      await cli(
        ["label", "create", label, "--color", "0075ca"],
        { repo: repoSlug, json: true },
      );
    }

    // Assign all labels to issue 6
    for (const label of labels) {
      await cli(
        ["issue", "edit", "6", "--add-label", label],
        { repo: repoSlug, json: true },
      );
    }

    // Verify issue has all labels
    const viewResult = await cli(
      ["issue", "view", "6"],
      { repo: repoSlug, json: true },
    );
    const issue = jsonParse<{
      number: number;
      labels: Array<{ name: string }>;
    }>(viewResult);
    expect(issue.labels.length).toBe(3);
    for (const label of labels) {
      expect(issue.labels.some((l) => l.name === label)).toBe(true);
    }
  });
});
