import { Hono } from "hono";
import type { Context } from "hono";
import {
  getUser,
  writeRouteError,
  type SSEEvent,
  formatSSEEvent,
  sseResponse,
  sseStreamWithInitial,
  sseStaticResponse,
} from "@jjhub/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Stubbed service types (mirrors Go services layer)
// ---------------------------------------------------------------------------

interface WorkflowDefinition {
  id: number;
  repository_id: number;
  name: string;
  path: string;
  config: unknown;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface WorkflowRun {
  id: number;
  repository_id: number;
  workflow_definition_id: number;
  status: string;
  trigger_event: string;
  trigger_ref: string;
  trigger_commit_sha: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowStep {
  id: number;
  workflow_run_id: number;
  name: string;
  position: number;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkflowStepResult {
  step_id: number;
  task_id: number;
}

interface WorkflowRunResult {
  workflow_definition_id: number;
  workflow_run_id: number;
  steps: WorkflowStepResult[];
}

interface WorkflowLogEntry {
  id: number;
  workflow_step_id: number;
  sequence: number;
  stream: string;
  entry: string;
  created_at: string;
}

// WorkflowArtifact type reserved for future artifact service integration.
// interface WorkflowArtifact { ... }

// ---------------------------------------------------------------------------
// Real service accessor — wraps the SDK WorkflowService
// ---------------------------------------------------------------------------

/** Lazily resolve the workflow service from the registry on each request. */
function wfService() {
  return getServices().workflow;
}

/**
 * Resolve repository ID from route params. The WorkflowService takes
 * repositoryId: string. We resolve it via the repo service.
 */
async function resolveRepoId(c: Context): Promise<string> {
  const owner = (c.req.param("owner") ?? "").trim();
  const repo = (c.req.param("repo") ?? "").trim();
  const user = getUser(c);
  const actor = user
    ? { id: user.id, username: user.username, isAdmin: user.isAdmin ?? false }
    : null;
  const result = await getServices().repo.getRepo(actor, owner, repo);
  if (Result.isError(result)) {
    throw result.error;
  }
  return String(result.value.id);
}

/**
 * Unwrap a Result value, throwing the error if it's an error.
 */
function unwrap<T>(result: any): T {
  if (Result.isError(result)) throw result.error;
  return result.value;
}

/**
 * Adapter that presents the same interface as the old stub but delegates to the
 * real WorkflowService. This avoids rewriting every route handler.
 */
const workflowService = {
  listWorkflowDefinitions: async (
    repositoryID: number,
    page: number,
    perPage: number
  ): Promise<WorkflowDefinition[]> => {
    const result = unwrap(await wfService().listWorkflowDefinitions(String(repositoryID), page, perPage));
    return result as unknown as WorkflowDefinition[];
  },
  getWorkflowDefinition: async (
    repositoryID: number,
    definitionID: number
  ): Promise<WorkflowDefinition | null> => {
    try {
      const result = unwrap(await wfService().getWorkflowDefinitionById(String(repositoryID), String(definitionID)));
      return result as unknown as WorkflowDefinition;
    } catch {
      return null;
    }
  },
  listWorkflowRunsByRepo: async (
    repositoryID: number,
    page: number,
    perPage: number
  ): Promise<WorkflowRun[]> => {
    const result = unwrap(await wfService().listWorkflowRunsByRepo(String(repositoryID), page, perPage));
    return result as unknown as WorkflowRun[];
  },
  listWorkflowRunsByDefinition: async (
    repositoryID: number,
    definitionID: number,
    page: number,
    perPage: number
  ): Promise<WorkflowRun[]> => {
    const result = unwrap(await wfService().listWorkflowRunsByDefinition(String(repositoryID), String(definitionID), page, perPage));
    return result as unknown as WorkflowRun[];
  },
  getWorkflowRun: async (
    repositoryID: number,
    runID: number
  ): Promise<WorkflowRun | null> => {
    try {
      const result = unwrap(await wfService().getWorkflowRunById(String(repositoryID), String(runID)));
      return result as unknown as WorkflowRun;
    } catch {
      return null;
    }
  },
  cancelWorkflowRun: async (
    repositoryID: number,
    runID: number
  ): Promise<void> => {
    unwrap(await wfService().cancelRun(String(repositoryID), String(runID)));
  },
  resumeRun: async (
    repositoryID: number,
    runID: number
  ): Promise<void> => {
    unwrap(await wfService().resumeRun(String(repositoryID), String(runID)));
  },
  dispatchForEvent: async (input: {
    repositoryID: number;
    userID: number;
    workflowDefinitionID?: number;
    event: {
      type: string;
      ref: string;
      inputs?: Record<string, unknown>;
    };
  }): Promise<WorkflowRunResult[]> => {
    const result = unwrap(await wfService().dispatchForEvent({
      repositoryId: String(input.repositoryID),
      userId: String(input.userID),
      workflowDefinitionId: input.workflowDefinitionID != null ? String(input.workflowDefinitionID) : undefined,
      event: {
        ...input.event,
        commitSHA: "",
      },
    }));
    return result as unknown as WorkflowRunResult[];
  },
  rerunRun: async (input: {
    repositoryID: number;
    runID: number;
    userID: number;
  }): Promise<WorkflowRunResult | null> => {
    try {
      const result = unwrap(await wfService().rerunRun({
        repositoryId: String(input.repositoryID),
        runId: String(input.runID),
        userId: String(input.userID),
      }));
      return result as unknown as WorkflowRunResult;
    } catch {
      return null;
    }
  },
  listWorkflowSteps: async (runID: number): Promise<WorkflowStep[]> => {
    const result = unwrap(await wfService().listWorkflowSteps(String(runID)));
    return result as unknown as WorkflowStep[];
  },
  listWorkflowLogsSince: async (
    runID: number,
    afterID: number,
    limit: number
  ): Promise<WorkflowLogEntry[]> => {
    const result = unwrap(await wfService().listWorkflowLogsSince(String(runID), afterID, limit));
    return result as unknown as WorkflowLogEntry[];
  },
  validateDispatchInputs: (
    _config: unknown,
    _userInputs?: Record<string, unknown>
  ): Record<string, unknown> | null => {
    // TODO: Wire dispatch input validation when available in SDK
    return _userInputs ?? null;
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse pagination query params — mirrors Go parsePagination + cursorToPage. */
function parsePagination(c: Context): { page: number; limit: number } | { error: string } {
  const rawPage = c.req.query("page");
  const rawPerPage = c.req.query("per_page");
  const rawLimit = c.req.query("limit");
  const rawCursor = c.req.query("cursor");

  let limit = 30;
  let page = 1;

  // Legacy pagination (page + per_page)
  if (rawPage || rawPerPage) {
    if (rawPage) {
      const parsed = parseInt(rawPage, 10);
      if (isNaN(parsed) || parsed <= 0) return { error: "invalid page value" };
      page = parsed;
    }
    if (rawPerPage) {
      const parsed = parseInt(rawPerPage, 10);
      if (isNaN(parsed) || parsed <= 0) return { error: "invalid per_page value" };
      if (parsed > 100) return { error: "per_page must not exceed 100" };
      limit = parsed;
    }
    return { page, limit };
  }

  // Cursor-based pagination
  if (rawLimit) {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed <= 0) return { error: "invalid limit value" };
    limit = Math.min(parsed, 100);
  }
  if (rawCursor) {
    const offset = parseInt(rawCursor, 10);
    if (!isNaN(offset) && offset >= 0 && limit > 0) {
      page = Math.floor(offset / limit) + 1;
    }
  }
  return { page, limit };
}

function parsePositiveInt64Param(raw: string | undefined, _message: string): number | null {
  if (!raw) return null;
  const val = parseInt(raw, 10);
  if (isNaN(val) || val <= 0) return null;
  return val;
}

function isTerminalStatus(status: string): boolean {
  return ["success", "failure", "failed", "cancelled", "timeout"].includes(status);
}

function normalizeWorkflowState(raw: string): string {
  const lower = raw.trim().toLowerCase();
  switch (lower) {
    case "completed":
    case "complete":
    case "done":
    case "success":
      return "success";
    case "failed":
    case "failure":
    case "error":
      return "failure";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "queued":
    case "pending":
      return "queued";
    case "running":
    case "in_progress":
    case "in-progress":
      return "running";
    case "finished":
    case "terminal":
      return "finished";
    default:
      return lower;
  }
}

function workflowRunMatchesState(status: string, filter: string): boolean {
  const normalizedStatus = normalizeWorkflowState(status);
  const normalizedFilter = normalizeWorkflowState(filter);
  if (normalizedFilter === "") return true;
  if (normalizedFilter === "finished") {
    return normalizedStatus === "success" || normalizedStatus === "failure" || normalizedStatus === "cancelled";
  }
  return normalizedStatus === normalizedFilter;
}

function workflowIdentifierMatches(def: WorkflowDefinition, identifier: string): boolean {
  const trimmed = identifier.trim();
  if (trimmed === "") return false;
  if (def.name.toLowerCase() === trimmed.toLowerCase()) return true;
  // Match path base without extension
  const base = def.path.split("/").pop() ?? "";
  const ext = base.lastIndexOf(".");
  const stem = ext > 0 ? base.substring(0, ext) : base;
  return stem.toLowerCase() === trimmed.toLowerCase() || def.path.toLowerCase() === trimmed.toLowerCase();
}

function workflowNodeMatches(step: WorkflowStep, identifier: string): boolean {
  const trimmed = identifier.trim();
  if (trimmed === "") return false;
  if (String(step.id) === trimmed) return true;
  return step.name.toLowerCase() === trimmed.toLowerCase();
}

function formatWorkflowDuration(startedAt: string | null, completedAt: string | null): { seconds: number; label: string } {
  if (!startedAt) return { seconds: 0, label: "" };
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (end < start) return { seconds: 0, label: "" };
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const label = minutes === 0 ? `${remainder}s` : `${minutes}m ${remainder}s`;
  return { seconds, label };
}

function workflowNodeFillColor(status: string): string {
  switch (normalizeWorkflowState(status)) {
    case "success": return "#22c55e";
    case "failure": return "#ef4444";
    case "cancelled": return "#9ca3af";
    case "running": return "#3b82f6";
    case "queued": return "#6b7280";
    default: return "#94a3b8";
  }
}

function mermaidLabel(value: string): string {
  return value.replace(/\|/g, "/").replace(/"/g, "'").replace(/\n/g, " ");
}

// ---------------------------------------------------------------------------
// Response builders (mirrors Go toWorkflowRunResponse, etc.)
// ---------------------------------------------------------------------------

interface WorkflowRunNodeResponse {
  id: string;
  step_id: number;
  name: string;
  position: number;
  status: string;
  iteration: number;
  started_at: string | null;
  completed_at: string | null;
  duration: string;
  duration_seconds: number;
}

function toWorkflowRunNodeResponse(step: WorkflowStep): WorkflowRunNodeResponse {
  const dur = formatWorkflowDuration(step.started_at, step.completed_at);
  return {
    id: String(step.id),
    step_id: step.id,
    name: step.name,
    position: step.position,
    status: step.status,
    iteration: 1,
    started_at: step.started_at,
    completed_at: step.completed_at,
    duration: dur.label,
    duration_seconds: dur.seconds,
  };
}

function buildWorkflowRunNodes(steps: WorkflowStep[]): WorkflowRunNodeResponse[] {
  return steps.map(toWorkflowRunNodeResponse);
}

function buildWorkflowRunMermaid(nodes: WorkflowRunNodeResponse[]): string {
  let result = "graph TD\n";
  if (nodes.length === 0) return result;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    result += `    N${i + 1}["${node.name}"]\n`;
  }
  for (let i = 0; i < nodes.length - 1; i++) {
    const node = nodes[i]!;
    const label = `${node.status} ${node.duration}`.trim();
    if (label === "") {
      result += `    N${i + 1} --> N${i + 2}\n`;
    } else {
      result += `    N${i + 1} -->|${mermaidLabel(label)}| N${i + 2}\n`;
    }
  }
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    result += `    style N${i + 1} fill:${workflowNodeFillColor(node.status)}\n`;
  }
  return result;
}

function buildWorkflowPlanXML(
  def: WorkflowDefinition,
  run: WorkflowRun,
  nodes: WorkflowRunNodeResponse[]
): string {
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  let xml = `<workflow name="${escapeXmlAttr(def.name)}" path="${escapeXmlAttr(def.path)}" run_id="${run.id}" status="${escapeXmlAttr(run.status)}">\n`;
  for (const node of nodes) {
    xml += `  <node id="${escapeXmlAttr(node.id)}" step_id="${node.step_id}" name="${escapeXmlAttr(node.name)}" position="${node.position}" status="${escapeXmlAttr(node.status)}" iteration="${node.iteration}"`;
    if (node.duration) {
      xml += ` duration="${escapeXmlAttr(node.duration)}"`;
    }
    xml += `></node>\n`;
  }
  xml += `</workflow>`;
  return header + xml;
}

function escapeXmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/repos/:owner/:repo/workflows — List workflow definitions
app.get("/api/repos/:owner/:repo/workflows", async (c) => {
  const pag = parsePagination(c);
  if ("error" in pag) return c.json({ message: pag.error }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const defs = await workflowService.listWorkflowDefinitions(repositoryID, pag.page, pag.limit);
  return c.json({ workflows: defs }, 200);
});

// GET /api/repos/:owner/:repo/workflows/:id — Get workflow definition
app.get("/api/repos/:owner/:repo/workflows/:id", async (c) => {
  const rawID = c.req.param("id");
  const defID = parsePositiveInt64Param(rawID, "invalid workflow id");
  if (defID === null) return c.json({ message: "invalid workflow id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const def = await workflowService.getWorkflowDefinition(repositoryID, defID);
  if (!def) return c.json({ message: "workflow definition not found" }, 404);
  return c.json(def, 200);
});

// GET /api/repos/:owner/:repo/workflows/:id/runs — List runs for a workflow definition
app.get("/api/repos/:owner/:repo/workflows/:id/runs", async (c) => {
  const rawID = c.req.param("id");
  const defID = parsePositiveInt64Param(rawID, "invalid workflow id");
  if (defID === null) return c.json({ message: "invalid workflow id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));

  // Verify the workflow definition exists for this repo.
  const def = await workflowService.getWorkflowDefinition(repositoryID, defID);
  if (!def) return c.json({ message: "workflow definition not found" }, 404);

  const pag = parsePagination(c);
  if ("error" in pag) return c.json({ message: pag.error }, 400);

  const runs = await workflowService.listWorkflowRunsByDefinition(
    repositoryID,
    defID,
    pag.page,
    pag.limit
  );
  return c.json({ workflow_runs: runs }, 200);
});

// POST /api/repos/:owner/:repo/workflows/:id/dispatches — Dispatch workflow by numeric ID
app.post("/api/repos/:owner/:repo/workflows/:id/dispatches", async (c) => {
  const rawID = c.req.param("id");
  const defID = parsePositiveInt64Param(rawID, "invalid workflow id");
  if (defID === null) return c.json({ message: "invalid workflow id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const userID = getUser(c)?.id ?? 0;

  let body: { ref?: string; inputs?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "invalid request body" }, 400);
  }

  const def = await workflowService.getWorkflowDefinition(repositoryID, defID);
  if (!def) return c.json({ message: "workflow definition not found" }, 404);

  const ref = body.ref || "main"; // fallback to default bookmark

  // Validate dispatch inputs against the definition's input schema.
  const mergedInputs = workflowService.validateDispatchInputs(def.config, body.inputs);

  await workflowService.dispatchForEvent({
    repositoryID,
    userID,
    workflowDefinitionID: defID,
    event: {
      type: "workflow_dispatch",
      ref,
      inputs: mergedInputs ?? undefined,
    },
  });

  return c.body(null, 204);
});

// POST /api/repos/:owner/:repo/workflows/:name/dispatch — Dispatch workflow by name/path identifier
app.post("/api/repos/:owner/:repo/workflows/:name/dispatch", async (c) => {
  const identifier = c.req.param("name")?.trim();
  if (!identifier) return c.json({ message: "invalid workflow identifier" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const userID = getUser(c)?.id ?? 0;

  let body: { ref?: string; inputs?: Record<string, unknown> };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "invalid request body" }, 400);
  }

  const ref = (body.ref ?? "").trim() || "main";

  // Resolve identifier: try numeric ID first, then name/path match
  let def: WorkflowDefinition | null = null;
  const numericID = parseInt(identifier, 10);
  if (!isNaN(numericID) && numericID > 0) {
    def = await workflowService.getWorkflowDefinition(repositoryID, numericID);
  }
  if (!def) {
    const allDefs = await workflowService.listWorkflowDefinitions(repositoryID, 1, 1000);
    def = allDefs.find((d) => workflowIdentifierMatches(d, identifier)) ?? null;
  }
  if (!def) return c.json({ message: "workflow definition not found" }, 404);

  const mergedInputs = workflowService.validateDispatchInputs(def.config, body.inputs);

  await workflowService.dispatchForEvent({
    repositoryID,
    userID,
    workflowDefinitionID: def.id,
    event: {
      type: "workflow_dispatch",
      ref,
      inputs: mergedInputs ?? undefined,
    },
  });

  return c.body(null, 204);
});

// GET /api/repos/:owner/:repo/actions/runs — List all workflow runs for repo
app.get("/api/repos/:owner/:repo/actions/runs", async (c) => {
  const pag = parsePagination(c);
  if ("error" in pag) return c.json({ message: pag.error }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const runs = await workflowService.listWorkflowRunsByRepo(repositoryID, pag.page, pag.limit);
  return c.json({ workflow_runs: runs }, 200);
});

// GET /api/repos/:owner/:repo/workflows/runs — List workflow runs (v2 with state filter + definition names)
app.get("/api/repos/:owner/:repo/workflows/runs", async (c) => {
  const pag = parsePagination(c);
  if ("error" in pag) return c.json({ message: pag.error }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  let runs = await workflowService.listWorkflowRunsByRepo(repositoryID, pag.page, pag.limit);

  // Apply state filter if provided.
  const stateFilter = (c.req.query("state") ?? "").trim();
  if (stateFilter) {
    runs = runs.filter((run) => workflowRunMatchesState(run.status, stateFilter));
  }

  // Build definition map for enriching run responses.
  const allDefs = await workflowService.listWorkflowDefinitions(repositoryID, 1, 1000);
  const defMap = new Map<number, WorkflowDefinition>();
  for (const def of allDefs) {
    defMap.set(def.id, def);
  }

  const enrichedRuns = runs.map((run) => {
    const def = defMap.get(run.workflow_definition_id);
    return {
      ...run,
      workflow_name: def?.name ?? "",
      workflow_path: def?.path ?? "",
    };
  });

  return c.json({ runs: enrichedRuns }, 200);
});

// GET /api/repos/:owner/:repo/actions/runs/:id — Get single workflow run
app.get("/api/repos/:owner/:repo/actions/runs/:id", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const run = await workflowService.getWorkflowRun(repositoryID, runID);
  if (!run) return c.json({ message: "workflow run not found" }, 404);
  return c.json(run, 200);
});

// GET /api/repos/:owner/:repo/workflows/runs/:id — Get workflow run (v2 inspection response)
app.get("/api/repos/:owner/:repo/workflows/runs/:id", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const run = await workflowService.getWorkflowRun(repositoryID, runID);
  if (!run) return c.json({ message: "workflow run not found" }, 404);

  const def = await workflowService.getWorkflowDefinition(repositoryID, run.workflow_definition_id);
  if (!def) return c.json({ message: "workflow definition not found" }, 404);

  const steps = await workflowService.listWorkflowSteps(run.id);
  const nodes = buildWorkflowRunNodes(steps);

  return c.json(
    {
      run,
      workflow: { id: def.id, name: def.name, path: def.path },
      nodes,
      mermaid: buildWorkflowRunMermaid(nodes),
      plan_xml: buildWorkflowPlanXML(def, run, nodes),
    },
    200
  );
});

// GET /api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId — Get workflow run node detail
app.get("/api/repos/:owner/:repo/workflows/runs/:id/nodes/:nodeId", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const nodeID = (c.req.param("nodeId") ?? "").trim();
  if (!nodeID) return c.json({ message: "invalid node id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const run = await workflowService.getWorkflowRun(repositoryID, runID);
  if (!run) return c.json({ message: "workflow run not found" }, 404);

  const def = await workflowService.getWorkflowDefinition(repositoryID, run.workflow_definition_id);
  if (!def) return c.json({ message: "workflow definition not found" }, 404);

  const steps = await workflowService.listWorkflowSteps(run.id);
  const matched = steps.find((s) => workflowNodeMatches(s, nodeID));
  if (!matched) return c.json({ message: "workflow node not found" }, 404);

  const logs = await workflowService.listWorkflowLogsSince(run.id, 0, 10000);
  const nodeLogs = logs
    .filter((log) => log.workflow_step_id === matched.id)
    .map((log) => ({
      id: log.id,
      sequence: log.sequence,
      stream: log.stream,
      entry: log.entry,
      created_at: log.created_at,
    }));

  const nodes = buildWorkflowRunNodes(steps);
  return c.json(
    {
      run_id: run.id,
      node: toWorkflowRunNodeResponse(matched),
      logs: nodeLogs,
      output: null,
      plan_xml: buildWorkflowPlanXML(def, run, nodes),
      mermaid: buildWorkflowRunMermaid(nodes),
    },
    200
  );
});

// GET /api/repos/:owner/:repo/actions/runs/:id/steps — List steps for a workflow run
app.get("/api/repos/:owner/:repo/actions/runs/:id/steps", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));

  // Verify the run exists and belongs to this repository.
  const run = await workflowService.getWorkflowRun(repositoryID, runID);
  if (!run) return c.json({ message: "workflow run not found" }, 404);

  const steps = await workflowService.listWorkflowSteps(runID);
  const stepResponses = steps.map((s) => ({
    id: s.id,
    workflow_run_id: s.workflow_run_id,
    name: s.name,
    position: s.position,
    status: s.status,
    started_at: s.started_at,
    completed_at: s.completed_at,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));

  return c.json({ steps: stepResponses }, 200);
});

// POST /api/repos/:owner/:repo/actions/runs/:id/cancel — Cancel a workflow run
app.post("/api/repos/:owner/:repo/actions/runs/:id/cancel", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  await workflowService.cancelWorkflowRun(repositoryID, runID);
  return c.body(null, 204);
});

// POST /api/repos/:owner/:repo/workflows/runs/:id/cancel — Cancel a workflow run (v2 path)
app.post("/api/repos/:owner/:repo/workflows/runs/:id/cancel", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  await workflowService.cancelWorkflowRun(repositoryID, runID);
  return c.body(null, 204);
});

// POST /api/repos/:owner/:repo/actions/runs/:id/rerun — Rerun a workflow run
app.post("/api/repos/:owner/:repo/actions/runs/:id/rerun", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const userID = getUser(c)?.id ?? 0;

  // Optional JSON body (matches Go decodeOptionalJSONBody behavior).
  // Body is currently unused (rerunWorkflowRunRequest is empty struct in Go).

  const result = await workflowService.rerunRun({ repositoryID, runID, userID });
  if (!result) return c.json({ message: "workflow run not found" }, 404);

  return c.json(
    {
      workflow_definition_id: result.workflow_definition_id,
      workflow_run_id: result.workflow_run_id,
      steps: result.steps,
    },
    201
  );
});

// POST /api/repos/:owner/:repo/workflows/runs/:id/rerun — Rerun a workflow run (v2 path)
app.post("/api/repos/:owner/:repo/workflows/runs/:id/rerun", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const userID = getUser(c)?.id ?? 0;

  const result = await workflowService.rerunRun({ repositoryID, runID, userID });
  if (!result) return c.json({ message: "workflow run not found" }, 404);

  return c.json(
    {
      workflow_definition_id: result.workflow_definition_id,
      workflow_run_id: result.workflow_run_id,
      steps: result.steps,
    },
    201
  );
});

// POST /api/repos/:owner/:repo/workflows/runs/:id/resume — Resume a cancelled/failed workflow run
app.post("/api/repos/:owner/:repo/workflows/runs/:id/resume", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  await workflowService.resumeRun(repositoryID, runID);
  return c.body(null, 204);
});

// GET /api/repos/:owner/:repo/runs/:id/logs — SSE stream for workflow run logs
// Mirrors Go's WorkflowRunLogsStream in internal/routes/workflow_runs.go.
//
// Channels:
//   - workflow_run_events_{runId}     — run status changes
//   - workflow_step_logs_{stepId}     — per-step log lines
//
// Supports Last-Event-ID header for replaying missed logs after disconnect.
// Event types: "log", "status", "done"
app.get("/api/repos/:owner/:repo/runs/:id/logs", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const run = await workflowService.getWorkflowRun(repositoryID, runID);
  if (!run) return c.json({ message: "workflow run not found" }, 404);

  const steps = await workflowService.listWorkflowSteps(runID);
  const terminal = isTerminalStatus(run.status);

  // Build initial status payload (mirrors Go marshalWorkflowRunStatusPayload)
  const statusPayload = JSON.stringify({
    run,
    steps: steps.map((s) => ({
      id: s.id,
      workflow_run_id: s.workflow_run_id,
      name: s.name,
      position: s.position,
      status: s.status,
      started_at: s.started_at,
      completed_at: s.completed_at,
      created_at: s.created_at,
      updated_at: s.updated_at,
    })),
  });

  // Build initial events array
  const initialEvents: SSEEvent[] = [];

  // Handle Last-Event-ID replay
  const lastEventIDRaw = c.req.header("Last-Event-ID");
  if (lastEventIDRaw) {
    const lastEventID = parseInt(lastEventIDRaw, 10);
    if (!isNaN(lastEventID) && lastEventID > 0) {
      const missed = await workflowService.listWorkflowLogsSince(runID, lastEventID, 1000);
      for (const log of missed) {
        initialEvents.push({
          id: String(log.id),
          type: "log",
          data: JSON.stringify({
            log_id: log.id,
            step: log.workflow_step_id,
            line: log.sequence,
            content: log.entry,
            stream: log.stream,
          }),
        });
      }
    }
  }

  // Always send current status
  initialEvents.push({ type: "status", data: statusPayload });

  // If the run is already terminal, send done and close immediately
  if (terminal) {
    initialEvents.push({ type: "done", data: statusPayload });
    return sseStaticResponse(initialEvents);
  }

  // Subscribe to live events on all relevant channels
  const sse = getServices().sse;
  const runEventsChannel = `workflow_run_events_${runID}`;
  const channels = [runEventsChannel];
  for (const step of steps) {
    channels.push(`workflow_step_logs_${step.id}`);
  }

  // Use multi-channel subscription so we can distinguish event sources
  const liveStream = sse.subscribeMulti(channels);

  const stream = sseStreamWithInitial(initialEvents, liveStream);
  return sseResponse(stream);
});

