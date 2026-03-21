/**
 * Feature flag middleware for JJHub Community Edition.
 *
 * Provides Hono middleware that checks feature flags on specific routes.
 * Returns 403 when a feature is disabled for the requesting user/plan.
 *
 * In CE, all features are enabled by default (no plan restrictions).
 * The Cloud version overrides the FeatureFlagProvider to restrict
 * features based on subscription plans.
 *
 * Matches Go's internal/routes/flags.go pattern.
 */

import { createMiddleware } from "hono/factory";
import type { Context, Next } from "hono";
import {
  type FeatureFlagName,
  getFeatureFlagService,
  forbidden,
  writeError,
  getUser,
} from "@jjhub/sdk";

// ---------------------------------------------------------------------------
// requireFeature — route-level middleware
// ---------------------------------------------------------------------------

/**
 * Hono middleware that gates a route behind a feature flag.
 *
 * If the flag is disabled (for the current user/plan), the request
 * is rejected with 403 and a JSON body:
 *   { "message": "feature not available on your plan" }
 *
 * Usage:
 *   app.get("/api/v1/workspaces", requireFeature("workspaces"), handler);
 *
 * For CE this is essentially a no-op (all flags default to enabled).
 */
export function requireFeature(flagName: FeatureFlagName) {
  return createMiddleware(async (c: Context, next: Next) => {
    const svc = getFeatureFlagService();
    const user = getUser(c);
    const enabled = await svc.isEnabled(flagName, user?.id);

    if (!enabled) {
      return writeError(c, forbidden("feature not available on your plan"));
    }

    return next();
  });
}

// ---------------------------------------------------------------------------
// Feature flags API route handler
// ---------------------------------------------------------------------------

/**
 * GET /api/feature-flags handler.
 * Returns all current flag values as { flags: Record<string, boolean> }.
 * Public endpoint (no auth required) — matches Go's FeatureFlagHandler.
 */
export async function handleGetFeatureFlags(c: Context): Promise<Response> {
  const svc = getFeatureFlagService();
  return c.json({ flags: svc.getAllFlags() }, 200);
}
