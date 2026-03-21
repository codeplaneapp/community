import { Hono } from "hono";
import {
  APIError,
  badRequest,
  unauthorized,
  writeError,
  writeJSON,
  writeRouteError,
  getUser,
  parsePagination,
  cursorToPage,
  setPaginationHeaders,
} from "@codeplane/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types — mirrors Go structs in internal/routes/repos.go & internal/services/repo.go
// ---------------------------------------------------------------------------

export interface CreateRepoRequest {
  name: string;
  description?: string;
  private?: boolean;
  auto_init: boolean;
  default_bookmark?: string;
}

export interface UpdateRepoRequest {
  name?: string;
  description?: string;
  private?: boolean;
  default_bookmark?: string;
  topics?: string[];
}

export interface TransferRepoRequest {
  new_owner: string;
}

export interface ForkRepoRequest {
  name?: string;
  description?: string;
}

export interface ReplaceRepoTopicsRequest {
  topics: string[];
}

export interface RepoResponse {
  id: number;
  owner: string;
  name: string;
  full_name: string;
  description: string;
  private: boolean;
  is_public: boolean;
  default_bookmark: string;
  topics: string[];
  is_archived: boolean;
  archived_at?: string;
  is_fork: boolean;
  fork_id?: number;
  num_stars: number;
  num_forks: number;
  num_watches: number;
  num_issues: number;
  clone_url: string;
  created_at: string;
  updated_at: string;
}

export interface RepoTopicsResponse {
  topics: string[];
}

export interface RepoStargazerResponse {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string;
}

