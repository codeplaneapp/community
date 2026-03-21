import { Hono } from "hono";

const app = new Hono();

// Health handles GET /health and related health-check endpoints.
// Matches Go's routes.Health — returns a simple status response.
app.get("/health", (c) => c.json({ status: "ok" }, 200));
app.get("/healthz", (c) => c.json({ status: "ok" }, 200));
app.get("/readyz", (c) => c.json({ status: "ok" }, 200));
app.get("/api/health", (c) => c.json({ status: "ok" }, 200));

export default app;
