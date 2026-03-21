import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Issue Full Lifecycle", () => {
  const repoName = uniqueName("cli-issue-life");
  const repoSlug = `${OWNER}/${repoName}`;
  let issueNumber = 0;
  let labelId = 0;

  test("setup: create repo and label for lifecycle tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Issue lifecycle e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);

    const labelResult = await cli(
      ["label", "create", "priority-high", "--color", "e11d48", "--description", "High priority"],
      { repo: repoSlug, json: true },
    );
    const label = jsonParse<{ id: number; name: string }>(labelResult);
    expect(label.name).toBe("priority-high");
    labelId = label.id;
  });

  test("create issue with title and body", async () => {
    const result = await cli(
      ["issue", "create", "--title", "Lifecycle test issue", "--body", "This issue tests the full lifecycle"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; title: string; state: string; body: string }>(result);
    expect(body.title).toBe("Lifecycle test issue");
    expect(body.state).toBe("open");
    expect(body.body).toBe("This issue tests the full lifecycle");
    issueNumber = body.number;
  });

  test("assign issue to user", async () => {
    const result = await cli(
      ["issue", "edit", String(issueNumber), "--add-assignee", OWNER],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; assignees: Array<{ username: string }> }>(result);
    expect(body.number).toBe(issueNumber);
    expect(body.assignees.some((a) => a.username === OWNER)).toBe(true);
  });

  test("add label to issue", async () => {
    const result = await cli(
      ["issue", "edit", String(issueNumber), "--add-label", "priority-high"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; labels: Array<{ name: string }> }>(result);
    expect(body.labels.some((l) => l.name === "priority-high")).toBe(true);
  });

  test("add multiple comments to issue", async () => {
    const comment1 = await cli(
      ["issue", "comment", String(issueNumber), "--body", "Investigation started"],
      { repo: repoSlug, json: true },
    );
    const c1 = jsonParse<{ id: number; body: string }>(comment1);
    expect(c1.body).toBe("Investigation started");

    const comment2 = await cli(
      ["issue", "comment", String(issueNumber), "--body", "Root cause identified"],
      { repo: repoSlug, json: true },
    );
    const c2 = jsonParse<{ id: number; body: string }>(comment2);
    expect(c2.body).toBe("Root cause identified");
    expect(c2.id).not.toBe(c1.id);
  });

  test("close issue", async () => {
    const result = await cli(
      ["issue", "close", String(issueNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; state: string }>(result);
    expect(body.state).toBe("closed");
  });

  test("reopen issue", async () => {
    const result = await cli(
      ["issue", "reopen", String(issueNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; state: string }>(result);
    expect(body.state).toBe("open");
  });

  test("view issue shows full state after lifecycle", async () => {
    const result = await cli(
      ["issue", "view", String(issueNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      number: number;
      title: string;
      state: string;
      labels: Array<{ name: string }>;
      assignees: Array<{ username: string }>;
    }>(result);
    expect(body.number).toBe(issueNumber);
    expect(body.state).toBe("open");
    expect(body.labels.some((l) => l.name === "priority-high")).toBe(true);
    expect(body.assignees.some((a) => a.username === OWNER)).toBe(true);
  });
});
