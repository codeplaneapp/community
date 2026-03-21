import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Wiki", () => {
  const repoName = uniqueName("cli-wiki");
  const repoSlug = `${OWNER}/${repoName}`;
  const pageTitle = "Home";

  test("setup: create repo for wiki tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI wiki e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub wiki create creates a wiki page", async () => {
    const result = await cli(
      ["wiki", "create", pageTitle, "--content", "# Welcome\n\nThis is the home page."],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ title: string; content: string }>(result);
    expect(body.title).toBe(pageTitle);
    expect(body.content).toContain("Welcome");
  });

  test("jjhub wiki list lists wiki pages", async () => {
    const result = await cli(
      ["wiki", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ title: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p) => p.title === pageTitle)).toBe(true);
  });

  test("jjhub wiki view shows a wiki page", async () => {
    const result = await cli(
      ["wiki", "view", pageTitle],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ title: string; content: string }>(result);
    expect(body.title).toBe(pageTitle);
    expect(body.content).toContain("Welcome");
  });

  test("jjhub wiki delete removes a wiki page", async () => {
    const result = await cli(
      ["wiki", "delete", pageTitle, "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify the page is gone
    const viewResult = await cli(
      ["wiki", "view", pageTitle],
      { repo: repoSlug, json: true },
    );
    expect(viewResult.exitCode).not.toBe(0);
  });
});
