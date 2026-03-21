import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Search", () => {
  const repoName = uniqueName("cli-search");
  const searchTerm = `clisearchterm${Date.now()}`;

  test("setup: create repo with searchable description", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", `searchable ${searchTerm}`],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane search repos finds repositories", async () => {
    const result = await cli(
      ["search", "repos", searchTerm],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ name: string }> }>(result);
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((r) => r.name === repoName)).toBe(true);
  });

  test("codeplane search issues finds issues", async () => {
    // Create an issue first
    const repoSlug = `${OWNER}/${repoName}`;
    await cli(
      ["issue", "create", "--title", `${searchTerm} bug`, "--body", "searchable issue"],
      { repo: repoSlug, json: true },
    );

    const result = await cli(
      ["search", "issues", searchTerm],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ title: string }> }>(result);
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((i) => i.title.includes(searchTerm))).toBe(true);
  });

  test("codeplane search users finds users", async () => {
    const result = await cli(
      ["search", "users", "alice"],
      { json: true },
    );

    const body = jsonParse<{ items: Array<{ username: string }> }>(result);
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.some((u) => u.username === "alice")).toBe(true);
  });
});