// GET /api/repos/:owner/:repo/workflows/runs/:id/events — SSE workflow run events
// Alias for workflow run event stream — mirrors /runs/:id/logs but focused on
// status events (no log replay via Last-Event-ID).
//
// Channel: workflow_run_events_{runId}
// Event types: "status", "done"
app.get("/api/repos/:owner/:repo/workflows/runs/:id/events", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const repositoryID = Number(await resolveRepoId(c));
  const run = await workflowService.getWorkflowRun(repositoryID, runID);
  if (!run) return c.json({ message: "workflow run not found" }, 404);

  const steps = await workflowService.listWorkflowSteps(runID);
  const terminal = isTerminalStatus(run.status);

  const statusPayload = JSON.stringify({
    run,
    steps: steps.map((s) => ({
      id: s.id,
      workflow_run_id: s.workflow_run_id,
      name: s.name,
      position: s.position,
      status: s.status,
      started_at: s.started_at,
      completed_at: s.completed_at,
      created_at: s.created_at,
      updated_at: s.updated_at,
    })),
  });

  const initialEvents: SSEEvent[] = [
    { type: "status", data: statusPayload },
  ];

  // If the run is already terminal, send done and close immediately
  if (terminal) {
    initialEvents.push({ type: "done", data: statusPayload });
    return sseStaticResponse(initialEvents);
  }

  // Subscribe to live run events
  const sse = getServices().sse;
  const channel = `workflow_run_events_${runID}`;
  const liveStream = sse.subscribe(channel, {
    eventType: "status",
  });

  const stream = sseStreamWithInitial(initialEvents, liveStream);
  return sseResponse(stream);
});

