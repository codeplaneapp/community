import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";

import { initDb, initDbSync, closeDb, getDb, getDbMode, getBlobStore, CleanupScheduler, getFeatureFlagService } from "@jjhub/sdk";
import {
  requestId,
  authLoader,
  jsonContentType,
  rateLimit,
} from "./lib/middleware";
import { handleGetFeatureFlags } from "./lib/feature-flags";
import { initServices, getServices } from "./services";
import { startSSHServer, stopSSHServer } from "./ssh";

import health from "./routes/health";
import auth from "./routes/auth";
import users from "./routes/users";
import repos from "./routes/repos";
import jj from "./routes/jj";
import issues from "./routes/issues";
import landings from "./routes/landings";
import workflows from "./routes/workflows";
import workspaces from "./routes/workspaces";
import orgs from "./routes/orgs";
import labels from "./routes/labels";
import milestones from "./routes/milestones";
import releases from "./routes/releases";
import webhooks from "./routes/webhooks";
import search from "./routes/search";
import wiki from "./routes/wiki";
import secrets from "./routes/secrets";
import agents from "./routes/agents";
import notifications from "./routes/notifications";
import admin from "./routes/admin";
import oauth2 from "./routes/oauth2";
import lfs from "./routes/lfs";
import integrations from "./routes/integrations";
import daemon from "./routes/daemon";
import previews from "./routes/previews";
import billing from "./routes/billing";

// ---------------------------------------------------------------------------
// Initialize database connection and service registry
// ---------------------------------------------------------------------------
await initDb();
initServices();

// Initialize feature flags (loads from env / provider)
const featureFlags = getFeatureFlagService();
await featureFlags.loadFeatureFlags();

// Start SSH server (git transport + workspace SSH)
startSSHServer().catch((err) => {
  console.error("Failed to start SSH server:", err.message);
  // Non-fatal: HTTP server continues without SSH support
});

// Start background cleanup workers
const cleanupScheduler = new CleanupScheduler(getDb(), {
  blobStore: getBlobStore(),
});
cleanupScheduler.start();

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();

// Middleware stack — order matches Go's required middleware stack:
// 1. RequestID
// 2. Logger (structured)
// 3. CORS
// 4. Rate limiting (simple in-memory, 120 req/min per identity)
// 5. Content-Type enforcement (application/json for mutations)
// 6. Auth loader (populates user context if credentials present)
app.use("*", requestId);
app.use("*", logger());
app.use("*", cors());
app.use("*", rateLimit(120));
app.use("*", jsonContentType);
app.use("*", authLoader);

// Feature flags endpoint (public, no auth required — matches Go's FeatureFlagHandler)
app.get("/api/feature-flags", handleGetFeatureFlags);

// Mount all route modules
app.route("/", health);
app.route("/", auth);
app.route("/", users);
app.route("/", repos);
app.route("/", jj);
app.route("/", issues);
app.route("/", landings);
app.route("/", workflows);
app.route("/", workspaces);
app.route("/", orgs);
app.route("/", labels);
app.route("/", milestones);
app.route("/", releases);
app.route("/", webhooks);
app.route("/", search);
app.route("/", wiki);
app.route("/", secrets);
app.route("/", agents);
app.route("/", notifications);
app.route("/", admin);
app.route("/", oauth2);
app.route("/", lfs);
app.route("/", integrations);
app.route("/", daemon);
app.route("/", previews);
app.route("/", billing);

const port = parseInt(process.env.JJHUB_PORT ?? "3000");

console.log(`JJHub Community Edition starting on port ${port}`);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  cleanupScheduler.stop();
  await getServices().preview.cleanup();
  await stopSSHServer();
  await closeDb();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  cleanupScheduler.stop();
  await getServices().preview.cleanup();
  await stopSSHServer();
  await closeDb();
  process.exit(0);
});

export default {
  port,
  fetch: app.fetch,
};
