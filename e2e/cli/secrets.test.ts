import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Secrets", () => {
  const repoName = uniqueName("cli-secrets");
  const repoSlug = `${OWNER}/${repoName}`;
  const secretName = "MY_API_KEY";

  test("setup: create repo for secret tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI secrets e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub secret set creates or updates a secret", async () => {
    const result = await cli(
      ["secret", "set", secretName, "--value", "super-secret-value"],
      { repo: repoSlug, json: true },
    );

    // Secret set should succeed; the value is never returned
    expect(result.exitCode).toBe(0);
  });

  test("jjhub secret list lists secrets (names only, no values)", async () => {
    const result = await cli(
      ["secret", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ name: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((s) => s.name === secretName)).toBe(true);

    // Ensure values are never exposed
    for (const secret of body) {
      expect((secret as Record<string, unknown>).value).toBeUndefined();
    }
  });

  test("jjhub secret delete removes a secret", async () => {
    const result = await cli(
      ["secret", "delete", secretName, "--yes"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["secret", "list"],
      { repo: repoSlug, json: true },
    );
    if (listResult.exitCode === 0) {
      const secrets = JSON.parse(listResult.stdout) as Array<{ name: string }>;
      expect(secrets.some((s) => s.name === secretName)).toBe(false);
    }
  });
});
