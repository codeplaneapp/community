import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Reactions", () => {
  const repoName = uniqueName("cli-reactions");
  const repoSlug = `${OWNER}/${repoName}`;
  let issueNumber = 0;
  let commentId = 0;

  test("setup: create repo, issue, and comment for reaction tests", async () => {
    await cli(
      ["repo", "create", repoName, "--description", "Reactions e2e"],
      { json: true },
    );

    const issueResult = await cli(
      ["issue", "create", "--title", "Reaction target", "--body", "React to this"],
      { repo: repoSlug, json: true },
    );
    issueNumber = jsonParse<{ number: number }>(issueResult).number;

    const commentResult = await cli(
      ["issue", "comment", String(issueNumber), "--body", "Comment to react to"],
      { repo: repoSlug, json: true },
    );
    commentId = jsonParse<{ id: number }>(commentResult).id;
  });

  test("add reaction to issue", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/${issueNumber}/reactions`,
        "--method", "POST",
        "-f", "reaction=thumbs_up",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as {
      id: number;
      reaction: string;
      user: { username: string };
    };
    expect(body.reaction).toBe("thumbs_up");
    expect(body.user.username).toBe(OWNER);
  });

  test("add different reaction to same issue", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/${issueNumber}/reactions`,
        "--method", "POST",
        "-f", "reaction=heart",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { reaction: string };
    expect(body.reaction).toBe("heart");
  });

  test("list reactions on issue", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/issues/${issueNumber}/reactions`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ reaction: string; user: { username: string } }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.some((r) => r.reaction === "thumbs_up")).toBe(true);
    expect(body.some((r) => r.reaction === "heart")).toBe(true);
  });

  test("remove reaction from issue", async () => {
    // Get reactions to find the ID
    const listResult = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/issues/${issueNumber}/reactions`],
      { json: true },
    );
    const reactions = JSON.parse(listResult.stdout) as Array<{ id: number; reaction: string }>;
    const thumbsUp = reactions.find((r) => r.reaction === "thumbs_up");
    expect(thumbsUp).toBeDefined();

    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/${issueNumber}/reactions/${thumbsUp!.id}`,
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("add reaction to comment", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/comments/${commentId}/reactions`,
        "--method", "POST",
        "-f", "reaction=rocket",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { reaction: string };
    expect(body.reaction).toBe("rocket");
  });
});
