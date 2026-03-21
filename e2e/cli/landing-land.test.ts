import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Landing Request Land (Merge)", () => {
  const repoName = uniqueName("cli-lr-land");
  const repoSlug = `${OWNER}/${repoName}`;
  let lrNumber = 0;

  test("setup: create repo for landing tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "LR land e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  test("create landing request for landing", async () => {
    const result = await cli(
      [
        "lr", "create",
        "--title", "Ready to land",
        "--body", "This LR will be landed",
        "--target", "main",
        "--change-ids", "land111,land222",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; state: string }>(result);
    expect(body.state).toBe("open");
    lrNumber = body.number;
  });

  test("approve the landing request", async () => {
    const result = await cli(
      [
        "lr", "review", String(lrNumber),
        "--action", "approve",
        "--body", "Approved for landing",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ state: string }>(result);
    expect(body.state).toBe("approved");
  });

  test("land the landing request", async () => {
    const result = await cli(
      ["lr", "land", String(lrNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ number: number; state: string }>(result);
    expect(body.number).toBe(lrNumber);
    expect(body.state).toBe("landed");
  });

  test("view landed LR shows merged state", async () => {
    const result = await cli(
      ["lr", "view", String(lrNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      number: number;
      state: string;
      landed_at: string;
    }>(result);
    expect(body.state).toBe("landed");
    expect(typeof body.landed_at).toBe("string");
  });

  test("landing an already-landed LR fails", async () => {
    const result = await cli(
      ["lr", "land", String(lrNumber)],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("lr list with state filter shows only landed", async () => {
    const result = await cli(
      ["lr", "list", "--state", "landed"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ number: number; state: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    for (const lr of body) {
      expect(lr.state).toBe("landed");
    }
    expect(body.some((lr) => lr.number === lrNumber)).toBe(true);
  });
});
