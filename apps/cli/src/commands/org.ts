import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";

// ── Team member subcommands ──────────────────────────────────────────

const teamMember = Cli.create("member", {
  description: "Manage team members",
})
  .command("list", {
    description: "List members in a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/orgs/${c.args.org}/teams/${c.args.team}/members`,
      );
    },
  })
  .command("add", {
    description: "Add a user to a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
      username: z.string().describe("Username to add"),
    }),
    async run(c) {
      return api(
        "PUT",
        `/api/orgs/${c.args.org}/teams/${c.args.team}/members/${c.args.username}`,
      );
    },
  })
  .command("remove", {
    description: "Remove a user from a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
      username: z.string().describe("Username to remove"),
    }),
    async run(c) {
      await api(
        "DELETE",
        `/api/orgs/${c.args.org}/teams/${c.args.team}/members/${c.args.username}`,
      );
      return {
        status: "removed",
        org: c.args.org,
        team: c.args.team,
        username: c.args.username,
      };
    },
  });

// ── Team repo subcommands ────────────────────────────────────────────

const teamRepo = Cli.create("repo", {
  description: "Manage team repository access",
})
  .command("list", {
    description: "List repositories assigned to a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/orgs/${c.args.org}/teams/${c.args.team}/repos`,
      );
    },
  })
  .command("add", {
    description: "Grant a team access to a repository",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.args.repo);
      return api(
        "PUT",
        `/api/orgs/${c.args.org}/teams/${c.args.team}/repos/${owner}/${repo}`,
      );
    },
  })
  .command("remove", {
    description: "Remove a repository from a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
      repo: z.string().describe("Repository in OWNER/REPO format"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.args.repo);
      await api(
        "DELETE",
        `/api/orgs/${c.args.org}/teams/${c.args.team}/repos/${owner}/${repo}`,
      );
      return {
        status: "removed",
        org: c.args.org,
        team: c.args.team,
        repo: `${owner}/${repo}`,
      };
    },
  });

// ── Team subcommands ─────────────────────────────────────────────────

const team = Cli.create("team", {
  description: "Manage organization teams",
})
  .command("list", {
    description: "List teams in an organization",
    args: z.object({
      org: z.string().describe("Organization name"),
    }),
    async run(c) {
      return api("GET", `/api/orgs/${c.args.org}/teams`);
    },
  })
  .command("create", {
    description: "Create a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      name: z.string().describe("Team name"),
    }),
    options: z.object({
      description: z.string().default("").describe("Team description"),
      permission: z
        .enum(["read", "write", "admin"])
        .default("read")
        .describe("Default permission level"),
    }),
    async run(c) {
      return api("POST", `/api/orgs/${c.args.org}/teams`, {
        name: c.args.name,
        description: c.options.description,
        permission: c.options.permission,
      });
    },
  })
  .command("view", {
    description: "View team details",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/orgs/${c.args.org}/teams/${c.args.team}`,
      );
    },
  })
  .command("edit", {
    description: "Update a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
    }),
    options: z.object({
      name: z.string().optional().describe("New team name"),
      description: z.string().optional().describe("New description"),
      permission: z
        .enum(["read", "write", "admin"])
        .optional()
        .describe("Default permission level"),
    }),
    async run(c) {
      const body: Record<string, string> = {};
      if (c.options.name) body.name = c.options.name;
      if (c.options.description !== undefined)
        body.description = c.options.description;
      if (c.options.permission) body.permission = c.options.permission;
      return api(
        "PATCH",
        `/api/orgs/${c.args.org}/teams/${c.args.team}`,
        body,
      );
    },
  })
  .command("delete", {
    description: "Delete a team",
    args: z.object({
      org: z.string().describe("Organization name"),
      team: z.string().describe("Team slug"),
    }),
    async run(c) {
      await api(
        "DELETE",
        `/api/orgs/${c.args.org}/teams/${c.args.team}`,
      );
      return {
        status: "deleted",
        org: c.args.org,
        team: c.args.team,
      };
    },
  })
  .command(teamMember)
  .command(teamRepo);

// ── Org member subcommands ───────────────────────────────────────────

const member = Cli.create("member", {
  description: "Manage organization members",
})
  .command("list", {
    description: "List members in an organization",
    args: z.object({
      org: z.string().describe("Organization name"),
    }),
    async run(c) {
      return api("GET", `/api/orgs/${c.args.org}/members`);
    },
  })
  .command("add", {
    description: "Add a member to an organization",
    args: z.object({
      org: z.string().describe("Organization name"),
      username: z.string().describe("Username to add"),
    }),
    async run(c) {
      return api("POST", `/api/orgs/${c.args.org}/members`, {
        username: c.args.username,
      });
    },
  })
  .command("remove", {
    description: "Remove a member from an organization",
    args: z.object({
      org: z.string().describe("Organization name"),
      username: z.string().describe("Username to remove"),
    }),
    async run(c) {
      await api(
        "DELETE",
        `/api/orgs/${c.args.org}/members/${c.args.username}`,
      );
      return {
        status: "removed",
        org: c.args.org,
        username: c.args.username,
      };
    },
  });

// ── Top-level org command ────────────────────────────────────────────

export const org = Cli.create("org", {
  description: "Organization and team management",
})
  .command("create", {
    description: "Create an organization",
    args: z.object({
      name: z.string().describe("Organization name"),
    }),
    options: z.object({
      description: z
        .string()
        .default("")
        .describe("Organization description"),
      visibility: z
        .enum(["public", "limited", "private"])
        .default("public")
        .describe("Organization visibility"),
    }),
    async run(c) {
      return api("POST", "/api/orgs", {
        username: c.args.name,
        description: c.options.description,
        visibility: c.options.visibility,
      });
    },
  })
  .command("list", {
    description: "List organizations for the authenticated user",
    async run() {
      return api("GET", "/api/user/orgs");
    },
  })
  .command("view", {
    description: "View organization details",
    args: z.object({
      name: z.string().describe("Organization name"),
    }),
    async run(c) {
      return api("GET", `/api/orgs/${c.args.name}`);
    },
  })
  .command("edit", {
    description: "Update organization settings",
    args: z.object({
      name: z.string().describe("Organization name"),
    }),
    options: z.object({
      description: z
        .string()
        .optional()
        .describe("New organization description"),
      visibility: z
        .enum(["public", "limited", "private"])
        .optional()
        .describe("Organization visibility"),
    }),
    async run(c) {
      const body: Record<string, string> = {};
      if (c.options.description !== undefined)
        body.description = c.options.description;
      if (c.options.visibility) body.visibility = c.options.visibility;
      return api("PATCH", `/api/orgs/${c.args.name}`, body);
    },
  })
  .command("delete", {
    description: "Delete an organization",
    args: z.object({
      name: z.string().describe("Organization name"),
    }),
    async run(c) {
      await api("DELETE", `/api/orgs/${c.args.name}`);
      return { status: "deleted", name: c.args.name };
    },
  })
  .command(member)
  .command(team);
