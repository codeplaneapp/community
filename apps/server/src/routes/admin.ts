import { Hono } from "hono";
import {
  getUser,
  badRequest,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
} from "@codeplane/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminCreateUserRequest {
  username: string;
  email: string;
  display_name: string;
}

interface PatchUserAdminRequest {
  is_admin: boolean;
}

interface PostUserTokenRequest {
  name: string;
  scopes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAdmin(c: any): { error?: Response } {
  const user = getUser(c);
  if (!user) {
    return { error: writeError(c, unauthorized("authentication required")) };
  }
  if (!user.isAdmin) {
    return { error: writeError(c, unauthorized("admin access required")) };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Service stubs — admin-specific methods are not yet in the SDK service layer.
// These stubs will be replaced when admin service methods are added to the SDK.
// ---------------------------------------------------------------------------

const userService = {
  listUsers: async (_input: any): Promise<{ items: any[]; total: number }> => ({
    items: [],
    total: 0,
  }),
  createUser: async (_input: any): Promise<any> => ({}),
  deleteUser: async (_username: string): Promise<void> => {},
  setUserAdmin: async (
    _username: string,
    _isAdmin: boolean,
  ): Promise<any> => ({}),
  createTokenForUser: async (
    _username: string,
    _req: any,
  ): Promise<any> => ({}),
};

const repoService = {
  listAllRepos: async (
    _input: any,
  ): Promise<{ items: any[]; total: number }> => ({ items: [], total: 0 }),
};

const orgService = {
  listAllOrgs: async (
    _input: any,
  ): Promise<{ items: any[]; total: number }> => ({ items: [], total: 0 }),
};

const runnerService = {
  listRunners: async (
    _input: any,
  ): Promise<{ items: any[]; total: number }> => ({ items: [], total: 0 }),
};

const healthService = {
  ping: async (): Promise<{ ok: boolean; error?: string; latency?: string }> => ({
    ok: true,
  }),
};

const auditService = {
  listAuditLogs: async (
    _since: string,
    _offset: number,
    _limit: number,
  ): Promise<any[]> => [],
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// ----------------------------- Runners -------------------------------------

// GET /api/admin/runners
app.get("/api/admin/runners", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);
  const statusFilter = query.get("status") ?? "";

  try {
    const { items, total } = await runnerService.listRunners({
      page,
      perPage,
      statusFilter,
    });
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Users ---------------------------------------

// GET /api/admin/users
app.get("/api/admin/users", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  try {
    const { items, total } = await userService.listUsers({ page, perPage });
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/admin/users
app.post("/api/admin/users", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  let body: AdminCreateUserRequest;
  try {
    body = await c.req.json<AdminCreateUserRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const profile = await userService.createUser({
      username: (body.username ?? "").trim(),
      email: (body.email ?? "").trim(),
      displayName: (body.display_name ?? "").trim(),
    });
    return writeJSON(c, 201, profile);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/admin/users/:username
app.delete("/api/admin/users/:username", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const { username } = c.req.param();
  if (!username.trim()) {
    return writeError(c, badRequest("username is required"));
  }

  try {
    await userService.deleteUser(username);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/admin/users/:username/admin
app.patch("/api/admin/users/:username/admin", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const { username } = c.req.param();
  if (!username.trim()) {
    return writeError(c, badRequest("username is required"));
  }

  let body: PatchUserAdminRequest;
  try {
    body = await c.req.json<PatchUserAdminRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const profile = await userService.setUserAdmin(username, body.is_admin);
    return writeJSON(c, 200, profile);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/admin/users/:username/tokens
app.post("/api/admin/users/:username/tokens", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const { username } = c.req.param();
  if (!username.trim()) {
    return writeError(c, badRequest("username is required"));
  }

  let body: PostUserTokenRequest;
  try {
    body = await c.req.json<PostUserTokenRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const result = await userService.createTokenForUser(username, {
      name: body.name,
      scopes: body.scopes,
    });
    return writeJSON(c, 201, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Orgs ----------------------------------------

// GET /api/admin/orgs
app.get("/api/admin/orgs", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  try {
    const { items, total } = await orgService.listAllOrgs({ page, perPage });
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Repos ---------------------------------------

// GET /api/admin/repos
app.get("/api/admin/repos", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  try {
    const { items, total } = await repoService.listAllRepos({ page, perPage });
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- System Health --------------------------------

// GET /api/admin/system/health
app.get("/api/admin/system/health", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const start = Date.now();
  const result = await healthService.ping();
  const latency = `${Date.now() - start}ms`;

  interface ComponentStatus {
    status: string;
    latency?: string;
    error?: string;
  }

  const resp: {
    status: string;
    database: ComponentStatus;
    components?: Record<string, ComponentStatus>;
  } = {
    status: "ok",
    database: { status: "ok", latency },
  };

  if (!result.ok) {
    resp.status = "degraded";
    resp.database = {
      status: "error",
      error: result.error ?? "database unreachable",
    };
  }

  const statusCode = resp.status === "ok" ? 200 : 503;
  return writeJSON(c, statusCode, resp);
});

// ----------------------------- Audit Logs ----------------------------------

// GET /api/admin/audit-logs
app.get("/api/admin/audit-logs", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;

  const query = new URL(c.req.url).searchParams;
  const sinceStr = (query.get("since") ?? "").trim();

  if (!sinceStr) {
    return writeError(c, badRequest("since parameter is required"));
  }

  // Validate since format: RFC3339 or YYYY-MM-DD
  const rfc3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (!rfc3339.test(sinceStr) && !dateOnly.test(sinceStr)) {
    return writeError(
      c,
      badRequest("invalid since format, expected RFC3339 or YYYY-MM-DD"),
    );
  }

  // Verify the date is actually parseable
  const parsed = new Date(sinceStr);
  if (isNaN(parsed.getTime())) {
    return writeError(
      c,
      badRequest("invalid since format, expected RFC3339 or YYYY-MM-DD"),
    );
  }

  const page = parseInt(query.get("page") ?? "1", 10);
  // Audit log defaults to 50 per page (matching Go: if limit == 30 { limit = 50 })
  let perPage = parseInt(query.get("per_page") ?? "50", 10);
  perPage = Math.min(perPage, 100);

  const offset = (page - 1) * perPage;

  try {
    const logs = await auditService.listAuditLogs(sinceStr, offset, perPage);
    return writeJSON(c, 200, logs);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ----------------------------- Alpha Whitelist ------------------------------

// GET /api/admin/alpha/whitelist
app.get("/api/admin/alpha/whitelist", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;
  // Stub — alpha whitelist is not part of the Go routes reviewed
  return writeJSON(c, 200, []);
});

// POST /api/admin/alpha/whitelist
app.post("/api/admin/alpha/whitelist", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;
  return writeJSON(c, 201, {});
});

// DELETE /api/admin/alpha/whitelist/:identity_type/:identity_value
app.delete(
  "/api/admin/alpha/whitelist/:identity_type/:identity_value",
  async (c) => {
    const { error } = requireAdmin(c);
    if (error) return error;
    return c.body(null, 204);
  },
);

// ----------------------------- Alpha Waitlist -------------------------------

// GET /api/admin/alpha/waitlist
app.get("/api/admin/alpha/waitlist", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;
  return writeJSON(c, 200, []);
});

// POST /api/admin/alpha/waitlist/approve
app.post("/api/admin/alpha/waitlist/approve", async (c) => {
  const { error } = requireAdmin(c);
  if (error) return error;
  return writeJSON(c, 200, {});
});

export default app;
