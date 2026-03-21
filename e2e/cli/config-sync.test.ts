import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Config Sync (.jjhub/config.yml)", () => {
  const repoName = uniqueName("cli-config-sync");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for config sync tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Config sync e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  test("push config to update repo settings", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/config`,
        "--method", "PUT",
        "-f", "landing_queue_strategy=serialized",
        "-f", "auto_delete_bookmark_on_land=true",
        "-f", "require_approval_count=1",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.landing_queue_strategy).toBe("serialized");
    expect(body.auto_delete_bookmark_on_land).toBe(true);
    expect(body.require_approval_count).toBe(1);
  });

  test("get config returns current repo settings", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/config`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.landing_queue_strategy).toBe("serialized");
    expect(body.auto_delete_bookmark_on_land).toBe(true);
  });

  test("update config to parallel strategy", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/config`,
        "--method", "PUT",
        "-f", "landing_queue_strategy=parallel",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.landing_queue_strategy).toBe("parallel");
  });

  test("invalid config value is rejected", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/config`,
        "--method", "PUT",
        "-f", "landing_queue_strategy=invalid_strategy",
      ],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("config endpoint requires repo write permission", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/config`,
        "--method", "PUT",
        "-f", "landing_queue_strategy=serialized",
      ],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
