import { Hono } from "hono";
import type { Context } from "hono";

// ---------------------------------------------------------------------------
// Types — mirrors Go structs in internal/routes/jj_vcs.go & internal/repohost/client.go
// ---------------------------------------------------------------------------

// ---- Bookmarks ----

export interface BookmarkResponse {
  name: string;
  target_change_id: string;
  target_commit_id: string;
  is_tracking_remote: boolean;
}

export interface CreateBookmarkRequest {
  name: string;
  target_change_id: string;
}

// ---- Changes ----

export interface ChangeResponse {
  change_id: string;
  commit_id: string;
  description: string;
  author_name: string;
  author_email: string;
  timestamp: string;
  has_conflict: boolean;
  is_empty: boolean;
  parent_change_ids: string[];
}

export interface ChangeDiffResponse {
  change_id: string;
  file_diffs: FileDiffItem[];
}

export interface FileDiffItem {
  path: string;
  old_path?: string;
  change_type: string;
  patch?: string;
  is_binary: boolean;
  language?: string;
  additions: number;
  deletions: number;
  old_content?: string;
  new_content?: string;
}

export interface ChangeFileResponse {
  path: string;
}

export interface ChangeConflictResponse {
  file_path: string;
  conflict_type: string;
  base_content?: string;
  left_content?: string;
  right_content?: string;
  hunks?: string;
  resolution_status?: string;
}

// ---- Operations ----

export interface OperationResponse {
  operation_id: string;
  description: string;
  timestamp: string;
}

// ---- Cursor pagination ----

export interface CursorResponse<T> {
  items: T[];
  next_cursor: string;
}

// ---------------------------------------------------------------------------
// APIError format — mirrors Go pkg/errors/errors.go
// ---------------------------------------------------------------------------

interface APIErrorBody {
  message: string;
}

function apiError(status: number, message: string): { status: number; body: APIErrorBody } {
  return { status, body: { message } };
}

function badRequest(msg: string) { return apiError(400, msg); }
function unauthorized(msg: string) { return apiError(401, msg); }
function notImplementedErr(msg: string) { return apiError(501, msg); }

function writeError(c: Context, err: { status: number; body: APIErrorBody }) {
  return c.json(err.body, err.status as any);
}

// ---------------------------------------------------------------------------
// Pagination helpers — mirrors Go internal/routes/orgs.go
// ---------------------------------------------------------------------------

function parsePagination(c: Context): { cursor: string; limit: number } | { error: { status: number; body: APIErrorBody } } {
  const cursor = (c.req.query("cursor") ?? "").trim();
  let limit = 30;

  const rawLimit = (c.req.query("limit") ?? "").trim();
  if (rawLimit !== "") {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed <= 0) {
      return { error: badRequest("invalid limit value") };
    }
    limit = Math.min(parsed, 100);
  }

  return { cursor, limit };
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

// ================================ Bookmarks ================================

// ---- GET /api/repos/:owner/:repo/bookmarks ----
app.get("/api/repos/:owner/:repo/bookmarks", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const pagination = parsePagination(c);
  if ("error" in pagination) return writeError(c, pagination.error);

  // Service call: ListBookmarks via repo-host — stubbed
  // In Go this proxies through repohost.Client.ListBookmarks()
  return writeError(c, notImplementedErr("list bookmarks not implemented"));
});

// ---- POST /api/repos/:owner/:repo/bookmarks ----
app.post("/api/repos/:owner/:repo/bookmarks", async (c) => {
  // Requires authentication
  const actor = null; // TODO: wire up auth middleware
  if (actor == null) {
    return writeError(c, unauthorized("authentication required"));
  }

  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  let body: CreateBookmarkRequest;
  try {
    body = await c.req.json<CreateBookmarkRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  if (!(body.name ?? "").trim()) {
    return writeError(c, badRequest("bookmark name is required"));
  }
  if (!(body.target_change_id ?? "").trim()) {
    return writeError(c, badRequest("target_change_id is required"));
  }

  // Service call: CreateBookmark via repo-host — stubbed
  return writeError(c, notImplementedErr("create bookmark not implemented"));
});

// ---- DELETE /api/repos/:owner/:repo/bookmarks/:name ----
app.delete("/api/repos/:owner/:repo/bookmarks/:name", async (c) => {
  // Requires authentication
  const actor = null; // TODO: wire up auth middleware
  if (actor == null) {
    return writeError(c, unauthorized("authentication required"));
  }

  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const name = c.req.param("name")?.trim();
  if (!name) return writeError(c, badRequest("bookmark name is required"));

  // Service call: DeleteBookmark via repo-host — stubbed
  return writeError(c, notImplementedErr("delete bookmark not implemented"));
});

// ================================ Changes ================================

// ---- GET /api/repos/:owner/:repo/changes ----
app.get("/api/repos/:owner/:repo/changes", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const pagination = parsePagination(c);
  if ("error" in pagination) return writeError(c, pagination.error);

  // Service call: ListChanges via repo-host — stubbed
  return writeError(c, notImplementedErr("list changes not implemented"));
});

