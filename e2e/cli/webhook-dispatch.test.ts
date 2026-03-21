import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Webhook Event Dispatch", () => {
  const repoName = uniqueName("cli-webhook-dispatch");
  const repoSlug = `${OWNER}/${repoName}`;
  let hookID = 0;

  test("setup: create repo for webhook dispatch tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI webhook dispatch e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("jjhub webhook create creates a webhook for issues and issue_comment events", async () => {
    const result = await cli(
      [
        "webhook", "create",
        "--url", "https://example.com/cli-dispatch-hook",
        "--events", "issues",
        "--events", "issue_comment",
        "--active",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      url: string;
      events: string[];
      is_active: boolean;
    }>(result);
    expect(typeof body.id).toBe("number");
    hookID = body.id;
  });

  test("creating an issue triggers webhook dispatch", async () => {
    // Create an issue to trigger the 'issues' event
    const issueResult = await cli(
      ["issue", "create", "--title", "Webhook dispatch test issue"],
      { repo: repoSlug, json: true },
    );
    expect(issueResult.exitCode).toBe(0);

    // Check delivery history via webhook deliveries command
    const deliveryResult = await cli(
      ["webhook", "deliveries", String(hookID)],
      { repo: repoSlug, json: true },
    );

    expect(deliveryResult.exitCode).toBe(0);
    const deliveries = JSON.parse(deliveryResult.stdout) as Array<{ event_type: string }>;
    expect(Array.isArray(deliveries)).toBe(true);
    expect(deliveries.length).toBeGreaterThanOrEqual(1);
    const issueDel = deliveries.find((d) => d.event_type === "issues");
    expect(issueDel).toBeDefined();
  });

  test("jjhub webhook view shows webhook details and deliveries", async () => {
    const result = await cli(
      ["webhook", "view", String(hookID)],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      hook: { id: number };
      deliveries: Array<{ event_type: string }>;
    }>(result);
    expect(body.hook.id).toBe(hookID);
    expect(Array.isArray(body.deliveries)).toBe(true);
  });

  test("delivery history requires auth", async () => {
    const result = await cli(
      ["webhook", "deliveries", String(hookID)],
      { repo: repoSlug, json: true, token: "" },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("cleanup: delete webhook", async () => {
    const result = await cli(
      ["webhook", "delete", String(hookID), "--yes"],
      { repo: repoSlug, json: true },
    );
    expect(result.exitCode).toBe(0);
  });
});
