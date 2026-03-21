import { Hono } from "hono";
import {
  getUser,
  badRequest,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
} from "@codeplane/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateWikiPageRequest {
  title: string;
  slug?: string;
  body: string;
}

interface PatchWikiPageRequest {
  title?: string;
  slug?: string;
  body?: string;
}

/** Lazily resolve the wiki service from the registry on each request. */
function service() {
  return getServices().wiki;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/repos/:owner/:repo/wiki
app.get("/api/repos/:owner/:repo/wiki", async (c) => {
  const viewer = getUser(c);
  const { owner, repo } = c.req.param();
  const query = new URL(c.req.url).searchParams;

  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);
  const q = (query.get("q") ?? "").trim();

  try {
    const { items, total } = await service().listWikiPages(viewer, owner, repo, {
      query: q,
      page,
      perPage,
    });
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/wiki
app.post("/api/repos/:owner/:repo/wiki", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo } = c.req.param();

  let body: CreateWikiPageRequest;
  try {
    body = await c.req.json<CreateWikiPageRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const created = await service().createWikiPage(actor, owner, repo, {
      title: body.title,
      slug: body.slug,
      body: body.body,
    });
    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/wiki/:slug
app.get("/api/repos/:owner/:repo/wiki/:slug", async (c) => {
  const viewer = getUser(c);
  const { owner, repo, slug } = c.req.param();

  if (!slug.trim()) {
    return writeError(c, badRequest("wiki slug is required"));
  }

  try {
    const page = await service().getWikiPage(viewer, owner, repo, slug);
    return writeJSON(c, 200, page);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/wiki/:slug
app.patch("/api/repos/:owner/:repo/wiki/:slug", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, slug } = c.req.param();

  if (!slug.trim()) {
    return writeError(c, badRequest("wiki slug is required"));
  }

  let body: PatchWikiPageRequest;
  try {
    body = await c.req.json<PatchWikiPageRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const updated = await service().updateWikiPage(actor, owner, repo, slug, {
      title: body.title,
      slug: body.slug,
      body: body.body,
    });
    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/wiki/:slug
app.delete("/api/repos/:owner/:repo/wiki/:slug", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, slug } = c.req.param();

  if (!slug.trim()) {
    return writeError(c, badRequest("wiki slug is required"));
  }

  try {
    await service().deleteWikiPage(actor, owner, repo, slug);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
