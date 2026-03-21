import { Hono } from "hono";
import type { Context } from "hono";
import {
  badRequest,
  unauthorized,
  internal,
  getUser,
  writeJSON,
  writeRouteError,
} from "@jjhub/sdk";
import { Result } from "better-result";
import { getServices } from "../services";

// ---------------------------------------------------------------------------
// Types — match Go's services.* input/response structs exactly
// ---------------------------------------------------------------------------

interface User {
  id: number;
  username: string;
}

interface CreateLandingRequestInput {
  title: string;
  body: string;
  target_bookmark: string;
  source_bookmark: string;
  change_ids: string[];
}

interface UpdateLandingRequestInput {
  title?: string;
  body?: string;
  state?: string;
  target_bookmark?: string;
  source_bookmark?: string;
  conflict_status?: string;
}

interface CreateLandingReviewInput {
  type: string;
  body: string;
}

interface DismissLandingReviewInput {
  message: string;
}

interface CreateLandingCommentInput {
  path: string;
  line: number;
  side: string;
  body: string;
}

interface LandingRequestAuthor {
  id: number;
  login: string;
}

interface LandingRequestResponse {
  number: number;
  title: string;
  body: string;
  state: string;
  author: LandingRequestAuthor;
  change_ids: string[];
  target_bookmark: string;
  conflict_status: string;
  stack_size: number;
  created_at: string;
  updated_at: string;
}

interface LandingReviewResponse {
  id: number;
  landing_request_id: number;
  reviewer: LandingRequestAuthor;
  type: string;
  body: string;
  state: string;
  created_at: string;
  updated_at: string;
}

interface LandingCommentResponse {
  id: number;
  landing_request_id: number;
  author: LandingRequestAuthor;
  path: string;
  line: number;
  side: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface LandingRequestChange {
  id: number;
  landing_request_id: number;
  change_id: string;
  position_in_stack: number;
}

interface LandingConflict {
  file_path: string;
  conflict_type: string;
}

interface LandingConflictsResponse {
  conflict_status: string;
  has_conflicts: boolean;
  conflicts_by_change?: Record<string, LandingConflict[]>;
}

interface FileDiff {
  change_id: string;
  file_diffs: unknown[];
}

interface LandingDiffResponse {
  landing_number: number;
  changes: FileDiff[];
}

interface LandingDiffOptions {
  ignore_whitespace: boolean;
}

interface LandLandingRequestAccepted extends LandingRequestResponse {
  queue_position: number;
  task_id: number;
}

interface LandingRequestReview {
  id: number;
  landing_request_id: number;
  reviewer_id: number;
  type: string;
  body: string;
  state: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service interface — stubbed, DB calls will be wired later
// ---------------------------------------------------------------------------

interface LandingRouteService {
  listLandingRequests(
    viewer: User | null,
    owner: string,
    repo: string,
    page: number,
    perPage: number,
    state: string,
  ): Promise<{ items: LandingRequestResponse[]; total: number }>;

  createLandingRequest(
    actor: User,
    owner: string,
    repo: string,
    req: CreateLandingRequestInput,
  ): Promise<LandingRequestResponse>;

