import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Workflow Cache", () => {
  const repoName = uniqueName("cli-wf-cache");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for cache tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI workflow cache e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub cache list returns empty list for new repo", async () => {
    const result = await cli(
      ["cache", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  test("jjhub cache stats returns statistics for repo", async () => {
    const result = await cli(
      ["cache", "stats"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(typeof body.cache_count).toBe("number");
    expect(typeof body.total_size_bytes).toBe("number");
    expect(Number(body.repo_quota_bytes)).toBeGreaterThan(0);
    expect(Number(body.ttl_seconds)).toBeGreaterThan(0);
  });

  test("jjhub cache list supports bookmark filter", async () => {
    const result = await cli(
      ["cache", "list", "--bookmark", "main"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
  });

  test("jjhub cache list supports key filter", async () => {
    const result = await cli(
      ["cache", "list", "--key", "npm"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(Array.isArray(body)).toBe(true);
  });

  test("jjhub cache clear on empty repo returns zero deleted", async () => {
    const result = await cli(
      ["cache", "clear"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.deleted_count).toBe(0);
    expect(body.deleted_bytes).toBe(0);
  });

  test("jjhub cache clear supports bookmark and key filters", async () => {
    const result = await cli(
      ["cache", "clear", "--bookmark", "main", "--key", "npm"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(typeof body.deleted_count).toBe("number");
    expect(typeof body.deleted_bytes).toBe("number");
  });
});
