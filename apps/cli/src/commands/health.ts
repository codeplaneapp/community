import { Cli, z } from "incur";
import { loadConfig } from "../config.js";

export const health = Cli.create("health", {
  description: "Check API server health",
  options: z.object({
    url: z.string().optional().describe("API URL to check (defaults to configured API URL)"),
  }),
  async run(c) {
    const config = loadConfig();
    const apiUrl = c.options.url ?? config.api_url ?? "http://localhost:3000";
    const healthUrl = `${apiUrl}/api/health`;

    try {
      const start = performance.now();
      const res = await fetch(healthUrl);
      const elapsed = Math.round(performance.now() - start);
      const body = await res.json();

      if (res.ok && body.status === "ok") {
        return {
          status: "healthy",
          url: apiUrl,
          response_ms: elapsed,
        };
      }

      return {
        status: "unhealthy",
        url: apiUrl,
        http_status: res.status,
        response_ms: elapsed,
        body,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: "unreachable",
        url: apiUrl,
        error: message,
      };
    }
  },
});
