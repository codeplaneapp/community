import { Hono } from "hono";
import {
  getUser,
  badRequest,
  writeError,
  writeJSON,
  writeRouteError,
} from "@jjhub/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSearchPagination(
  query: URLSearchParams,
): { cursor: string; limit: number; error?: string } {
  const cursor = (query.get("cursor") ?? "").trim();
  let limit = 30;

  const rawLimit = (query.get("limit") ?? "").trim();
  if (rawLimit) {
    const n = parseInt(rawLimit, 10);
    if (isNaN(n) || n <= 0) {
      return { cursor: "", limit: 0, error: "invalid limit value" };
    }
    limit = Math.min(n, 100);
  }

  // Support legacy page/per_page params
  const pageStr = query.get("page");
  if (pageStr && !query.has("cursor")) {
    const page = parseInt(pageStr, 10);
    const perPage = Math.min(
      parseInt(query.get("per_page") ?? "30", 10),
      100,
    );
    if (!isNaN(page) && page > 0) {
      return { cursor: String((page - 1) * perPage), limit: perPage };
    }
  }

  return { cursor, limit };
}

function cursorToPage(cursor: string, limit: number): number {
  if (!cursor) return 1;
  const offset = parseInt(cursor, 10);
  if (isNaN(offset) || offset < 0) return 1;
  return Math.floor(offset / limit) + 1;
}

/** Lazily resolve the search service from the registry on each request. */
function service() {
  return getServices().search;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/search/repositories
app.get("/api/search/repositories", async (c) => {
  const viewer = getUser(c);
  const query = new URL(c.req.url).searchParams;

  const pag = parseSearchPagination(query);
  if (pag.error) {
    return writeError(c, badRequest(pag.error));
  }

  const page = cursorToPage(pag.cursor, pag.limit);

  try {
    const result = await service().searchRepositories(viewer, {
      query: query.get("q") ?? "",
      page,
      perPage: pag.limit,
    });
    c.header("X-Total-Count", String(result.total_count));
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/search/issues
app.get("/api/search/issues", async (c) => {
  const viewer = getUser(c);
  const query = new URL(c.req.url).searchParams;

  const pag = parseSearchPagination(query);
  if (pag.error) {
    return writeError(c, badRequest(pag.error));
  }

  const page = cursorToPage(pag.cursor, pag.limit);

  try {
    const result = await service().searchIssues(viewer, {
      query: query.get("q") ?? "",
      state: (query.get("state") ?? "").trim(),
      label: (query.get("label") ?? "").trim(),
      assignee: (query.get("assignee") ?? "").trim(),
      milestone: (query.get("milestone") ?? "").trim(),
      page,
      perPage: pag.limit,
    });
    c.header("X-Total-Count", String(result.total_count));
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/search/users
app.get("/api/search/users", async (c) => {
  const query = new URL(c.req.url).searchParams;

  const pag = parseSearchPagination(query);
  if (pag.error) {
    return writeError(c, badRequest(pag.error));
  }

  const page = cursorToPage(pag.cursor, pag.limit);

  try {
    const result = await service().searchUsers({
      query: query.get("q") ?? "",
      page,
      perPage: pag.limit,
    });
    c.header("X-Total-Count", String(result.total_count));
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/search/code
app.get("/api/search/code", async (c) => {
  const viewer = getUser(c);
  const query = new URL(c.req.url).searchParams;

  const pag = parseSearchPagination(query);
  if (pag.error) {
    return writeError(c, badRequest(pag.error));
  }

  const page = cursorToPage(pag.cursor, pag.limit);

  try {
    const result = await service().searchCode(viewer, {
      query: query.get("q") ?? "",
      page,
      perPage: pag.limit,
    });
    c.header("X-Total-Count", String(result.total_count));
    return writeJSON(c, 200, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
