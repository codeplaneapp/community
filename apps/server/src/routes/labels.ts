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
} from "@jjhub/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Response type — mirrors Go db.Label JSON shape
// ---------------------------------------------------------------------------

interface LabelResponse {
  id: number;
  repository_id: number;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service input types — mirrors Go services.CreateLabelInput, UpdateLabelInput
// ---------------------------------------------------------------------------

interface CreateLabelInput {
  name: string;
  color: string;
  description: string;
}

interface UpdateLabelInput {
  name?: string;
  color?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Request body types — mirrors Go routes createLabelRequest, etc.
// ---------------------------------------------------------------------------

interface CreateLabelRequestBody {
  name: string;
  color: string;
  description: string;
}

interface UpdateLabelRequestBody {
  name?: string;
  color?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Service interface — matches Go LabelRouteService
// ---------------------------------------------------------------------------

interface LabelRouteService {
  createLabel(actor: AuthUser | null, owner: string, repo: string, req: CreateLabelInput): Promise<LabelResponse>;
  listLabels(viewer: AuthUser | null, owner: string, repo: string, page: number, perPage: number): Promise<{ items: LabelResponse[]; total: number }>;
  getLabel(viewer: AuthUser | null, owner: string, repo: string, id: number): Promise<LabelResponse>;
  updateLabel(actor: AuthUser | null, owner: string, repo: string, id: number, req: UpdateLabelInput): Promise<LabelResponse>;
  deleteLabel(actor: AuthUser | null, owner: string, repo: string, id: number): Promise<void>;
  addLabelsToIssue(actor: AuthUser | null, owner: string, repo: string, number: number, names: string[]): Promise<LabelResponse[]>;
  listIssueLabels(viewer: AuthUser | null, owner: string, repo: string, number: number, page: number, perPage: number): Promise<{ items: LabelResponse[]; total: number }>;
  removeIssueLabelByName(actor: AuthUser | null, owner: string, repo: string, number: number, labelName: string): Promise<void>;
}


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

/** Lazily resolve the label service from the registry on each request. */
function service(): LabelRouteService {
  return getServices().label;
}

// POST /api/repos/:owner/:repo/labels — PostRepoLabel (CreateLabel)
app.post("/api/repos/:owner/:repo/labels", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const body = await decodeJSONBody<CreateLabelRequestBody>(c);

    const created = await service().createLabel(actor, owner, repo, {
      name: body.name,
      color: body.color,
      description: body.description,
    });
    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/labels — GetRepoLabels (ListLabels)
app.get("/api/repos/:owner/:repo/labels", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const { cursor, limit } = parsePagination(c);
    const page = cursorToPage(cursor, limit);
    const viewer = getUser(c) ?? null;

    const { items, total } = await service().listLabels(viewer, owner, repo, page, limit);
    setPaginationHeaders(c, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/labels/:id — GetRepoLabel
app.get("/api/repos/:owner/:repo/labels/:id", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "label id is required", "invalid label id");
    const viewer = getUser(c) ?? null;

    const label = await service().getLabel(viewer, owner, repo, id);
    return writeJSON(c, 200, label);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/labels/:id — PatchRepoLabel (UpdateLabel)
app.patch("/api/repos/:owner/:repo/labels/:id", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "label id is required", "invalid label id");
    const body = await decodeJSONBody<UpdateLabelRequestBody>(c);

    const updated = await service().updateLabel(actor, owner, repo, id, {
      name: body.name,
      color: body.color,
      description: body.description,
    });
    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/labels/:id — DeleteRepoLabel
app.delete("/api/repos/:owner/:repo/labels/:id", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "label id is required", "invalid label id");

    await service().deleteLabel(actor, owner, repo, id);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
