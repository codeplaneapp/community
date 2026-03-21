import { Hono } from "hono";
import {
  getUser,
  badRequest,
  forbidden,
  notFound,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
} from "@jjhub/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConfigureLinearIntegrationRequest {
  linear_team_id: string;
  setup_key: string;
  repo_owner: string;
  repo_name: string;
  repo_id: number;
}

// ---------------------------------------------------------------------------
// Service stubs
// ---------------------------------------------------------------------------

const linearService = {
  startLinearOAuth: async (
    _stateVerifier: string,
  ): Promise<string> => "",
  completeLinearOAuth: async (
    _code: string,
    _state: string,
    _stateVerifier: string,
  ): Promise<any> => ({}),
  createOAuthSetup: async (
    _userId: number,
    _result: any,
  ): Promise<string> => "",
  getOAuthSetup: async (
    _userId: number,
    _setupKey: string,
  ): Promise<any> => ({}),
  consumeOAuthSetup: async (
    _userId: number,
    _setupKey: string,
  ): Promise<any> => ({}),
  listIntegrations: async (
    _userId: number,
  ): Promise<any[]> => [],
  getIntegration: async (
    _userId: number,
    _id: number,
  ): Promise<any> => ({}),
  configureIntegration: async (
    _userId: number,
    _req: any,
  ): Promise<any> => ({}),
  deleteIntegration: async (
    _userId: number,
    _id: number,
  ): Promise<void> => {},
};

const syncService = {
  runInitialSync: async (_integration: any): Promise<void> => {},
  handleLinearWebhook: async (
    _body: Uint8Array,
    _signature: string,
  ): Promise<void> => {},
};

const repoChecker = {
  getRepoByID: async (_id: number): Promise<any> => null,
  userCanAdminRepo: async (_user: any, _repo: any): Promise<boolean> => false,
};

const repositoryService = {
  listRepositoryOptions: async (
    _userId: number,
  ): Promise<any[]> => [],
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// ----------------------------- MCP -----------------------------------------

// GET /api/integrations/mcp
app.get("/api/integrations/mcp", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  // Stub — MCP integrations not yet implemented
  return writeJSON(c, 200, []);
});

// ----------------------------- Skills --------------------------------------

// GET /api/integrations/skills
app.get("/api/integrations/skills", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  // Stub — Skills integrations not yet implemented
  return writeJSON(c, 200, []);
});

// ----------------------------- Linear Repositories -------------------------

