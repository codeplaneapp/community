/**
 * Landing Request preview environment routes.
 *
 * These routes manage preview environments for Landing Requests:
 *   GET    /api/repos/:owner/:repo/landings/:number/preview — Get preview status
 *   POST   /api/repos/:owner/:repo/landings/:number/preview — Create/trigger preview
 *   DELETE /api/repos/:owner/:repo/landings/:number/preview — Delete preview
 *
 * The preview reverse proxy is handled separately via the previewProxy middleware
 * mounted in the main server entry point.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { APIError, getUser } from "@codeplane/sdk";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleServiceError(c: Context, err: unknown) {
  if (err instanceof APIError) {
    return c.json({ message: err.message }, err.status as any);
  }
  return c.json({ message: "internal server error" }, 500);
}

/** Extract :owner and :repo from route params. */
function repoOwnerAndName(c: Context): { owner: string; repo: string } {
  const owner = (c.req.param("owner") ?? "").trim();
  const repo = (c.req.param("repo") ?? "").trim();
  if (!owner) return { owner: "", repo: "" };
  if (!repo) return { owner, repo: "" };
  return { owner, repo };
}

/** Extract and validate :number from route params. */
function parseLRNumber(c: Context): number | null {
  const raw = (c.req.param("number") ?? "").trim();
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/repos/:owner/:repo/landings/:number/preview — Get preview status
app.get(
  "/api/repos/:owner/:repo/landings/:number/preview",
  async (c) => {
    try {
      const { owner, repo } = repoOwnerAndName(c);
      if (!owner || !repo) {
        return c.json({ message: "owner and repo are required" }, 400);
      }

      const lrNumber = parseLRNumber(c);
      if (!lrNumber) {
        return c.json({ message: "valid landing request number is required" }, 400);
      }

      // Use repositoryId 0 for now — will be resolved via repo context middleware
      const repositoryId = 0; // TODO: from repo context middleware

      const preview = await getServices().preview.getPreview(
        repositoryId,
        lrNumber
      );

      if (!preview) {
        return c.json({ message: "no preview environment for this landing request" }, 404);
      }

      return c.json(preview, 200);
    } catch (err) {
      return handleServiceError(c, err);
    }
  }
);

// POST /api/repos/:owner/:repo/landings/:number/preview — Create/trigger preview
app.post(
  "/api/repos/:owner/:repo/landings/:number/preview",
  async (c) => {
    try {
      const { owner, repo } = repoOwnerAndName(c);
      if (!owner || !repo) {
        return c.json({ message: "owner and repo are required" }, 400);
      }

      const lrNumber = parseLRNumber(c);
      if (!lrNumber) {
        return c.json({ message: "valid landing request number is required" }, 400);
      }

      // Parse optional config from request body
      let body: {
        port?: number;
        install?: string;
        start?: string;
        env?: Record<string, string>;
      } = {};
      try {
        body = await c.req.json();
      } catch {
        // Empty body is acceptable — use defaults
      }

      const repositoryId = 0; // TODO: from repo context middleware

      const config = body.start
        ? {
            port: body.port ?? 3000,
            install: body.install,
            start: body.start,
            env: body.env,
          }
        : undefined;

      const preview = await getServices().preview.createPreview({
        repositoryId,
        lrNumber,
        repoOwner: owner,
        repoName: repo,
        config,
      });

      return c.json(preview, 201);
    } catch (err) {
      return handleServiceError(c, err);
    }
  }
);

// DELETE /api/repos/:owner/:repo/landings/:number/preview — Delete preview
app.delete(
  "/api/repos/:owner/:repo/landings/:number/preview",
  async (c) => {
    try {
      const { owner, repo } = repoOwnerAndName(c);
      if (!owner || !repo) {
        return c.json({ message: "owner and repo are required" }, 400);
      }

      const lrNumber = parseLRNumber(c);
      if (!lrNumber) {
        return c.json({ message: "valid landing request number is required" }, 400);
      }

      const repositoryId = 0; // TODO: from repo context middleware

      await getServices().preview.deletePreview(repositoryId, lrNumber);

      return c.body(null, 204);
    } catch (err) {
      return handleServiceError(c, err);
    }
  }
);

export default app;
