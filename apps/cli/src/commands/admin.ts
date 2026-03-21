import { Cli, z } from "incur";
import { api } from "../client.js";

export const adminUser = Cli.create("user", {
  description: "Manage users (admin)",
})
  .command("list", {
    description: "List all users",
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/admin/users?page=${c.options.page}&limit=${c.options.limit}`,
      );
    },
  })
  .command("create", {
    description: "Create a user",
    options: z.object({
      username: z.string().describe("Username"),
      email: z.string().describe("Email address"),
      password: z.string().optional().describe("Password (generated if omitted)"),
      "must-change-password": z
        .boolean()
        .default(true)
        .describe("Require password change on first login"),
    }),
    async run(c) {
      return api("POST", "/api/admin/users", {
        username: c.options.username,
        email: c.options.email,
        ...(c.options.password && { password: c.options.password }),
        must_change_password: c.options["must-change-password"],
      });
    },
  })
  .command("disable", {
    description: "Disable a user",
    args: z.object({
      username: z.string().describe("Username to disable"),
    }),
    async run(c) {
      return api("PATCH", `/api/admin/users/${c.args.username}`, {
        active: false,
      });
    },
  })
  .command("delete", {
    description: "Delete a user",
    args: z.object({
      username: z.string().describe("Username to delete"),
    }),
    async run(c) {
      await api("DELETE", `/api/admin/users/${c.args.username}`);
      return { status: "deleted", username: c.args.username };
    },
  });

export const adminRunner = Cli.create("runner", {
  description: "Manage runners (admin)",
})
  .command("list", {
    description: "List runners and pool status",
    async run() {
      return api("GET", "/api/admin/runners");
    },
  });

export const adminWorkflow = Cli.create("workflow", {
  description: "Manage workflows (admin)",
})
  .command("list", {
    description: "List all workflow runs (cross-repo)",
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
      status: z
        .string()
        .optional()
        .describe("Filter by status (running, success, failure, queued)"),
    }),
    async run(c) {
      const params = new URLSearchParams();
      params.set("page", String(c.options.page));
      params.set("limit", String(c.options.limit));
      if (c.options.status) params.set("status", c.options.status);
      return api("GET", `/api/admin/workflows/runs?${params}`);
    },
  });

export const admin = Cli.create("admin", {
  description: "Admin commands",
})
  .command(adminUser)
  .command(adminRunner)
  .command(adminWorkflow)
  .command("health", {
    description: "System health status",
    async run() {
      return api("GET", "/api/admin/system/health");
    },
  });