// GET /api/integrations/linear/repositories
app.get("/api/integrations/linear/repositories", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  try {
    const options = await repositoryService.listRepositoryOptions(user.id);
    return writeJSON(c, 200, options);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Linear OAuth --------------------------------

// GET /api/integrations/linear/oauth/start
app.get("/api/integrations/linear/oauth/start", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  try {
    // Generate a random state verifier (16 bytes hex = 32 chars)
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const stateVerifier = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const redirectURL = await linearService.startLinearOAuth(stateVerifier);

    // Set state cookie for CSRF protection
    c.header(
      "Set-Cookie",
      `jjhub_linear_oauth_state=${stateVerifier}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );

    return c.redirect(redirectURL, 302);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/integrations/linear/oauth/callback
app.get("/api/integrations/linear/oauth/callback", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const code = (query.get("code") ?? "").trim();
  const state = (query.get("state") ?? "").trim();

  if (!code || !state) {
    return writeError(c, badRequest("code and state are required"));
  }

  // Read state verifier from cookie
  const cookieHeader = c.req.header("Cookie") ?? "";
  const stateVerifier = extractCookieValue(
    cookieHeader,
    "jjhub_linear_oauth_state",
  );

  // Clear the state cookie
  c.header(
    "Set-Cookie",
    "jjhub_linear_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=-1",
  );

  try {
    const result = await linearService.completeLinearOAuth(
      code,
      state,
      stateVerifier,
    );

    const setupKey = await linearService.createOAuthSetup(user.id, result);

    const params = new URLSearchParams();
    params.set("setup", setupKey);
    return c.redirect(`/integrations/linear?${params.toString()}`, 302);
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "oauth_error";
    return c.redirect(
      `/integrations/linear?error=${encodeURIComponent(errorMsg)}`,
      302,
    );
  }
});

// GET /api/integrations/linear/oauth/setup/:setupKey
app.get("/api/integrations/linear/oauth/setup/:setupKey", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { setupKey } = c.req.param();
  if (!setupKey.trim()) {
    return writeError(c, badRequest("setup key is required"));
  }

  try {
    const result = await linearService.getOAuthSetup(user.id, setupKey);
    return writeJSON(c, 200, {
      viewer: {
        id: result.viewer.id,
        name: result.viewer.name,
        email: result.viewer.email,
      },
      teams: result.teams,
    });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Linear Integrations -------------------------

// GET /api/integrations/linear
app.get("/api/integrations/linear", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  try {
    const integrations = await linearService.listIntegrations(user.id);
    return writeJSON(c, 200, integrations);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/integrations/linear
app.post("/api/integrations/linear", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  let body: ConfigureLinearIntegrationRequest;
  try {
    body = await c.req.json<ConfigureLinearIntegrationRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  if (!(body.linear_team_id ?? "").trim() || !body.repo_id) {
    return writeError(
      c,
      badRequest("linear_team_id and repo_id are required"),
    );
  }
  if (!(body.setup_key ?? "").trim()) {
    return writeError(c, badRequest("setup_key is required"));
  }

  // Verify the user has admin access to the target repository
  try {
    const repo = await repoChecker.getRepoByID(body.repo_id);
    if (!repo) {
      return writeError(c, notFound("repository not found"));
    }
    const canAdmin = await repoChecker.userCanAdminRepo(user, repo);
    if (!canAdmin) {
      return writeError(
        c,
        forbidden("you do not have admin access to this repository"),
      );
    }
  } catch (err) {
    return writeRouteError(c, err);
  }

  try {
    const setupResult = await linearService.consumeOAuthSetup(
      user.id,
      body.setup_key,
    );

    // Verify the selected team was in the OAuth setup result
    let linearTeamName = "";
    let linearTeamKey = "";
    let matchedTeam = false;
    if (setupResult.teams) {
      for (const team of setupResult.teams) {
        if (team.id === body.linear_team_id) {
          linearTeamName = team.name;
          linearTeamKey = team.key;
          matchedTeam = true;
          break;
        }
      }
    }
    if (!matchedTeam) {
      return writeError(
        c,
        badRequest(
          "selected linear_team_id was not returned by the oauth setup",
        ),
      );
    }

    const integration = await linearService.configureIntegration(user.id, {
      linearTeamId: body.linear_team_id,
      linearTeamName,
      linearTeamKey,
      repoOwner: body.repo_owner,
      repoName: body.repo_name,
      repoId: body.repo_id,
      accessToken: setupResult.accessToken,
      refreshToken: setupResult.refreshToken,
      expiresAt: setupResult.expiresAt,
      linearActorId: setupResult.viewer.id,
    });

    return writeJSON(c, 201, {
      id: integration.id,
      linear_team_id: integration.linearTeamId,
      linear_team_name: integration.linearTeamName,
      repo_owner: integration.repoOwner,
      repo_name: integration.repoName,
      is_active: integration.isActive,
    });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/integrations/linear/:id
app.delete("/api/integrations/linear/:id", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  const integrationId = parseInt(id, 10);
  if (isNaN(integrationId)) {
    return writeError(c, badRequest("invalid integration id"));
  }

  try {
    await linearService.deleteIntegration(user.id, integrationId);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/integrations/linear/:id/sync
app.post("/api/integrations/linear/:id/sync", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  const integrationId = parseInt(id, 10);
  if (isNaN(integrationId)) {
    return writeError(c, badRequest("invalid integration id"));
  }

  try {
    // Verify ownership
    const integration = await linearService.getIntegration(
      user.id,
      integrationId,
    );

    // Fire initial sync in background
    syncService.runInitialSync(integration).catch(() => {
      // Background sync errors are logged, not returned to client
    });

    return writeJSON(c, 202, { status: "sync_started" });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Linear Webhook ------------------------------

// POST /webhooks/linear
app.post("/webhooks/linear", async (c) => {
  let payload: Uint8Array;
  try {
    const arrayBuf = await c.req.arrayBuffer();
    if (arrayBuf.byteLength > 1 << 20) {
      // 1MB limit
      return writeError(c, badRequest("failed to read request body"));
    }
    payload = new Uint8Array(arrayBuf);
  } catch {
    return writeError(c, badRequest("failed to read request body"));
  }

  const signature = c.req.header("Linear-Signature") ?? "";

  try {
    await syncService.handleLinearWebhook(payload, signature);
    return c.body(null, 200);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---------------------------------------------------------------------------
// Cookie helper
// ---------------------------------------------------------------------------

function extractCookieValue(cookieHeader: string, name: string): string {
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.slice(name.length + 1).trim();
    }
  }
  return "";
}

export default app;
