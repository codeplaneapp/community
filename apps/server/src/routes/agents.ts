import { Hono } from "hono";
import {
  getUser,
  badRequest,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
} from "@jjhub/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateAgentSessionRequest {
  title: string;
}

interface CreateAgentMessagePartRequest {
  type: string;
  content: unknown;
}

interface CreateAgentMessageRequest {
  role: string;
  parts: CreateAgentMessagePartRequest[];
}

// ---------------------------------------------------------------------------
// Validation — matches Go's agent_sessions.go
// ---------------------------------------------------------------------------

const VALID_AGENT_MESSAGE_ROLES = new Set([
  "user",
  "assistant",
  "system",
  "tool",
]);

const VALID_AGENT_MESSAGE_PART_TYPES = new Set([
  "text",
  "tool_call",
  "tool_result",
]);

function normalizeAgentMessageParts(
  parts: CreateAgentMessagePartRequest[],
): { normalized: any[]; error?: string } {
  if (!parts || parts.length === 0) {
    return { normalized: [], error: "parts are required" };
  }

  const normalized: any[] = [];
  for (const part of parts) {
    const partType = (part.type ?? "").trim();
    if (!VALID_AGENT_MESSAGE_PART_TYPES.has(partType)) {
      return { normalized: [], error: "invalid part type" };
    }

    const result = normalizeAgentMessagePartContent(partType, part.content);
    if (result.error) {
      return { normalized: [], error: result.error };
    }

    normalized.push({
      partType,
      content: result.content,
    });
  }

  return { normalized };
}

function normalizeAgentMessagePartContent(
  partType: string,
  raw: unknown,
): { content: unknown; error?: string } {
  if (raw === undefined || raw === null) {
    return { content: null, error: "part content is required" };
  }

  if (typeof raw === "string") {
    if (partType !== "text") {
      return {
        content: null,
        error: `part content must be an object for ${partType}`,
      };
    }
    // Normalize bare string to { value: string } for text parts
    return { content: { value: raw } };
  }

  // Already an object, pass through
  return { content: raw };
}

// ---------------------------------------------------------------------------
// Service stub — agent service not fully implemented in the SDK yet.
// These stubs will be replaced when the agent service is added.
// ---------------------------------------------------------------------------

const service = {
  createSession: async (_input: any): Promise<any> => ({}),
  getSession: async (_sessionId: string): Promise<any> => ({}),
  getSessionForRepo: async (
    _sessionId: string,
    _repoId: number,
  ): Promise<void> => {},
  listSessions: async (
    _repositoryId: number,
    _page: number,
    _perPage: number,
  ): Promise<{ items: any[]; total: number }> => ({ items: [], total: 0 }),
  deleteSession: async (
    _sessionId: string,
    _userId: number,
  ): Promise<void> => {},
  appendMessage: async (
    _sessionId: string,
    _role: string,
    _parts: any[],
  ): Promise<any> => ({}),
  listMessages: async (
    _sessionId: string,
    _page: number,
    _perPage: number,
  ): Promise<any[]> => [],
  dispatchAgentRun: async (_input: any): Promise<any> => ({}),
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// POST /api/repos/:owner/:repo/agent/sessions
app.post("/api/repos/:owner/:repo/agent/sessions", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  let body: CreateAgentSessionRequest;
  try {
    body = await c.req.json<CreateAgentSessionRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const session = await service.createSession({
      repositoryId: 0, // Will be set from repo context in real implementation
      userId: user.id,
      title: (body.title ?? "").trim(),
    });
    return writeJSON(c, 201, session);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/agent/sessions
app.get("/api/repos/:owner/:repo/agent/sessions", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  try {
    const { items, total } = await service.listSessions(0, page, perPage);
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/agent/sessions/:id
app.get("/api/repos/:owner/:repo/agent/sessions/:id", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  if (!id.trim()) {
    return writeError(c, badRequest("session id is required"));
  }

  try {
    const session = await service.getSession(id);
    return writeJSON(c, 200, session);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/agent/sessions/:id
app.delete("/api/repos/:owner/:repo/agent/sessions/:id", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  if (!id.trim()) {
    return writeError(c, badRequest("session id is required"));
  }

  try {
    await service.deleteSession(id, user.id);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/agent/sessions/:id/messages
app.post("/api/repos/:owner/:repo/agent/sessions/:id/messages", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  if (!id.trim()) {
    return writeError(c, badRequest("session id is required"));
  }

  let body: CreateAgentMessageRequest;
  try {
    body = await c.req.json<CreateAgentMessageRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  const role = (body.role ?? "").trim();
  if (!VALID_AGENT_MESSAGE_ROLES.has(role)) {
    return writeError(c, badRequest("invalid role"));
  }

  const { normalized, error: partsError } = normalizeAgentMessageParts(
    body.parts,
  );
  if (partsError) {
    return writeError(c, badRequest(partsError));
  }

  try {
    const msg = await service.appendMessage(id, role, normalized);

    // If the role is "user", dispatch an agent run
    if (role === "user") {
      try {
        await service.dispatchAgentRun({
          sessionId: id,
          repositoryId: 0,
          userId: user.id,
          triggerMessageId: msg.id,
        });
      } catch (dispatchErr) {
        return writeRouteError(c, dispatchErr);
      }
    }

    return writeJSON(c, 201, msg);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/agent/sessions/:id/messages
app.get("/api/repos/:owner/:repo/agent/sessions/:id/messages", async (c) => {
  const user = getUser(c);
  if (!user) {
    return writeError(c, unauthorized("authentication required"));
  }

  const { id } = c.req.param();
  if (!id.trim()) {
    return writeError(c, badRequest("session id is required"));
  }

  const query = new URL(c.req.url).searchParams;
  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  try {
    const messages = await service.listMessages(id, page, perPage);
    return writeJSON(c, 200, messages);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/agent/sessions/:id/stream (SSE placeholder)
app.get("/api/repos/:owner/:repo/agent/sessions/:id/stream", async (c) => {
  // SSE streaming requires a real PostgreSQL LISTEN/NOTIFY connection.
  // This is a placeholder; Community Edition can implement via polling or
  // alternative transport.
  return writeJSON(c, 501, { message: "SSE streaming not implemented in Community Edition" });
});

export default app;
