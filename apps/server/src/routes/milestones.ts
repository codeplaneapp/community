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
// Response type — mirrors Go db.Milestone JSON shape
// ---------------------------------------------------------------------------

interface MilestoneResponse {
  id: number;
  repository_id: number;
  title: string;
  description: string;
  state: string;
  due_date: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service input types — mirrors Go services.CreateMilestoneInput, etc.
// ---------------------------------------------------------------------------

interface CreateMilestoneInput {
  title: string;
  description: string;
  due_date?: string;
}

interface UpdateMilestoneInput {
  title?: string;
  description?: string;
  state?: string;
  due_date?: string;
}

// ---------------------------------------------------------------------------
// Request body types — mirrors Go routes createMilestoneRequest, etc.
// ---------------------------------------------------------------------------

interface CreateMilestoneRequestBody {
  title: string;
  description: string;
  due_date?: string;
}

interface UpdateMilestoneRequestBody {
  title?: string;
  description?: string;
  state?: string;
  due_date?: string;
}

// ---------------------------------------------------------------------------
// Service interface — matches Go MilestoneRouteService
// ---------------------------------------------------------------------------

interface MilestoneRouteService {
  createMilestone(actor: AuthUser | null, owner: string, repo: string, req: CreateMilestoneInput): Promise<MilestoneResponse>;
  listMilestones(viewer: AuthUser | null, owner: string, repo: string, page: number, perPage: number, state: string): Promise<{ items: MilestoneResponse[]; total: number }>;
  getMilestone(viewer: AuthUser | null, owner: string, repo: string, id: number): Promise<MilestoneResponse>;
  updateMilestone(actor: AuthUser | null, owner: string, repo: string, id: number, req: UpdateMilestoneInput): Promise<MilestoneResponse>;
  deleteMilestone(actor: AuthUser | null, owner: string, repo: string, id: number): Promise<void>;
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

/** Lazily resolve the milestone service from the registry on each request. */
function service(): MilestoneRouteService {
  return getServices().milestone;
}

// POST /api/repos/:owner/:repo/milestones — PostMilestone (CreateMilestone)
app.post("/api/repos/:owner/:repo/milestones", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const body = await decodeJSONBody<CreateMilestoneRequestBody>(c);

    const created = await service().createMilestone(actor, owner, repo, {
      title: body.title,
      description: body.description,
      due_date: body.due_date,
    });
    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/milestones — GetMilestones (ListMilestones)
app.get("/api/repos/:owner/:repo/milestones", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const { cursor, limit } = parsePagination(c);
    const page = cursorToPage(cursor, limit);
    const state = (c.req.query("state") ?? "").trim();
    const viewer = getUser(c) ?? null;

    const { items, total } = await service().listMilestones(viewer, owner, repo, page, limit, state);
    setPaginationHeaders(c, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/milestones/:id — GetMilestone
app.get("/api/repos/:owner/:repo/milestones/:id", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "milestone id is required", "invalid milestone id");
    const viewer = getUser(c) ?? null;

    const milestone = await service().getMilestone(viewer, owner, repo, id);
    return writeJSON(c, 200, milestone);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/milestones/:id — PatchMilestone (UpdateMilestone)
app.patch("/api/repos/:owner/:repo/milestones/:id", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "milestone id is required", "invalid milestone id");
    const body = await decodeJSONBody<UpdateMilestoneRequestBody>(c);

    const updated = await service().updateMilestone(actor, owner, repo, id, {
      title: body.title,
      description: body.description,
      state: body.state,
      due_date: body.due_date,
    });
    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/milestones/:id — DeleteMilestone
app.delete("/api/repos/:owner/:repo/milestones/:id", async (c) => {
  try {
    const actor = getUser(c) ?? null;
    const { owner, repo } = repoOwnerAndName(c);
    const id = parseInt64Param(c, "id", "milestone id is required", "invalid milestone id");

    await service().deleteMilestone(actor, owner, repo, id);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
