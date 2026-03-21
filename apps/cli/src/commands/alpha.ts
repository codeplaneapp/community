import { Cli, z } from "incur";
import { api } from "../client.js";
import { loadConfig } from "../config.js";

export const beta = Cli.create("beta", {
  description: "Manage closed alpha whitelist and waitlist",
});

export const waitlist = Cli.create("waitlist", {
  description: "Manage waitlist entries",
})
  .command("join", {
    description: "Join the closed alpha waitlist",
    options: z.object({
      email: z.string().describe("Email to submit"),
      note: z.string().default("").describe("Optional note for admins"),
      source: z.string().default("cli").describe("Source tag"),
    }),
    async run(c) {
      const config = loadConfig();
      const baseUrl = config.api_url.replace(/\/$/, "");
      // Waitlist join is unauthenticated — use fetch directly
      const res = await fetch(`${baseUrl}/api/alpha/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: c.options.email.trim(),
          note: c.options.note,
          source: c.options.source.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? `API ${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
  })
  .command("list", {
    description: "List waitlist entries (admin)",
    options: z.object({
      status: z.string().optional().describe("Filter by status (pending, approved, rejected)"),
      page: z.number().default(1).describe("Page number"),
      "per-page": z.number().default(50).describe("Results per page"),
    }),
    async run(c) {
      const params = new URLSearchParams();
      params.set("page", String(c.options.page));
      params.set("per_page", String(c.options["per-page"]));
      if (c.options.status) params.set("status", c.options.status);
      return api("GET", `/api/admin/alpha/waitlist?${params}`);
    },
  })
  .command("approve", {
    description: "Approve a waitlist entry by email (admin)",
    options: z.object({
      email: z.string().describe("Email to approve"),
    }),
    async run(c) {
      return api("POST", "/api/admin/alpha/waitlist/approve", {
        email: c.options.email.trim(),
      });
    },
  });

export const whitelist = Cli.create("whitelist", {
  description: "Manage whitelist entries",
})
  .command("add", {
    description: "Add or update a whitelist entry (admin)",
    options: z.object({
      type: z.string().describe("Identity type: email, wallet, username"),
      value: z.string().describe("Identity value"),
    }),
    async run(c) {
      return api("POST", "/api/admin/alpha/whitelist", {
        identity_type: c.options.type,
        identity_value: c.options.value.trim(),
      });
    },
  })
  .command("list", {
    description: "List whitelist entries (admin)",
    async run() {
      return api("GET", "/api/admin/alpha/whitelist");
    },
  })
  .command("remove", {
    description: "Remove a whitelist entry (admin)",
    options: z.object({
      type: z.string().describe("Identity type: email, wallet, username"),
      value: z.string().describe("Identity value"),
    }),
    async run(c) {
      await api("DELETE", `/api/admin/alpha/whitelist/${c.options.type}/${encodeURIComponent(c.options.value.trim())}`);
      return {
        removed: true,
        identity_type: c.options.type,
        identity_value: c.options.value.trim(),
      };
    },
  });
