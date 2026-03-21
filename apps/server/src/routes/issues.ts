import { Hono } from "hono";
import {
  badRequest,
  internal,
  writeRouteError,
  writeJSON,
  getUser,
  type AuthUser,
  parsePagination,
  cursorToPage,
  setPaginationHeaders,
  parseInt64Param,
  repoOwnerAndName,
} from "@codeplane/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Response types — mirrors Go services.IssueResponse, IssueCommentResponse
// ---------------------------------------------------------------------------

interface IssueUserSummary {
  id: number;
  login: string;
}

interface LabelSummary {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface IssueResponse {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  author: IssueUserSummary;
  assignees: IssueUserSummary[];
  labels: LabelSummary[];
  milestone_id: number | null;
  comment_count: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface IssueCommentResponse {
  id: number;
  issue_id: number;
  user_id: number;
  commenter: string;
  body: string;
  type: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service input types — mirrors Go services.CreateIssueInput, etc.
// ---------------------------------------------------------------------------

interface CreateIssueInput {
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

interface IssueMilestonePatch {
  value: number | null;
}

interface UpdateIssueInput {
  title?: string;
  body?: string;
  state?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: IssueMilestonePatch;
}

interface CreateIssueCommentInput {
  body: string;
}

interface UpdateIssueCommentInput {
  body: string;
}

// ---------------------------------------------------------------------------
// Request body types — mirrors Go routes createIssueRequest, etc.
// ---------------------------------------------------------------------------

interface CreateIssueRequestBody {
  title: string;
  body: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number;
}

interface PatchIssueRequestBody {
  title?: string;
  body?: string;
  state?: string;
  assignees?: string[];
  labels?: string[];
  milestone?: number | null;
}

interface CreateIssueCommentRequestBody {
  body: string;
}

interface PatchIssueCommentRequestBody {
  body: string;
}

// ---------------------------------------------------------------------------
// Service interface — matches Go IssueRouteService
// ---------------------------------------------------------------------------

interface IssueRouteService {
  listIssues(viewer: AuthUser | null, owner: string, repo: string, page: number, perPage: number, state: string): Promise<{ items: IssueResponse[]; total: number }>;
  createIssue(actor: AuthUser | null, owner: string, repo: string, req: CreateIssueInput): Promise<IssueResponse>;
  getIssue(viewer: AuthUser | null, owner: string, repo: string, number: number): Promise<IssueResponse>;
  updateIssue(actor: AuthUser | null, owner: string, repo: string, number: number, req: UpdateIssueInput): Promise<IssueResponse>;
  createIssueComment(actor: AuthUser | null, owner: string, repo: string, number: number, req: CreateIssueCommentInput): Promise<IssueCommentResponse>;
  listIssueComments(viewer: AuthUser | null, owner: string, repo: string, number: number, page: number, perPage: number): Promise<{ items: IssueCommentResponse[]; total: number }>;
  getIssueComment(viewer: AuthUser | null, owner: string, repo: string, commentId: number): Promise<IssueCommentResponse>;
  updateIssueComment(actor: AuthUser | null, owner: string, repo: string, commentId: number, req: UpdateIssueCommentInput): Promise<IssueCommentResponse>;
  deleteIssueComment(actor: AuthUser | null, owner: string, repo: string, commentId: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Service accessor — returns the real IssueService from the service registry
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// JSON body decode helper — matches Go's decodeJSONBody
// ---------------------------------------------------------------------------

async function decodeJSONBody<T>(c: { req: { json: () => Promise<T> } }): Promise<T> {
  try {
    return await c.req.json();
  } catch {
    throw badRequest("invalid request body");
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

/** Lazily resolve the issue service from the registry on each request. */
function service(): IssueRouteService {
  return getServices().issue;
}

// GET /api/repos/:owner/:repo/issues — ListIssues
app.get("/api/repos/:owner/:repo/issues", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const { cursor, limit } = parsePagination(c);
    const page = cursorToPage(cursor, limit);
    const state = (c.req.query("state") ?? "").trim();
    const viewer = getUser(c) ?? null;

    const { items, total } = await service().listIssues(viewer, owner, repo, page, limit, state);
    setPaginationHeaders(c, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/issues — CreateIssue
app.post("/api/repos/:owner/:repo/issues", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const body = await decodeJSONBody<CreateIssueRequestBody>(c);

    const created = await service().createIssue(actor, owner, repo, {
      title: body.title,
      body: body.body,
      assignees: body.assignees,
      labels: body.labels,
      milestone: body.milestone,
    });
    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/issues/:number — GetIssue
app.get("/api/repos/:owner/:repo/issues/:number", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const viewer = getUser(c) ?? null;

    const issue = await service().getIssue(viewer, owner, repo, number);
    return writeJSON(c, 200, issue);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/issues/:number — PatchIssue
app.patch("/api/repos/:owner/:repo/issues/:number", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const body = await decodeJSONBody<PatchIssueRequestBody>(c);

    // Build milestone patch.
    // In Go, issueMilestonePatch has a custom UnmarshalJSON that sets Set=true whenever
    // the "milestone" key is present in the JSON (even if null). We detect presence
    // by checking whether the key exists in the parsed body object.
    let milestone: IssueMilestonePatch | undefined;
    if ("milestone" in body) {
      milestone = { value: body.milestone ?? null };
    }

    const updated = await service().updateIssue(actor, owner, repo, number, {
      title: body.title,
      body: body.body,
      state: body.state,
      assignees: body.assignees,
      labels: body.labels,
      milestone,
    });
    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/issues/:number/comments — PostIssueComment
app.post("/api/repos/:owner/:repo/issues/:number/comments", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const body = await decodeJSONBody<CreateIssueCommentRequestBody>(c);

    const created = await service().createIssueComment(actor, owner, repo, number, { body: body.body });
    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/issues/:number/comments — ListIssueComments
app.get("/api/repos/:owner/:repo/issues/:number/comments", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const { cursor, limit } = parsePagination(c);
    const page = cursorToPage(cursor, limit);
    const viewer = getUser(c) ?? null;

    const { items, total } = await service().listIssueComments(viewer, owner, repo, number, page, limit);
    setPaginationHeaders(c, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/issues/comments/:id — GetIssueComment
app.get("/api/repos/:owner/:repo/issues/comments/:id", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "comment id is required", "invalid comment id");
    const viewer = getUser(c) ?? null;

    const comment = await service().getIssueComment(viewer, owner, repo, id);
    return writeJSON(c, 200, comment);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/issues/comments/:id — PatchIssueComment
app.patch("/api/repos/:owner/:repo/issues/comments/:id", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "comment id is required", "invalid comment id");
    const body = await decodeJSONBody<PatchIssueCommentRequestBody>(c);

    const updated = await service().updateIssueComment(actor, owner, repo, id, { body: body.body });
    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/issues/comments/:id — DeleteIssueComment
app.delete("/api/repos/:owner/:repo/issues/comments/:id", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "comment id is required", "invalid comment id");

    await service().deleteIssueComment(actor, owner, repo, id);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// Issue labels — these are routes under issues path, delegating to label service.
app.get("/api/repos/:owner/:repo/issues/:number/labels", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const { cursor, limit } = parsePagination(c);
    const page = cursorToPage(cursor, limit);
    const viewer = getUser(c) ?? null;

    const { items, total } = await getServices().label.listIssueLabels(viewer, owner, repo, number, page, limit);
    setPaginationHeaders(c, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

app.post("/api/repos/:owner/:repo/issues/:number/labels", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const body = await decodeJSONBody<{ labels: string[] }>(c);
    const actor = getUser(c) ?? null;

    const labels = await getServices().label.addLabelsToIssue(actor, owner, repo, number, body.labels ?? []);
    return writeJSON(c, 200, labels);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

app.delete("/api/repos/:owner/:repo/issues/:number/labels/:name", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const number = parseInt64Param(c, "number", "issue number is required", "invalid issue number");
    const labelName = (c.req.param("name") ?? "").trim();
    if (labelName === "") throw badRequest("label name is required");
    const actor = getUser(c) ?? null;

    await getServices().label.removeIssueLabelByName(actor, owner, repo, number, labelName);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
