import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Multi-Repo Search", () => {
  const searchTag = `msearch${Date.now()}`;
  const repo1Name = uniqueName("cli-search-alpha");
  const repo2Name = uniqueName("cli-search-beta");
  const repo3Name = uniqueName("cli-search-gamma");

  test("setup: create three repos with distinct descriptions", async () => {
    const r1 = await cli(
      ["repo", "create", repo1Name, "--description", `${searchTag} alpha web framework`],
      { json: true },
    );
    jsonParse(r1);

    const r2 = await cli(
      ["repo", "create", repo2Name, "--description", `${searchTag} beta CLI tooling`],
      { json: true },
    );
    jsonParse(r2);

    const r3 = await cli(
      ["repo", "create", repo3Name, "--description", `${searchTag} gamma database driver`],
      { json: true },
    );
    jsonParse(r3);
  });

  test("search repos by shared tag returns all three", async () => {
    const result = await cli(
      ["search", "repos", searchTag],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ name: string; description: string }> }>(result);
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    expect(body.items.some((r) => r.name === repo1Name)).toBe(true);
    expect(body.items.some((r) => r.name === repo2Name)).toBe(true);
    expect(body.items.some((r) => r.name === repo3Name)).toBe(true);
  });

  test("search repos by specific keyword narrows results", async () => {
    const result = await cli(
      ["search", "repos", `${searchTag} CLI`],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ name: string }> }>(result);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    // The beta repo with "CLI tooling" should rank highest
    expect(body.items.some((r) => r.name === repo2Name)).toBe(true);
  });

  test("search issues across repos", async () => {
    const issueTag = `issuesearch${Date.now()}`;

    // Create issues in different repos
    await cli(
      ["issue", "create", "--title", `${issueTag} bug in alpha`, "--body", "Alpha bug"],
      { repo: `${OWNER}/${repo1Name}`, json: true },
    );

    await cli(
      ["issue", "create", "--title", `${issueTag} feature for beta`, "--body", "Beta feature"],
      { repo: `${OWNER}/${repo2Name}`, json: true },
    );

    const result = await cli(
      ["search", "issues", issueTag],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ title: string }> }>(result);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    expect(body.items.some((i) => i.title.includes("alpha"))).toBe(true);
    expect(body.items.some((i) => i.title.includes("beta"))).toBe(true);
  });

  test("search with no results returns empty items", async () => {
    const result = await cli(
      ["search", "repos", `nonexistent-${Date.now()}-${Math.random()}`],
      { json: true },
    );

    const body = jsonParse<{ items: Array<unknown> }>(result);
    expect(body.items).toEqual([]);
  });

  test("search repos with pagination", async () => {
    const result = await cli(
      ["search", "repos", searchTag, "--per-page", "2", "--page", "1"],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ name: string }> }>(result);
    expect(body.items.length).toBeLessThanOrEqual(2);
  });
});
