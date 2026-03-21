import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Variables", () => {
  const repoName = uniqueName("cli-variables");
  const repoSlug = `${OWNER}/${repoName}`;
  const varName = "MY_VARIABLE";
  const varValue = "cli-test-value";

  test("setup: create repo for variable tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI variables e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane variable list returns empty list for new repo", async () => {
    const result = await cli(
      ["variable", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });

  test("codeplane variable set creates a variable", async () => {
    const result = await cli(
      ["variable", "set", varName, "--body", varValue],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
  });

  test("codeplane variable list shows the created variable", async () => {
    const result = await cli(
      ["variable", "list"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ name: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((v) => v.name === varName)).toBe(true);
  });

  test("codeplane variable get retrieves the variable", async () => {
    const result = await cli(
      ["variable", "get", varName],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(body.name).toBe(varName);
    expect(body.value).toBe(varValue);
  });

  test("codeplane variable set updates an existing variable", async () => {
    const newValue = "updated-cli-value";
    const result = await cli(
      ["variable", "set", varName, "--body", newValue],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify the update
    const getResult = await cli(
      ["variable", "get", varName],
      { repo: repoSlug, json: true },
    );
    expect(getResult.exitCode).toBe(0);
    const body = JSON.parse(getResult.stdout) as Record<string, unknown>;
    expect(body.value).toBe(newValue);
  });

  test("codeplane variable delete removes the variable", async () => {
    const result = await cli(
      ["variable", "delete", varName],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["variable", "list"],
      { repo: repoSlug, json: true },
    );
    if (listResult.exitCode === 0) {
      const vars = JSON.parse(listResult.stdout) as Array<{ name: string }>;
      expect(vars.some((v) => v.name === varName)).toBe(false);
    }
  });

  test("codeplane variable get returns error for non-existent variable", async () => {
    const result = await cli(
      ["variable", "get", "DOES_NOT_EXIST"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane variable delete on non-existent variable fails gracefully", async () => {
    const result = await cli(
      ["variable", "delete", "DOES_NOT_EXIST"],
      { repo: repoSlug, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("multiple variables can coexist", async () => {
    // Set two variables
    await cli(
      ["variable", "set", "VAR_A", "--body", "value-a"],
      { repo: repoSlug, json: true },
    );
    await cli(
      ["variable", "set", "VAR_B", "--body", "value-b"],
      { repo: repoSlug, json: true },
    );

    // List should show both
    const result = await cli(
      ["variable", "list"],
      { repo: repoSlug, json: true },
    );
    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ name: string }>;
    expect(body.some((v) => v.name === "VAR_A")).toBe(true);
    expect(body.some((v) => v.name === "VAR_B")).toBe(true);

    // Cleanup
    await cli(["variable", "delete", "VAR_A"], { repo: repoSlug, json: true });
    await cli(["variable", "delete", "VAR_B"], { repo: repoSlug, json: true });
  });
});