// ---------------------------------------------------------------------------
// Workflow artifacts
// ---------------------------------------------------------------------------

// GET /api/repos/:owner/:repo/actions/runs/:id/artifacts — List artifacts for a run
app.get("/api/repos/:owner/:repo/actions/runs/:id/artifacts", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  // TODO: stub — return empty list
  return c.json({ artifacts: [] }, 200);
});

// GET /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name/download — Download artifact
app.get("/api/repos/:owner/:repo/actions/runs/:id/artifacts/:name/download", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const name = c.req.param("name");
  if (!name) return c.json({ message: "artifact name is required" }, 400);

  // TODO: stub
  return c.json({ message: "artifact not found" }, 404);
});

// DELETE /api/repos/:owner/:repo/actions/runs/:id/artifacts/:name — Delete artifact
app.delete("/api/repos/:owner/:repo/actions/runs/:id/artifacts/:name", async (c) => {
  const runID = parsePositiveInt64Param(c.req.param("id"), "invalid run id");
  if (runID === null) return c.json({ message: "invalid run id" }, 400);

  const name = c.req.param("name");
  if (!name) return c.json({ message: "artifact name is required" }, 400);

  // TODO: stub
  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// Workflow cache
// ---------------------------------------------------------------------------

// GET /api/repos/:owner/:repo/actions/cache — List caches
app.get("/api/repos/:owner/:repo/actions/cache", async (c) => {
  // TODO: stub
  return c.json([], 200);
});

// DELETE /api/repos/:owner/:repo/actions/cache — Clear caches
app.delete("/api/repos/:owner/:repo/actions/cache", async (c) => {
  // TODO: stub
  return c.json({ deleted_count: 0 }, 200);
});

// GET /api/repos/:owner/:repo/actions/cache/stats — Cache stats
app.get("/api/repos/:owner/:repo/actions/cache/stats", async (c) => {
  // TODO: stub
  return c.json(
    {
      total_count: 0,
      total_size_bytes: 0,
    },
    200
  );
});

export default app;