// ---------------------------------------------------------------------------
// Response mapping — mirrors Go mapRepoResponse in internal/routes/repos.go
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRepoResponse(owner: string, repo: any, sshHost: string): RepoResponse {
  const trimmedOwner = (owner ?? "").trim() || "unknown";
  const host = (sshHost ?? "").trim() || "localhost";

  const resp: RepoResponse = {
    id: Number(repo.id),
    owner: trimmedOwner,
    name: repo.name,
    full_name: `${trimmedOwner}/${repo.name}`,
    description: repo.description ?? "",
    private: !repo.isPublic,
    is_public: repo.isPublic,
    default_bookmark: repo.defaultBookmark ?? "main",
    topics: repo.topics ?? [],
    is_archived: repo.isArchived ?? false,
    is_fork: repo.isFork ?? false,
    num_stars: Number(repo.numStars ?? 0),
    num_forks: Number(repo.numForks ?? 0),
    num_watches: Number(repo.numWatches ?? 0),
    num_issues: Number(repo.numIssues ?? 0),
    clone_url: `git@${host}:${trimmedOwner}/${repo.name}.git`,
    created_at: repo.createdAt instanceof Date ? repo.createdAt.toISOString() : String(repo.createdAt),
    updated_at: repo.updatedAt instanceof Date ? repo.updatedAt.toISOString() : String(repo.updatedAt),
  };

  if (repo.forkId != null) {
    resp.fork_id = Number(repo.forkId);
  }
  if (repo.archivedAt != null) {
    resp.archived_at = repo.archivedAt instanceof Date ? repo.archivedAt.toISOString() : String(repo.archivedAt);
  }

  return resp;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SSH_HOST = process.env.CODEPLANE_SSH_HOST ?? "ssh.codeplane.app";

/**
 * Build a RepoActor from the auth context user, or null if not authenticated.
 */
function actorFromUser(user: { id: number; username: string; is_admin?: boolean } | null) {
  if (!user) return null;
  return { id: user.id, username: user.username, isAdmin: user.is_admin ?? false };
}

async function decodeJSONBody<T>(c: { req: { json: () => Promise<T> } }): Promise<T | APIError> {
  try {
    return await c.req.json();
  } catch {
    return badRequest("invalid request body");
  }
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono();

// ---- POST /api/user/repos ----
app.post("/api/user/repos", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("not authenticated"));
    }

    const body = await decodeJSONBody<CreateRepoRequest>(c);
    if (body instanceof APIError) {
      return writeRouteError(c, body);
    }

    const actor = actorFromUser(user)!;
    const name = (body.name ?? "").trim();
    const description = body.description ?? "";
    const isPublic = body.private !== true;
    const defaultBookmark = (body.default_bookmark ?? "").trim() || "main";

    const result = await getServices().repo.createRepo(actor, name, description, isPublic, defaultBookmark, body.auto_init);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 201, mapRepoResponse(user.username, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- POST /api/orgs/:org/repos ----
app.post("/api/orgs/:org/repos", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const orgName = c.req.param("org")?.trim();
    if (!orgName) {
      return writeRouteError(c, badRequest("organization name is required"));
    }

    const body = await decodeJSONBody<CreateRepoRequest>(c);
    if (body instanceof APIError) {
      return writeRouteError(c, body);
    }

    const actor = actorFromUser(user)!;
    const name = (body.name ?? "").trim();
    const description = body.description ?? "";
    const isPublic = body.private !== true;
    const defaultBookmark = (body.default_bookmark ?? "").trim() || "main";

    const result = await getServices().repo.createOrgRepo(actor, orgName, name, description, isPublic, defaultBookmark, body.auto_init);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 201, mapRepoResponse(orgName, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- GET /api/repos/:owner/:repo ----
app.get("/api/repos/:owner/:repo", async (c) => {
  try {
    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const user = getUser(c);
    const actor = actorFromUser(user ?? null);

    const result = await getServices().repo.getRepo(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, mapRepoResponse(owner, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- PATCH /api/repos/:owner/:repo ----
app.patch("/api/repos/:owner/:repo", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const body = await decodeJSONBody<UpdateRepoRequest>(c);
    if (body instanceof APIError) {
      return writeRouteError(c, body);
    }

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.updateRepo(actor, owner, repoName, {
      name: body.name,
      description: body.description,
      private: body.private,
      default_bookmark: body.default_bookmark,
      topics: body.topics,
    });
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, mapRepoResponse(owner, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- DELETE /api/repos/:owner/:repo ----
app.delete("/api/repos/:owner/:repo", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.deleteRepo(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- GET /api/repos/:owner/:repo/topics ----
app.get("/api/repos/:owner/:repo/topics", async (c) => {
  try {
    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const user = getUser(c);
    const actor = actorFromUser(user ?? null);

    const result = await getServices().repo.getRepoTopics(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, { topics: result.value });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- PUT /api/repos/:owner/:repo/topics ----
app.put("/api/repos/:owner/:repo/topics", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const body = await decodeJSONBody<ReplaceRepoTopicsRequest>(c);
    if (body instanceof APIError) {
      return writeRouteError(c, body);
    }

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.replaceRepoTopics(actor, owner, repoName, body.topics ?? []);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, { topics: result.value });
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- GET /api/repos/:owner/:repo/stargazers ----
app.get("/api/repos/:owner/:repo/stargazers", async (c) => {
  try {
    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const { cursor, limit } = parsePagination(c);
    const page = cursorToPage(cursor, limit);
    const user = getUser(c);
    const actor = actorFromUser(user ?? null);

    const result = await getServices().repo.listRepoStargazers(actor, owner, repoName, page, limit);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }

    const stargazers: RepoStargazerResponse[] = result.value.users.map((u) => ({
      id: Number(u.id),
      username: u.username,
      display_name: u.displayName,
      avatar_url: u.avatarUrl,
    }));
    setPaginationHeaders(c, result.value.total);
    return writeJSON(c, 200, stargazers);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- PUT /api/user/starred/:owner/:repo ----
app.put("/api/user/starred/:owner/:repo", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.starRepo(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- DELETE /api/user/starred/:owner/:repo ----
app.delete("/api/user/starred/:owner/:repo", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.unstarRepo(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return c.body(null, 204);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- POST /api/repos/:owner/:repo/forks ----
app.post("/api/repos/:owner/:repo/forks", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    // Body is optional for fork — mirrors Go decodeOptionalJSONBody
    let body: ForkRepoRequest = {};
    try {
      const text = await c.req.text();
      if (text.trim() !== "") {
        body = JSON.parse(text);
      }
    } catch {
      return writeRouteError(c, badRequest("invalid request body"));
    }

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.forkRepo(
      actor,
      owner,
      repoName,
      body.name ?? "",
      body.description ?? "",
    );
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 202, mapRepoResponse(user.username, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- GET /api/repos/:owner/:repo/contents ----
// Contents endpoints require repo-host integration; keep as stubs.
app.get("/api/repos/:owner/:repo/contents", async (c) => {
  return writeRouteError(c, new APIError(501, "list repo contents not implemented"));
});

// ---- GET /api/repos/:owner/:repo/contents/* ----
app.get("/api/repos/:owner/:repo/contents/*", async (c) => {
  return writeRouteError(c, new APIError(501, "get repo contents not implemented"));
});

// ---- GET /api/repos/:owner/:repo/git/refs ----
app.get("/api/repos/:owner/:repo/git/refs", async (c) => {
  return writeRouteError(c, new APIError(501, "list git refs not implemented"));
});

// ---- GET /api/repos/:owner/:repo/git/trees/:sha ----
app.get("/api/repos/:owner/:repo/git/trees/:sha", async (c) => {
  return writeRouteError(c, new APIError(501, "git trees endpoint not implemented"));
});

// ---- GET /api/repos/:owner/:repo/git/commits/:sha ----
app.get("/api/repos/:owner/:repo/git/commits/:sha", async (c) => {
  return writeRouteError(c, new APIError(501, "git commits endpoint not implemented"));
});

// ---- POST /api/repos/:owner/:repo/archive ----
app.post("/api/repos/:owner/:repo/archive", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.archiveRepo(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, mapRepoResponse(owner, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- POST /api/repos/:owner/:repo/unarchive ----
app.post("/api/repos/:owner/:repo/unarchive", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const actor = actorFromUser(user)!;
    const result = await getServices().repo.unarchiveRepo(actor, owner, repoName);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, mapRepoResponse(owner, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- POST /api/repos/:owner/:repo/transfer ----
app.post("/api/repos/:owner/:repo/transfer", async (c) => {
  try {
    const user = getUser(c);
    if (!user) {
      return writeRouteError(c, unauthorized("authentication required"));
    }

    const owner = c.req.param("owner")?.trim();
    const repoName = c.req.param("repo")?.trim();
    if (!owner) return writeRouteError(c, badRequest("owner is required"));
    if (!repoName) return writeRouteError(c, badRequest("repository name is required"));

    const body = await decodeJSONBody<TransferRepoRequest>(c);
    if (body instanceof APIError) {
      return writeRouteError(c, body);
    }

    const newOwner = (body.new_owner ?? "").trim();
    const actor = actorFromUser(user)!;
    const result = await getServices().repo.transferRepo(actor, owner, repoName, newOwner);
    if (Result.isError(result)) {
      return writeRouteError(c, result.error);
    }
    return writeJSON(c, 200, mapRepoResponse(newOwner, result.value, SSH_HOST));
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// ---- Subscription (pass-through stubs — no SDK service yet) ----
app.get("/api/repos/:owner/:repo/subscription", (c) =>
  writeRouteError(c, new APIError(501, "get subscription not implemented"))
);

app.put("/api/repos/:owner/:repo/subscription", (c) =>
  writeRouteError(c, new APIError(501, "update subscription not implemented"))
);

app.delete("/api/repos/:owner/:repo/subscription", (c) =>
  writeRouteError(c, new APIError(501, "delete subscription not implemented"))
);

export default app;
