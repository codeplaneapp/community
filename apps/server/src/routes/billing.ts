import { Hono } from "hono";
import {
  getUser,
  badRequest,
  unauthorized,
  forbidden,
  writeError,
  writeJSON,
  writeRouteError,
} from "@codeplane/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AddCreditsRequest {
  amount_cents: number;
  reason: string;
  category?: string;
  idempotency_key?: string;
}

interface RecordUsageRequest {
  metric_key: string;
  quantity: number;
}

/** Lazily resolve the billing service from the registry on each request. */
function service() {
  return getServices().billing;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/billing/balance — Get credit balance for the authenticated user
app.get("/api/billing/balance", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  try {
    const balance = await service().getBalance("user", String(user.id));
    return writeJSON(c, 200, balance);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/billing/ledger — List credit ledger entries for the authenticated user
app.get("/api/billing/ledger", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = parseInt(query.get("per_page") ?? "30", 10);

  try {
    const result = await service().listCreditLedger(
      "user",
      String(user.id),
      page,
      perPage,
    );
    c.header("X-Total-Count", String(result.total));
    return writeJSON(c, 200, result.items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/billing/usage — Get all usage counters for the current period
app.get("/api/billing/usage", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  try {
    const usage = await service().getAllUsage("user", String(user.id));
    return writeJSON(c, 200, usage);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/billing/usage/:metric — Get usage for a specific metric
app.get("/api/billing/usage/:metric", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { metric } = c.req.param();

  try {
    const usage = await service().getUsage(
      "user",
      String(user.id),
      metric as any,
    );
    if (!usage) {
      return writeJSON(c, 200, {
        metric_key: metric,
        included_quantity: 0,
        consumed_quantity: 0,
        overage_quantity: 0,
        period_start: null,
        period_end: null,
      });
    }
    return writeJSON(c, 200, usage);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/billing/usage — Record a usage event
app.post("/api/billing/usage", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  let body: RecordUsageRequest;
  try {
    body = await c.req.json<RecordUsageRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  if (!body.metric_key) {
    return writeError(c, badRequest("metric_key is required"));
  }
  if (!body.quantity || body.quantity <= 0) {
    return writeError(c, badRequest("quantity must be a positive number"));
  }

  try {
    const usage = await service().recordUsage(
      "user",
      String(user.id),
      body.metric_key as any,
      body.quantity,
    );
    return writeJSON(c, 200, usage);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/billing/quota/:metric — Check quota for a specific metric
app.get("/api/billing/quota/:metric", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { metric } = c.req.param();

  try {
    const result = await service().checkQuota(
      "user",
      String(user.id),
      metric as any,
    );
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---------------------------------------------------------------------------
// Org billing routes (owner = org)
// ---------------------------------------------------------------------------

// GET /api/orgs/:org/billing/balance
app.get("/api/orgs/:org/billing/balance", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { org } = c.req.param();

  try {
    const balance = await service().getBalance("org", org);
    return writeJSON(c, 200, balance);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/billing/usage
app.get("/api/orgs/:org/billing/usage", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { org } = c.req.param();

  try {
    const usage = await service().getAllUsage("org", org);
    return writeJSON(c, 200, usage);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/orgs/:org/billing/ledger
app.get("/api/orgs/:org/billing/ledger", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { org } = c.req.param();
  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = parseInt(query.get("per_page") ?? "30", 10);

  try {
    const result = await service().listCreditLedger("org", org, page, perPage);
    c.header("X-Total-Count", String(result.total));
    return writeJSON(c, 200, result.items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---------------------------------------------------------------------------
// Admin-only routes
// ---------------------------------------------------------------------------

// POST /api/admin/billing/credits — Admin: add credits to any account
app.post("/api/admin/billing/credits", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  if (!user.isAdmin) {
    return writeError(c, forbidden("admin access required"));
  }

  let body: AddCreditsRequest & { owner_type: string; owner_id: string };
  try {
    body = await c.req.json();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  if (!body.owner_type || !body.owner_id) {
    return writeError(c, badRequest("owner_type and owner_id are required"));
  }
  if (!body.amount_cents || body.amount_cents <= 0) {
    return writeError(c, badRequest("amount_cents must be a positive number"));
  }

  try {
    const result = await service().addCredits(
      body.owner_type as any,
      body.owner_id,
      body.amount_cents,
      body.reason ?? "Admin credit adjustment",
      (body.category as any) ?? "adjustment",
      { idempotencyKey: body.idempotency_key },
    );
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/admin/billing/grant-monthly — Admin: trigger monthly credit grant
app.post("/api/admin/billing/grant-monthly", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }
  if (!user.isAdmin) {
    return writeError(c, forbidden("admin access required"));
  }

  try {
    const result = await service().grantMonthlyCredits();
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
