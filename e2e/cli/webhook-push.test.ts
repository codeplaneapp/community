import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER, API_URL } from "./helpers";

const INTERNAL_TOKEN =
  process.env.CODEPLANE_REPO_HOST_AUTH_TOKEN ??
  process.env.REPO_HOST_AUTH_TOKEN ??
  process.env.CODEPLANE_AGENT_TOKEN ??
  "codeplane-repo-host-dev-token";

describe("CLI: Webhook Push Event Dispatch", () => {
  const repoName = uniqueName("cli-webhook-push");
  const repoSlug = `${OWNER}/${repoName}`;
  let hookID = 0;

  test("setup: create repo for push webhook tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI webhook push e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane webhook create subscribes to push events", async () => {
    const result = await cli(
      [
        "webhook", "create",
        "--url", "https://example.com/cli-push-hook",
        "--events", "push",
        "--active",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{ id: number; events: string[] }>(result);
    expect(typeof body.id).toBe("number");
    expect(body.events).toContain("push");
    hookID = body.id;
  });

  test("internal push-events endpoint creates delivery for push events", async () => {
    // Call the internal push-events endpoint directly (simulating repo-host)
    const internalUrl = API_URL.replace(/\/api$/, "").replace(/\/$/, "");
    const pushEventRes = await fetch(
      `${internalUrl}/internal/repo-host/push-events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
        },
        body: JSON.stringify({
          owner: OWNER,
          repo: repoName,
          ref_name: "refs/heads/main",
          pusher_id: 1,
          pusher_login: OWNER,
        }),
      },
    );

    expect(pushEventRes.status).toBe(204);

    // Verify delivery via CLI
    const deliveryResult = await cli(
      ["webhook", "deliveries", String(hookID)],
      { repo: repoSlug, json: true },
    );

    expect(deliveryResult.exitCode).toBe(0);
    const deliveries = JSON.parse(deliveryResult.stdout) as Array<{ event_type: string }>;
    expect(Array.isArray(deliveries)).toBe(true);
    const pushDel = deliveries.find((d) => d.event_type === "push");
    expect(pushDel).toBeDefined();
  });

  test("push event dispatch returns 404 for non-existent repo", async () => {
    const internalUrl = API_URL.replace(/\/api$/, "").replace(/\/$/, "");
    const pushEventRes = await fetch(
      `${internalUrl}/internal/repo-host/push-events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
        },
        body: JSON.stringify({
          owner: "nonexistent",
          repo: "nonexistent-repo",
          ref_name: "refs/heads/main",
          pusher_id: 1,
          pusher_login: "alice",
        }),
      },
    );

    expect(pushEventRes.status).toBe(404);
  });

  test("push event dispatch returns 400 for invalid JSON", async () => {
    const internalUrl = API_URL.replace(/\/api$/, "").replace(/\/$/, "");
    const pushEventRes = await fetch(
      `${internalUrl}/internal/repo-host/push-events`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${INTERNAL_TOKEN}`,
        },
        body: "{invalid json",
      },
    );

    expect(pushEventRes.status).toBe(400);
  });

  test("cleanup: delete webhook", async () => {
    const result = await cli(
      ["webhook", "delete", String(hookID), "--yes"],
      { repo: repoSlug, json: true },
    );
    expect(result.exitCode).toBe(0);
  });
});
