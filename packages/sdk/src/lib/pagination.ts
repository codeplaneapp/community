import type { Context } from "hono";
import { badRequest } from "./errors";

/**
 * Pagination helpers matching Go's routes pagination functions.
 * Supports both cursor-based and legacy page/per_page pagination.
 */

/**
 * parsePagination extracts cursor-based pagination parameters from a request.
 * Returns cursor (opaque string, empty for first page) and limit (default 30, max 100).
 * Matches Go's parsePagination.
 *
 * @throws {APIError} on invalid pagination values
 */
export function parsePagination(c: Context): { cursor: string; limit: number } {
  const rawPage = (c.req.query("page") ?? "").trim();
  const rawPerPage = (c.req.query("per_page") ?? "").trim();

  // Legacy pagination — page + per_page query params
  if (rawPage !== "" || rawPerPage !== "") {
    return parseLegacyPagination(rawPage, rawPerPage);
  }

  // Cursor-based pagination
  const cursor = (c.req.query("cursor") ?? "").trim();
  let limit = 30;

  const rawLimit = (c.req.query("limit") ?? "").trim();
  if (rawLimit !== "") {
    const parsed = parseInt(rawLimit, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw badRequest("invalid limit value");
    }
    limit = parsed > 100 ? 100 : parsed;
  }

  return { cursor, limit };
}

function parseLegacyPagination(rawPage: string, rawPerPage: string): { cursor: string; limit: number } {
  let page = 1;
  let limit = 30;

  if (rawPage !== "") {
    const parsed = parseInt(rawPage, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw badRequest("invalid page value");
    }
    page = parsed;
  }

  if (rawPerPage !== "") {
    const parsed = parseInt(rawPerPage, 10);
    if (isNaN(parsed) || parsed <= 0) {
      throw badRequest("invalid per_page value");
    }
    if (parsed > 100) {
      throw badRequest("per_page must not exceed 100");
    }
    limit = parsed;
  }

  const offset = (page - 1) * limit;
  const cursor = offset > 0 ? String(offset) : "";
  return { cursor, limit };
}

/**
 * cursorToPage converts a cursor and limit into a 1-based page number.
 * Bridge helper for services that still accept (page, perPage) parameters.
 * Matches Go's cursorToPage.
 */
export function cursorToPage(cursor: string, limit: number): number {
  if (cursor === "") return 1;
  const offset = parseInt(cursor, 10);
  if (isNaN(offset) || offset < 0) return 1;
  const effectiveLimit = limit > 0 ? limit : 30;
  return Math.floor(offset / effectiveLimit) + 1;
}

/**
 * setPaginationHeaders sets X-Total-Count header on the response.
 * Matches Go's setPaginationHeaders (simplified — Link header generation
 * will be added when needed).
 */
export function setPaginationHeaders(c: Context, total: number): void {
  c.header("X-Total-Count", String(total));
}

/**
 * parseInt64Param parses a route param as a 64-bit integer.
 * Matches Go's parseInt64RouteParam.
 *
 * @throws {APIError} if the param is missing or not a valid integer
 */
export function parseInt64Param(c: Context, key: string, missingMessage: string, invalidMessage: string): number {
  const raw = (c.req.param(key) ?? "").trim();
  if (raw === "") {
    throw badRequest(missingMessage);
  }
  const value = parseInt(raw, 10);
  if (isNaN(value)) {
    throw badRequest(invalidMessage);
  }
  return value;
}

/**
 * requireStringParam extracts and validates a non-empty route param.
 * Matches Go's routeParam.
 *
 * @throws {APIError} if the param is missing or empty
 */
export function requireStringParam(c: Context, key: string, missingMessage: string): string {
  const value = (c.req.param(key) ?? "").trim();
  if (value === "") {
    throw badRequest(missingMessage);
  }
  return value;
}

/**
 * repoOwnerAndName extracts owner and repo from route params.
 * Matches Go's repoOwnerAndName.
 *
 * @throws {APIError} if owner or repo is missing
 */
export function repoOwnerAndName(c: Context): { owner: string; repo: string } {
  const owner = requireStringParam(c, "owner", "owner is required");
  const repo = requireStringParam(c, "repo", "repository name is required");
  return { owner, repo };
}

/**
 * requireAuth extracts the authenticated user from the context.
 * Matches Go's requireRouteUser.
 *
 * @throws {APIError} if no user is authenticated
 */
export { getUser } from "./context";