// ---- GET /api/repos/:owner/:repo/changes/:change_id ----
app.get("/api/repos/:owner/:repo/changes/:change_id", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const changeId = c.req.param("change_id")?.trim();
  if (!changeId) return writeError(c, badRequest("change_id is required"));

  // Service call: GetChange via repo-host — stubbed
  return writeError(c, notImplementedErr("get change not implemented"));
});

// ---- GET /api/repos/:owner/:repo/changes/:change_id/diff ----
app.get("/api/repos/:owner/:repo/changes/:change_id/diff", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const changeId = c.req.param("change_id")?.trim();
  if (!changeId) return writeError(c, badRequest("change_id is required"));

  // Mirrors Go: diffWhitespaceIgnored — check whitespace query param
  const whitespace = (c.req.query("whitespace") ?? "").trim().toLowerCase();
  const _ignoreWhitespace: unknown = whitespace === "ignore" || whitespace === "hide";

  // Service call: GetChangeDiff (via diffview.BuildChangeDiff in Go) — stubbed
  return writeError(c, notImplementedErr("get change diff not implemented"));
});

// ---- GET /api/repos/:owner/:repo/changes/:change_id/files ----
app.get("/api/repos/:owner/:repo/changes/:change_id/files", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const changeId = c.req.param("change_id")?.trim();
  if (!changeId) return writeError(c, badRequest("change_id is required"));

  // Service call: GetChangeFiles via repo-host — stubbed
  return writeError(c, notImplementedErr("get change files not implemented"));
});

// ---- GET /api/repos/:owner/:repo/changes/:change_id/conflicts ----
app.get("/api/repos/:owner/:repo/changes/:change_id/conflicts", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const changeId = c.req.param("change_id")?.trim();
  if (!changeId) return writeError(c, badRequest("change_id is required"));

  // Service call: GetChangeConflicts via repo-host — stubbed
  return writeError(c, notImplementedErr("get change conflicts not implemented"));
});

// ================================ File at Change ================================

// ---- GET /api/repos/:owner/:repo/file/:change_id/* ----
app.get("/api/repos/:owner/:repo/file/:change_id/*", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const changeId = c.req.param("change_id")?.trim();
  if (!changeId) return writeError(c, badRequest("change_id is required"));

  // Extract the wildcard path from the URL
  const url = new URL(c.req.url);
  const prefix = `/api/repos/${owner}/${repoName}/file/${changeId}/`;
  const filePath = decodeURIComponent(url.pathname.slice(prefix.length)).trim();
  if (!filePath) return writeError(c, badRequest("path is required"));

  // Service call: GetFileAtChange via repo-host — stubbed
  return writeError(c, notImplementedErr("get file at change not implemented"));
});

// ================================ Operations ================================

// ---- GET /api/repos/:owner/:repo/operations ----
app.get("/api/repos/:owner/:repo/operations", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const pagination = parsePagination(c);
  if ("error" in pagination) return writeError(c, pagination.error);

  // Service call: ListOperations via repo-host — stubbed
  return writeError(c, notImplementedErr("list operations not implemented"));
});

// ================================ Commit Statuses ================================

// ---- POST /api/repos/:owner/:repo/statuses/:sha ----
app.post("/api/repos/:owner/:repo/statuses/:sha", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const sha = c.req.param("sha")?.trim();
  if (!sha) return writeError(c, badRequest("sha is required"));

  // Service call: CreateCommitStatus — stubbed
  return writeError(c, notImplementedErr("create commit status not implemented"));
});

// ---- GET /api/repos/:owner/:repo/commits/:ref/statuses ----
app.get("/api/repos/:owner/:repo/commits/:ref/statuses", async (c) => {
  const owner = c.req.param("owner")?.trim();
  const repoName = c.req.param("repo")?.trim();
  if (!owner) return writeError(c, badRequest("owner is required"));
  if (!repoName) return writeError(c, badRequest("repository name is required"));

  const ref = c.req.param("ref")?.trim();
  if (!ref) return writeError(c, badRequest("ref is required"));

  // Service call: ListCommitStatuses — stubbed
  return writeError(c, notImplementedErr("list commit statuses not implemented"));
});

export default app;
