import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, READ_TOKEN } from "./helpers";

describe("CLI: Landing Request Reviews", () => {
  const repoName = uniqueName("cli-lr-review");
  const repoSlug = `${OWNER}/${repoName}`;
  let lrNumber = 0;

  test("setup: create repo and landing request for review tests", async () => {
    const repoResult = await cli(
      ["repo", "create", repoName, "--description", "LR review e2e"],
      { json: true },
    );
    jsonParse(repoResult);

    const lrResult = await cli(
      [
        "lr", "create",
        "--title", "Feature for review",
        "--body", "Please review this change",
        "--target", "main",
        "--change-ids", "review123,review456",
      ],
      { repo: repoSlug, json: true },
    );

    const lr = jsonParse<{ number: number; state: string }>(lrResult);
    expect(lr.state).toBe("open");
    lrNumber = lr.number;
  });

  test("submit approval review on landing request", async () => {
    const result = await cli(
      [
        "lr", "review", String(lrNumber),
        "--action", "approve",
        "--body", "LGTM, ship it!",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      state: string;
      body: string;
    }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.state).toBe("approved");
    expect(body.body).toBe("LGTM, ship it!");
  });

  test("submit request-changes review on landing request", async () => {
    const result = await cli(
      [
        "lr", "review", String(lrNumber),
        "--action", "request-changes",
        "--body", "Please fix the failing test",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      state: string;
      body: string;
    }>(result);
    expect(body.state).toBe("changes_requested");
    expect(body.body).toBe("Please fix the failing test");
  });

  test("list reviews on landing request", async () => {
    const result = await cli(
      ["lr", "review", "list", String(lrNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{
      id: number;
      state: string;
      body: string;
    }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
  });

  test("dismiss a review on landing request", async () => {
    // First get reviews to find one to dismiss
    const listResult = await cli(
      ["lr", "review", "list", String(lrNumber)],
      { repo: repoSlug, json: true },
    );
    const reviews = jsonParse<Array<{ id: number }>>(listResult);
    expect(reviews.length).toBeGreaterThan(0);

    const result = await cli(
      [
        "lr", "review", "dismiss", String(lrNumber),
        "--review-id", String(reviews[0].id),
        "--message", "Dismissing stale review",
      ],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("review on nonexistent landing request fails", async () => {
    const result = await cli(
      [
        "lr", "review", "99999",
        "--action", "approve",
        "--body", "Should fail",
      ],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
