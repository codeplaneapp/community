import { Cli, z } from "incur";
import { requireAuthToken } from "../auth-state.js";

export const apiCmd = Cli.create("api", {
  description: "Make raw API calls to the JJHub server",
  args: z.object({
    endpoint: z.string().describe("API endpoint path (e.g. /repos/owner/name)"),
  }),
  options: z.object({
    method: z.string().default("GET").describe("HTTP method"),
    field: z.array(z.string()).default([]).describe("Request body field (key=value)"),
    header: z.array(z.string()).default([]).describe("Request header (key:value)"),
  }),
  async run(c) {
    const method = c.options.method.toUpperCase();
    const validMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    if (!validMethods.includes(method)) {
      throw new Error(
        `Invalid HTTP method '${method}'; expected one of: ${validMethods.join(", ")}`,
      );
    }

    if (!c.args.endpoint.startsWith("/")) {
      throw new Error("Endpoint must begin with '/'");
    }

    // Parse -f key=value fields into JSON body
    let body: Record<string, string> | undefined;
    if (c.options.field.length > 0) {
      body = {};
      for (const field of c.options.field) {
        const eq = field.indexOf("=");
        if (eq === -1) {
          throw new Error(`Field must be in key=value format: ${field}`);
        }
        body[field.slice(0, eq)] = field.slice(eq + 1);
      }
    }

    // Parse -H key:value headers
    const extraHeaders: Record<string, string> = {};
    for (const h of c.options.header) {
      const colon = h.indexOf(":");
      if (colon === -1) {
        throw new Error(`Header must be in key:value format: ${h}`);
      }
      extraHeaders[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
    }

    const auth = requireAuthToken();
    const baseUrl = auth.apiUrl;
    const headers: Record<string, string> = {
      Authorization: `token ${auth.token}`,
      Accept: "application/json",
      ...extraHeaders,
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${baseUrl}${c.args.endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const parsed = JSON.parse(text) as { message?: string };
        detail = parsed.message || text || res.statusText;
      } catch {
        detail = text || res.statusText;
      }
      throw new Error(detail);
    }

    if (text.length === 0) {
      return undefined;
    }

    try {
      return JSON.parse(text);
    } catch {
      // Not JSON — print raw
      process.stdout.write(text);
      return undefined;
    }
  },
});
