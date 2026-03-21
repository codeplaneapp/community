import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Labels and Milestones", () => {
  const repoName = uniqueName("cli-labels-ms");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for label/milestone tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI labels-milestones e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub label create creates a label", async () => {
    const result = await cli(
      ["label", "create", "bug", "--color", "d73a4a", "--description", "Something is broken"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: number; name: string; color: string; description: string }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.name).toBe("bug");
    expect(body.color).toBe("#d73a4a");
    expect(body.description).toBe("Something is broken");
  });

  test("jjhub label list returns labels", async () => {
    const result = await cli(
      ["label", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ name: string; color: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((l) => l.name === "bug")).toBe(true);
  });

  test("jjhub milestone create creates a milestone", async () => {
    const result = await cli(
      ["milestone", "create", "v1.0", "--description", "First release"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: number; title: string; state: string; description: string }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.title).toBe("v1.0");
    expect(body.state).toBe("open");
    expect(body.description).toBe("First release");
  });

  test("jjhub milestone list returns milestones", async () => {
    const result = await cli(
      ["milestone", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ title: string; state: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((m) => m.title === "v1.0")).toBe(true);
  });
});
