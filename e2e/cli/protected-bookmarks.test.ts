import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Protected Bookmarks", () => {
  const repoName = uniqueName("cli-prot-bkmk");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for bookmark protection tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Protected bookmarks e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  test("create bookmark protection rule", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/bookmark-protections`,
        "--method", "POST",
        "-f", "pattern=main",
        "-f", "require_approvals=1",
        "-f", "dismiss_stale_reviews=true",
        "-f", "require_status_checks=true",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as {
      id: number;
      pattern: string;
      require_approvals: number;
      dismiss_stale_reviews: boolean;
      require_status_checks: boolean;
    };
    expect(typeof body.id).toBe("number");
    expect(body.pattern).toBe("main");
    expect(body.require_approvals).toBe(1);
    expect(body.dismiss_stale_reviews).toBe(true);
    expect(body.require_status_checks).toBe(true);
  });

  test("list bookmark protection rules", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/bookmark-protections`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{
      pattern: string;
      require_approvals: number;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p) => p.pattern === "main")).toBe(true);
  });

  test("create wildcard protection rule", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/bookmark-protections`,
        "--method", "POST",
        "-f", "pattern=release/*",
        "-f", "require_approvals=2",
        "-f", "block_force_push=true",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as {
      pattern: string;
      require_approvals: number;
      block_force_push: boolean;
    };
    expect(body.pattern).toBe("release/*");
    expect(body.require_approvals).toBe(2);
    expect(body.block_force_push).toBe(true);
  });

  test("update bookmark protection rule", async () => {
    // Get existing rules
    const listResult = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/bookmark-protections`],
      { json: true },
    );
    const rules = JSON.parse(listResult.stdout) as Array<{ id: number; pattern: string }>;
    const mainRule = rules.find((r) => r.pattern === "main");
    expect(mainRule).toBeDefined();

    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/bookmark-protections/${mainRule!.id}`,
        "--method", "PATCH",
        "-f", "require_approvals=2",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { require_approvals: number };
    expect(body.require_approvals).toBe(2);
  });

  test("delete bookmark protection rule", async () => {
    const listResult = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/bookmark-protections`],
      { json: true },
    );
    const rules = JSON.parse(listResult.stdout) as Array<{ id: number; pattern: string }>;
    const releaseRule = rules.find((r) => r.pattern === "release/*");
    expect(releaseRule).toBeDefined();

    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/bookmark-protections/${releaseRule!.id}`,
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
  });
});