  getLandingRequest(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<LandingRequestResponse>;

  updateLandingRequest(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    req: UpdateLandingRequestInput,
  ): Promise<LandingRequestResponse>;

  landLandingRequest(
    actor: User,
    owner: string,
    repo: string,
    number: number,
  ): Promise<LandLandingRequestAccepted>;

  listLandingReviews(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<{ items: LandingReviewResponse[]; total: number }>;

  createLandingReview(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    req: CreateLandingReviewInput,
  ): Promise<LandingReviewResponse>;

  dismissLandingReview(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    reviewID: number,
    req: DismissLandingReviewInput,
  ): Promise<LandingRequestReview>;

  listLandingComments(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<{ items: LandingCommentResponse[]; total: number }>;

  createLandingComment(
    actor: User,
    owner: string,
    repo: string,
    number: number,
    req: CreateLandingCommentInput,
  ): Promise<LandingCommentResponse>;

  listLandingChanges(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    page: number,
    perPage: number,
  ): Promise<{ items: LandingRequestChange[]; total: number }>;

  getLandingConflicts(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
  ): Promise<LandingConflictsResponse>;

  getLandingDiff(
    viewer: User | null,
    owner: string,
    repo: string,
    number: number,
    opts: LandingDiffOptions,
  ): Promise<LandingDiffResponse>;
}

/** Lazily resolve the landing service from the registry on each request. */
function service() {
  return getServices().landing;
}

/**
 * Unwrap a Result value, throwing the error if it is an error.
 * This adapts the Result-returning LandingService to the throw-based route pattern.
 */
function unwrap<T>(result: any): T {
  if (Result.isError(result)) throw result.error;
  return result.value;
}

// ---------------------------------------------------------------------------
// Helpers — mirrors Go route helpers
// ---------------------------------------------------------------------------

/** Extract the authenticated user from context. Returns null if unauthenticated. */
function userFromContext(c: Context): User | null {
  const user = getUser(c);
  if (!user) return null;
  return { id: user.id, username: user.username };
}

/** Require an authenticated user or throw 401. Matches Go requireRouteUser. */
function requireRouteUser(c: Context): User {
  const user = userFromContext(c);
  if (!user) {
    throw unauthorized("authentication required");
  }
  return user;
}

/** Extract :owner and :repo from route params. Matches Go repoOwnerAndName. */
function repoOwnerAndName(c: Context): { owner: string; repo: string } {
  const owner = (c.req.param("owner") ?? "").trim();
  if (!owner) {
    throw badRequest("owner is required");
  }
  const repo = (c.req.param("repo") ?? "").trim();
  if (!repo) {
    throw badRequest("repository name is required");
  }
  return { owner, repo };
}

/**
 * Parse pagination from query string. Supports both cursor-based (cursor/limit)
 * and legacy page/per_page. Matches Go parsePagination + cursorToPage.
 */
function parsePagination(c: Context): { page: number; perPage: number } {
  const query = c.req.query();
  const rawPage = (query.page ?? "").trim();
  const rawPerPage = (query.per_page ?? "").trim();
  const rawCursor = (query.cursor ?? "").trim();
  const rawLimit = (query.limit ?? "").trim();

  // Legacy pagination
  if (rawPage || rawPerPage) {
    let page = 1;
    let perPage = 30;
    if (rawPage) {
      page = parseInt(rawPage, 10);
      if (isNaN(page) || page <= 0) {
        throw badRequest("invalid page value");
      }
    }
    if (rawPerPage) {
      perPage = parseInt(rawPerPage, 10);
      if (isNaN(perPage) || perPage <= 0) {
        throw badRequest("invalid per_page value");
      }
      if (perPage > 100) {
        throw badRequest("per_page must not exceed 100");
      }
    }
    return { page, perPage };
  }

  // Cursor-based pagination
  let limit = 30;
  if (rawLimit) {
    limit = parseInt(rawLimit, 10);
    if (isNaN(limit) || limit <= 0) {
      throw badRequest("invalid limit value");
    }
    if (limit > 100) {
      limit = 100;
    }
  }

  let offset = 0;
  if (rawCursor) {
    offset = parseInt(rawCursor, 10);
    if (isNaN(offset) || offset < 0) {
      offset = 0;
    }
  }

  const page = limit > 0 ? Math.floor(offset / limit) + 1 : 1;
  return { page, perPage: limit };
}

/**
 * Set pagination headers on the response. Matches Go setPaginationHeaders.
 */
function setPaginationHeaders(
  c: Context,
  page: number,
  perPage: number,
  _resultCount: number,
  total: number,
): void {
  c.header("X-Total-Count", String(total));

  const lastPage = total > 0 ? Math.ceil(total / perPage) : 1;
  const links: string[] = [];
  const basePath = new URL(c.req.url).pathname;

  links.push(`<${basePath}?page=1&per_page=${perPage}>; rel="first"`);
  links.push(
    `<${basePath}?page=${lastPage}&per_page=${perPage}>; rel="last"`,
  );
  if (page > 1) {
    links.push(
      `<${basePath}?page=${page - 1}&per_page=${perPage}>; rel="prev"`,
    );
  }
  if (page < lastPage) {
    links.push(
      `<${basePath}?page=${page + 1}&per_page=${perPage}>; rel="next"`,
    );
  }
  c.header("Link", links.join(", "));
}

/**
 * Extract :owner, :repo, and :number from route params.
 * Matches Go landingRouteContext.
 */
function landingRouteContext(c: Context): {
  owner: string;
  repo: string;
  number: number;
} {
  const { owner, repo } = repoOwnerAndName(c);
  const numberRaw = (c.req.param("number") ?? "").trim();
  if (!numberRaw) {
    throw badRequest("landing number is required");
  }
  const parsed = parseInt(numberRaw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw badRequest("invalid landing number");
  }
  return { owner, repo, number: parsed };
}

/** Check if whitespace should be ignored in diff. Matches Go diffWhitespaceIgnored. */
function diffWhitespaceIgnored(c: Context): boolean {
  const val = (c.req.query("ignore_whitespace") ?? "").trim().toLowerCase();
  return val === "true" || val === "1";
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const app = new Hono();

// GET /api/repos/:owner/:repo/landings — List landing requests
app.get("/api/repos/:owner/:repo/landings", async (c) => {
  try {
    const { owner, repo } = repoOwnerAndName(c);
    const { page, perPage } = parsePagination(c);
    const state = (c.req.query("state") ?? "").trim();

    const { items, total } = unwrap<{ items: LandingRequestResponse[]; total: number }>(await service().listLandingRequests(
      userFromContext(c),
      owner,
      repo,
      page,
      perPage,
      state,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/landings — Create landing request
app.post("/api/repos/:owner/:repo/landings", async (c) => {
  try {
    const user = requireRouteUser(c);
    const { owner, repo } = repoOwnerAndName(c);

    const body = await c.req.json<{
      title?: string;
      body?: string;
      target_bookmark?: string;
      source_bookmark?: string;
      change_ids?: string[];
    }>();

    const created = unwrap<LandingRequestResponse>(await service().createLandingRequest(user, owner, repo, {
      title: body.title ?? "",
      body: body.body ?? "",
      target_bookmark: body.target_bookmark ?? "",
      source_bookmark: body.source_bookmark ?? "",
      change_ids: body.change_ids ?? [],
    }));

    return writeJSON(c, 201, created);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/landings/:number — Get landing request
app.get("/api/repos/:owner/:repo/landings/:number", async (c) => {
  try {
    const { owner, repo, number } = landingRouteContext(c);

    const landing = unwrap<LandingRequestResponse>(await service().getLandingRequest(
      userFromContext(c),
      owner,
      repo,
      number,
    ));

    return writeJSON(c, 200, landing);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/landings/:number — Update landing request
app.patch("/api/repos/:owner/:repo/landings/:number", async (c) => {
  try {
    const user = requireRouteUser(c);
    const { owner, repo, number } = landingRouteContext(c);

    const body = await c.req.json<{
      title?: string;
      body?: string;
      state?: string;
      target_bookmark?: string;
      source_bookmark?: string;
      conflict_status?: string;
    }>();

    const updated = unwrap<LandingRequestResponse>(await service().updateLandingRequest(
      user,
      owner,
      repo,
      number,
      {
        title: body.title,
        body: body.body,
        state: body.state,
        target_bookmark: body.target_bookmark,
        source_bookmark: body.source_bookmark,
        conflict_status: body.conflict_status,
      },
    ));

    return writeJSON(c, 200, updated);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PUT /api/repos/:owner/:repo/landings/:number/land — Land (merge) landing request
app.put("/api/repos/:owner/:repo/landings/:number/land", async (c) => {
  try {
    const user = requireRouteUser(c);
    const { owner, repo, number } = landingRouteContext(c);

    const result = unwrap<LandLandingRequestAccepted>(await service().landLandingRequest(
      user,
      owner,
      repo,
      number,
    ));

    return writeJSON(c, 202, result);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/landings/:number/reviews — List reviews
app.get("/api/repos/:owner/:repo/landings/:number/reviews", async (c) => {
  try {
    const { owner, repo, number } = landingRouteContext(c);
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: LandingReviewResponse[]; total: number }>(await service().listLandingReviews(
      userFromContext(c),
      owner,
      repo,
      number,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/landings/:number/reviews — Create review
app.post("/api/repos/:owner/:repo/landings/:number/reviews", async (c) => {
  try {
    const user = requireRouteUser(c);
    const { owner, repo, number } = landingRouteContext(c);

    const body = await c.req.json<{
      type?: string;
      body?: string;
    }>();

    const review = unwrap<LandingReviewResponse>(await service().createLandingReview(
      user,
      owner,
      repo,
      number,
      {
        type: body.type ?? "",
        body: body.body ?? "",
      },
    ));

    return writeJSON(c, 201, review);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// PATCH /api/repos/:owner/:repo/landings/:number/reviews/:review_id — Dismiss review
app.patch(
  "/api/repos/:owner/:repo/landings/:number/reviews/:review_id",
  async (c) => {
    try {
      const user = requireRouteUser(c);
      const { owner, repo, number } = landingRouteContext(c);

      const reviewIdRaw = (c.req.param("review_id") ?? "").trim();
      if (!reviewIdRaw) {
        throw badRequest("review_id is required");
      }
      const reviewID = parseInt(reviewIdRaw, 10);
      if (isNaN(reviewID) || reviewID <= 0) {
        throw badRequest("invalid review_id");
      }

      // Body is optional for dismiss — matches Go decodeOptionalJSONBody
      let body: { message?: string } = {};
      try {
        body = await c.req.json<{ message?: string }>();
      } catch {
        // empty body is acceptable
      }

      const review = unwrap<LandingRequestReview>(await service().dismissLandingReview(
        user,
        owner,
        repo,
        number,
        reviewID,
        { message: body.message ?? "" },
      ));

      return writeJSON(c, 200, review);
    } catch (err) {
      return writeRouteError(c, err);
    }
  },
);

// GET /api/repos/:owner/:repo/landings/:number/comments — List comments
app.get("/api/repos/:owner/:repo/landings/:number/comments", async (c) => {
  try {
    const { owner, repo, number } = landingRouteContext(c);
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: LandingCommentResponse[]; total: number }>(await service().listLandingComments(
      userFromContext(c),
      owner,
      repo,
      number,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// POST /api/repos/:owner/:repo/landings/:number/comments — Create comment
app.post("/api/repos/:owner/:repo/landings/:number/comments", async (c) => {
  try {
    const user = requireRouteUser(c);
    const { owner, repo, number } = landingRouteContext(c);

    const body = await c.req.json<{
      path?: string;
      line?: number;
      side?: string;
      body?: string;
    }>();

    const comment = unwrap<LandingCommentResponse>(await service().createLandingComment(
      user,
      owner,
      repo,
      number,
      {
        path: body.path ?? "",
        line: body.line ?? 0,
        side: body.side ?? "",
        body: body.body ?? "",
      },
    ));

    return writeJSON(c, 201, comment);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/landings/:number/changes — List changes
app.get("/api/repos/:owner/:repo/landings/:number/changes", async (c) => {
  try {
    const { owner, repo, number } = landingRouteContext(c);
    const { page, perPage } = parsePagination(c);

    const { items, total } = unwrap<{ items: LandingRequestChange[]; total: number }>(await service().listLandingChanges(
      userFromContext(c),
      owner,
      repo,
      number,
      page,
      perPage,
    ));

    setPaginationHeaders(c, page, perPage, items.length, total);
    return writeJSON(c, 200, items);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/landings/:number/diff — Get diff
app.get("/api/repos/:owner/:repo/landings/:number/diff", async (c) => {
  try {
    const { owner, repo, number } = landingRouteContext(c);

    const diff = unwrap<LandingDiffResponse>(await service().getLandingDiff(
      userFromContext(c),
      owner,
      repo,
      number,
      { ignore_whitespace: diffWhitespaceIgnored(c) },
    ));

    return writeJSON(c, 200, diff);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

// GET /api/repos/:owner/:repo/landings/:number/conflicts — Get conflicts
app.get("/api/repos/:owner/:repo/landings/:number/conflicts", async (c) => {
  try {
    const { owner, repo, number } = landingRouteContext(c);

    const resp = unwrap<LandingConflictsResponse>(await service().getLandingConflicts(
      userFromContext(c),
      owner,
      repo,
      number,
    ));

    return writeJSON(c, 200, resp);
  } catch (err) {
    return writeRouteError(c, err);
  }
});

export default app;
