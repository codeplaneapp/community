import { describe, expect, test } from "bun:test";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: OAuth2 Application Management", () => {
  let appId = 0;
  let clientId = "";

  test("create OAuth2 application", async () => {
    const appName = uniqueName("cli-oauth-app");
    const result = await cli(
      [
        "api",
        "/api/user/applications/oauth2",
        "--method", "POST",
        "-f", `name=${appName}`,
        "-f", "redirect_uris=https://example.com/callback",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as {
      id: number;
      name: string;
      client_id: string;
      client_secret: string;
      redirect_uris: string[];
    };
    expect(typeof body.id).toBe("number");
    expect(body.name).toBe(appName);
    expect(typeof body.client_id).toBe("string");
    expect(body.client_id.length).toBeGreaterThan(0);
    expect(typeof body.client_secret).toBe("string");
    expect(body.client_secret.length).toBeGreaterThan(0);
    expect(body.redirect_uris).toContain("https://example.com/callback");
    appId = body.id;
    clientId = body.client_id;
  });

  test("client_id format is valid", async () => {
    // Client ID should be a UUID or hex string
    expect(clientId.length).toBeGreaterThanOrEqual(16);
    expect(clientId).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  test("list OAuth2 applications", async () => {
    const result = await cli(
      ["api", "/api/user/applications/oauth2"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{
      id: number;
      name: string;
      client_id: string;
    }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((app) => app.id === appId)).toBe(true);
    // client_secret should NOT appear in list responses
    for (const app of body) {
      expect((app as Record<string, unknown>).client_secret).toBeUndefined();
    }
  });

  test("update OAuth2 application redirect URIs", async () => {
    const result = await cli(
      [
        "api",
        `/api/user/applications/oauth2/${appId}`,
        "--method", "PATCH",
        "-f", "redirect_uris=https://example.com/callback,https://staging.example.com/callback",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as {
      id: number;
      redirect_uris: string[];
    };
    expect(body.redirect_uris.length).toBeGreaterThanOrEqual(2);
  });

  test("delete OAuth2 application", async () => {
    const result = await cli(
      [
        "api",
        `/api/user/applications/oauth2/${appId}`,
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["api", "/api/user/applications/oauth2"],
      { json: true },
    );
    if (listResult.exitCode === 0) {
      const apps = JSON.parse(listResult.stdout) as Array<{ id: number }>;
      expect(apps.some((a) => a.id === appId)).toBe(false);
    }
  });
});
