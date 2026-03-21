import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Repo Settings", () => {
  const repoName = uniqueName("cli-repo-settings");
  const repoSlug = `${OWNER}/${repoName}`;

  test("setup: create repo for settings tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI repo settings e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string; description: string }>(result);
    expect(body.name).toBe(repoName);
    expect(body.description).toBe("CLI repo settings e2e");
  });

  test("codeplane repo edit updates description", async () => {
    const newDescription = "Updated description via CLI";
    const result = await cli(
      ["repo", "edit", repoSlug, "--description", newDescription],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.description).toBe(newDescription);
  });

  test("codeplane repo view confirms updated description", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ description: string }>(result);
    expect(body.description).toBe("Updated description via CLI");
  });

  test("codeplane repo edit can update visibility to private", async () => {
    const result = await cli(
      ["repo", "edit", repoSlug, "--private"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.private).toBe(true);
  });

  test("codeplane repo edit can update visibility back to public", async () => {
    const result = await cli(
      ["repo", "edit", repoSlug, "--no-private"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.private).toBe(false);
  });

  test("codeplane repo archive archives the repository", async () => {
    const result = await cli(
      ["repo", "archive", repoSlug],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.status).toBe("archived");
  });

  test("codeplane repo view confirms archived state", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ archived: boolean }>(result);
    expect(body.archived).toBe(true);
  });

  test("codeplane repo unarchive unarchives the repository", async () => {
    const result = await cli(
      ["repo", "unarchive", repoSlug],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.status).toBe("unarchived");
  });

  test("codeplane repo view confirms unarchived state", async () => {
    const result = await cli(
      ["repo", "view"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ archived: boolean }>(result);
    expect(body.archived).toBe(false);
  });

  test("codeplane repo star stars the repository", async () => {
    const result = await cli(
      ["repo", "star", repoSlug],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.status).toBe("starred");
  });

  test("codeplane repo unstar unstars the repository", async () => {
    const result = await cli(
      ["repo", "unstar", repoSlug],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.status).toBe("unstarred");
  });

  test("codeplane repo edit updates name", async () => {
    const newName = uniqueName("cli-repo-renamed");
    const result = await cli(
      ["repo", "edit", repoSlug, "--name", newName],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.name).toBe(newName);
  });
});
