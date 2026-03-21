import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";

export const variable = Cli.create("variable", {
  description: "Manage variables",
})
  .command("list", {
    description: "List variables",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/variables`);
    },
  })
  .command("get", {
    description: "Get a variable value",
    args: z.object({
      name: z.string().describe("Variable name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/variables/${c.args.name}`);
    },
  })
  .command("set", {
    description: "Set a variable",
    args: z.object({
      name: z.string().describe("Variable name"),
    }),
    options: z.object({
      body: z.string().describe("Variable value"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("PUT", `/api/repos/${owner}/${repo}/variables`, {
        name: c.args.name,
        value: c.options.body,
      });
    },
  })
  .command("delete", {
    description: "Delete a variable",
    args: z.object({
      name: z.string().describe("Variable name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await api("DELETE", `/api/repos/${owner}/${repo}/variables/${c.args.name}`);
      return { status: "deleted", name: c.args.name };
    },
  });
