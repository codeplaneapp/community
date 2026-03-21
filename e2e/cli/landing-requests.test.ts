import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Landing Requests", () => {
  const repoName = uniqueName("cli-landings");
  const repoSlug = `${OWNER}/${repoName}`;
  let landingNumber = 0;

  test("setup: create repo for landing request tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI landings e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane lr create creates a landing request", async () => {
    const result = await cli(
      [
        "lr", "create",
        "--title", "Add feature from CLI",
        "--body", "Landing request body",
        "--target", "main",
        "--change-ids", "abc123,def456",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      number: number;
      title: string;
      state: string;
      target_bookmark: string;
      change_ids: string[];
    }>(result);
    expect(typeof body.number).toBe("number");
    expect(body.title).toBe("Add feature from CLI");
    expect(body.state).toBe("open");
    expect(body.target_bookmark).toBe("main");
    expect(body.change_ids).toEqual(["abc123", "def456"]);
    landingNumber = body.number;
  });

  test("codeplane lr list lists landing requests", async () => {
    const result = await cli(
      ["lr", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ number: number; title: string; state: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((lr) => lr.number === landingNumber)).toBe(true);
  });

  test("codeplane lr view shows a single landing request", async () => {
    const result = await cli(
      ["lr", "view", String(landingNumber)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      number: number;
      title: string;
      state: string;
      target_bookmark: string;
    }>(result);
    expect(body.number).toBe(landingNumber);
    expect(body.title).toBe("Add feature from CLI");
    expect(body.state).toBe("open");
    expect(body.target_bookmark).toBe("main");
  });
});
