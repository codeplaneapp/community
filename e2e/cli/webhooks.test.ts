import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Webhooks", () => {
  const repoName = uniqueName("cli-webhooks");
  const repoSlug = `${OWNER}/${repoName}`;
  let hookID = 0;

  test("setup: create repo for webhook tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI webhooks e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane webhook create creates a webhook", async () => {
    const result = await cli(
      [
        "webhook", "create",
        "--url", "https://example.com/cli-hook",
        "--secret", "cli-test-secret",
        "--events", "push",
        "--active",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      url: string;
      events: string[];
      is_active: boolean;
      secret: string;
    }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.url).toBe("https://example.com/cli-hook");
    expect(body.events).toContain("push");
    expect(body.is_active).toBe(true);
    expect(body.secret).toBe("********");
    hookID = body.id;
  });

  test("codeplane webhook list lists webhooks", async () => {
    const result = await cli(
      ["webhook", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ id: number; url: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((h) => h.id === hookID)).toBe(true);
  });

  test("codeplane webhook delete removes a webhook", async () => {
    const result = await cli(
      ["webhook", "delete", String(hookID), "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["webhook", "list"],
      { repo: repoSlug, json: true },
    );
    if (listResult.exitCode === 0) {
      const hooks = JSON.parse(listResult.stdout) as Array<{ id: number }>;
      expect(hooks.some((h) => h.id === hookID)).toBe(false);
    }
  });
});
