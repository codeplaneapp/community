import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Pinned Issues", () => {
  const repoName = uniqueName("cli-pinned");
  const repoSlug = `${OWNER}/${repoName}`;
  let issue1 = 0;
  let issue2 = 0;
  let issue3 = 0;

  test("setup: create repo and issues for pin tests", async () => {
    await cli(
      ["repo", "create", repoName, "--description", "Pinned issues e2e"],
      { json: true },
    );

    const r1 = await cli(
      ["issue", "create", "--title", "Bug report - critical", "--body", "Pin this"],
      { repo: repoSlug, json: true },
    );
    issue1 = jsonParse<{ number: number }>(r1).number;

    const r2 = await cli(
      ["issue", "create", "--title", "Feature request - important", "--body", "Pin this too"],
      { repo: repoSlug, json: true },
    );
    issue2 = jsonParse<{ number: number }>(r2).number;

    const r3 = await cli(
      ["issue", "create", "--title", "Discussion thread", "--body", "Maybe pin"],
      { repo: repoSlug, json: true },
    );
    issue3 = jsonParse<{ number: number }>(r3).number;
  });

  test("pin an issue", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/${issue1}/pin`,
        "--method", "POST",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("pin a second issue", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/${issue2}/pin`,
        "--method", "POST",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("list pinned issues returns pinned items", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/issues/pinned`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ number: number; title: string; pinned: boolean }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.some((i) => i.number === issue1)).toBe(true);
    expect(body.some((i) => i.number === issue2)).toBe(true);
    // Unpinned issue should not appear
    expect(body.some((i) => i.number === issue3)).toBe(false);
  });

  test("unpin an issue", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/issues/${issue1}/unpin`,
        "--method", "POST",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("list pinned after unpin shows only remaining pinned", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/issues/pinned`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ number: number }>;
    expect(body.some((i) => i.number === issue1)).toBe(false);
    expect(body.some((i) => i.number === issue2)).toBe(true);
  });
});
