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

interface CreateReleaseRequest {
  tag_name: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface PatchReleaseRequest {
  tag_name?: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface ReleaseAssetUploadRequest {
  name: string;
  size: number;
  content_type?: string;
}

interface PatchReleaseAssetRequest {
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function optionalBoolQuery(
  query: URLSearchParams,
  key: string,
): { value: boolean; error?: string } {
  const raw = query.get(key);
  if (!raw) return { value: false };
  if (raw === "true" || raw === "1") return { value: true };
  if (raw === "false" || raw === "0") return { value: false };
  return { value: false, error: `invalid ${key} value` };
}

/** Lazily resolve the release service from the registry on each request. */
function service() {
  return getServices().release;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/repos/:owner/:repo/releases
app.get("/api/repos/:owner/:repo/releases", async (c) => {
  const viewer = getUser(c);
  const { owner, repo } = c.req.param();
  const query = new URL(c.req.url).searchParams;

  const excludeDrafts = optionalBoolQuery(query, "exclude_drafts");
  if (excludeDrafts.error) {
    return writeError(c, badRequest(excludeDrafts.error));
  }
  const excludePrereleases = optionalBoolQuery(query, "exclude_prereleases");
  if (excludePrereleases.error) {
    return writeError(c, badRequest(excludePrereleases.error));
  }

  const page = parseInt(query.get("page") ?? "1", 10);
  const perPage = Math.min(parseInt(query.get("per_page") ?? "30", 10), 50);

  try {
    const { items, total } = await service().listReleases(viewer, owner, repo, {
      page,
      perPage,
      excludeDrafts: excludeDrafts.value,
      excludePrereleases: excludePrereleases.value,
    });
    c.header("X-Total-Count", String(total));
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/releases
app.post("/api/repos/:owner/:repo/releases", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo } = c.req.param();

  let body: CreateReleaseRequest;
  try {
    body = await c.req.json<CreateReleaseRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const created = await service().createRelease(actor, owner, repo, {
      tagName: body.tag_name,
      target: body.target_commitish,
      title: body.name,
      body: body.body,
      draft: body.draft ?? false,
      prerelease: body.prerelease ?? false,
    });
    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/releases/latest
app.get("/api/repos/:owner/:repo/releases/latest", async (c) => {
  const viewer = getUser(c);
  const { owner, repo } = c.req.param();

  try {
    const release = await service().getLatestRelease(viewer, owner, repo);
    return writeJSON(c, 200, release);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/releases/tags/* (wildcard tag param)
app.get("/api/repos/:owner/:repo/releases/tags/*", async (c) => {
  const viewer = getUser(c);
  const { owner, repo } = c.req.param();
  // Extract tag from the wildcard portion of the path
  const fullPath = c.req.path;
  const tagsPrefix = `/api/repos/${owner}/${repo}/releases/tags/`;
  const tag = fullPath.slice(tagsPrefix.length);

  if (!tag) {
    return writeError(c, badRequest("release tag is required"));
  }

  try {
    const release = await service().getReleaseByTag(viewer, owner, repo, tag);
    return writeJSON(c, 200, release);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/releases/tags/* (wildcard tag param)
app.delete("/api/repos/:owner/:repo/releases/tags/*", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo } = c.req.param();
  const fullPath = c.req.path;
  const tagsPrefix = `/api/repos/${owner}/${repo}/releases/tags/`;
  const tag = fullPath.slice(tagsPrefix.length);

  if (!tag) {
    return writeError(c, badRequest("release tag is required"));
  }

  try {
    await service().deleteReleaseByTag(actor, owner, repo, tag);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/releases/:id
app.get("/api/repos/:owner/:repo/releases/:id", async (c) => {
  const viewer = getUser(c);
  const { owner, repo, id } = c.req.param();

  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) {
    return writeError(c, badRequest("invalid release id"));
  }

  try {
    const release = await service().getRelease(viewer, owner, repo, releaseId);
    return writeJSON(c, 200, release);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/releases/:id
app.patch("/api/repos/:owner/:repo/releases/:id", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, id } = c.req.param();

  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) {
    return writeError(c, badRequest("invalid release id"));
  }

  let body: PatchReleaseRequest;
  try {
    body = await c.req.json<PatchReleaseRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const updated = await service().updateRelease(actor, owner, repo, releaseId, {
      tagName: body.tag_name,
      target: body.target_commitish,
      title: body.name,
      body: body.body,
      draft: body.draft,
      prerelease: body.prerelease,
    });
    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// DELETE /api/repos/:owner/:repo/releases/:id
app.delete("/api/repos/:owner/:repo/releases/:id", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, id } = c.req.param();

  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) {
    return writeError(c, badRequest("invalid release id"));
  }

  try {
    await service().deleteRelease(actor, owner, repo, releaseId);
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---------------------------------------------------------------------------
// Release Assets
// ---------------------------------------------------------------------------

// GET /api/repos/:owner/:repo/releases/:id/assets
app.get("/api/repos/:owner/:repo/releases/:id/assets", async (c) => {
  const viewer = getUser(c);
  const { owner, repo, id } = c.req.param();

  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) {
    return writeError(c, badRequest("invalid release id"));
  }

  try {
    const assets = await service().listReleaseAssets(
      viewer,
      owner,
      repo,
      releaseId,
    );
    return writeJSON(c, 200, assets);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id
app.get("/api/repos/:owner/:repo/releases/:id/assets/:asset_id", async (c) => {
  const viewer = getUser(c);
  const { owner, repo, id, asset_id } = c.req.param();

  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) {
    return writeError(c, badRequest("invalid release id"));
  }
  const assetId = parseInt(asset_id, 10);
  if (isNaN(assetId)) {
    return writeError(c, badRequest("invalid release asset id"));
  }

  try {
    const asset = await service().getReleaseAsset(
      viewer,
      owner,
      repo,
      releaseId,
      assetId,
    );
    return writeJSON(c, 200, asset);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/releases/:id/assets
app.post("/api/repos/:owner/:repo/releases/:id/assets", async (c) => {
  const actor = getUser(c);
  if (!actor) {
    return writeError(c, unauthorized("authentication required"));
  }
  const { owner, repo, id } = c.req.param();

  const releaseId = parseInt(id, 10);
  if (isNaN(releaseId)) {
    return writeError(c, badRequest("invalid release id"));
  }

  let body: ReleaseAssetUploadRequest;
  try {
    body = await c.req.json<ReleaseAssetUploadRequest>();
  } catch {
    return writeError(c, badRequest("invalid request body"));
  }

  try {
    const result = await service().attachAsset(actor, owner, repo, releaseId, {
      name: body.name,
      size: body.size,
      contentType: body.content_type,
    });
    return writeJSON(c, 201, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/releases/:id/assets/:asset_id/confirm
app.post(
  "/api/repos/:owner/:repo/releases/:id/assets/:asset_id/confirm",
  async (c) => {
    const actor = getUser(c);
    if (!actor) {
      return writeError(c, unauthorized("authentication required"));
    }
    const { owner, repo, id, asset_id } = c.req.param();

    const releaseId = parseInt(id, 10);
    if (isNaN(releaseId)) {
      return writeError(c, badRequest("invalid release id"));
    }
    const assetId = parseInt(asset_id, 10);
    if (isNaN(assetId)) {
      return writeError(c, badRequest("invalid release asset id"));
    }

    try {
      const asset = await service().confirmAssetUpload(
        actor,
        owner,
        repo,
        releaseId,
        assetId,
      );
      return writeJSON(c, 200, asset);
    } catch (err) {
      return writeRouteError(c, err);
    }
  },
);

// PATCH /api/repos/:owner/:repo/releases/:id/assets/:asset_id
app.patch(
  "/api/repos/:owner/:repo/releases/:id/assets/:asset_id",
  async (c) => {
    const actor = getUser(c);
    if (!actor) {
      return writeError(c, unauthorized("authentication required"));
    }
    const { owner, repo, id, asset_id } = c.req.param();

    const releaseId = parseInt(id, 10);
    if (isNaN(releaseId)) {
      return writeError(c, badRequest("invalid release id"));
    }
    const assetId = parseInt(asset_id, 10);
    if (isNaN(assetId)) {
      return writeError(c, badRequest("invalid release asset id"));
    }

    let body: PatchReleaseAssetRequest;
    try {
      body = await c.req.json<PatchReleaseAssetRequest>();
    } catch {
      return writeError(c, badRequest("invalid request body"));
    }

    try {
      const asset = await service().updateReleaseAsset(
        actor,
        owner,
        repo,
        releaseId,
        assetId,
        { name: body.name },
      );
      return writeJSON(c, 200, asset);
    } catch (err) {
      return writeRouteError(c, err);
    }
  },
);

// DELETE /api/repos/:owner/:repo/releases/:id/assets/:asset_id
app.delete(
  "/api/repos/:owner/:repo/releases/:id/assets/:asset_id",
  async (c) => {
    const actor = getUser(c);
    if (!actor) {
      return writeError(c, unauthorized("authentication required"));
    }
    const { owner, repo, id, asset_id } = c.req.param();

    const releaseId = parseInt(id, 10);
    if (isNaN(releaseId)) {
      return writeError(c, badRequest("invalid release id"));
    }
    const assetId = parseInt(asset_id, 10);
    if (isNaN(assetId)) {
      return writeError(c, badRequest("invalid release asset id"));
    }

    try {
      await service().removeAsset(actor, owner, repo, releaseId, assetId);
      return c.body(null, 204);
    } catch (err) {
      return writeRouteError(c, err);
    }
  },
);

// GET /api/repos/:owner/:repo/releases/:id/assets/:asset_id/download
app.get(
  "/api/repos/:owner/:repo/releases/:id/assets/:asset_id/download",
  async (c) => {
    const viewer = getUser(c);
    const { owner, repo, id, asset_id } = c.req.param();

    const releaseId = parseInt(id, 10);
    if (isNaN(releaseId)) {
      return writeError(c, badRequest("invalid release id"));
    }
    const assetId = parseInt(asset_id, 10);
    if (isNaN(assetId)) {
      return writeError(c, badRequest("invalid release asset id"));
    }

    try {
      const result = await service().getReleaseAssetDownloadURL(
        viewer,
        owner,
        repo,
        releaseId,
        assetId,
      );
      return writeJSON(c, 200, result);
    } catch (err) {
      return writeRouteError(c, err);
    }
  },
);

export default app;
