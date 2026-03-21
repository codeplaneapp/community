import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Issues", () => {
  const repoName = uniqueName("cli-issues");
  const repoSlug = `${OWNER}/${repoName}`;
  let issueNumber = 0;

  test("setup: create repo for issue tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI issue e2e seed"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub issue create creates a new issue", async () => {
    const result = await cli(
      ["issue", "create", "--title", "First issue from CLI", "--body", "Issue body text"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; title: string; body: string; state: string }>(result);
    expect(body.number).toBe(1);
    expect(body.title).toBe("First issue from CLI");
    expect(body.body).toBe("Issue body text");
    expect(body.state).toBe("open");
    issueNumber = body.number;
  });

  test("jjhub issue list lists issues in the repo", async () => {
    const result = await cli(
      ["issue", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ number: number; title: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((i) => i.number === issueNumber)).toBe(true);
  });

  test("jjhub issue view shows a single issue", async () => {
    const result = await cli(
      ["issue", "view", String(issueNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; title: string; state: string }>(result);
    expect(body.number).toBe(issueNumber);
    expect(body.title).toBe("First issue from CLI");
    expect(body.state).toBe("open");
  });

  test("jjhub issue comment adds a comment", async () => {
    const result = await cli(
      ["issue", "comment", String(issueNumber), "--body", "CLI comment"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: number; body: string }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.body).toBe("CLI comment");
  });

  test("jjhub issue close closes the issue", async () => {
    const result = await cli(
      ["issue", "close", String(issueNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; state: string }>(result);
    expect(body.number).toBe(issueNumber);
    expect(body.state).toBe("closed");
  });
});
