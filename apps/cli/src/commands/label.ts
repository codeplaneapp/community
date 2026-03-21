import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";

export const label = Cli.create("label", {
  description: "Manage labels",
})
  .command("create", {
    description: "Create a label",
    args: z.object({
      name: z.string().describe("Label name"),
    }),
    options: z.object({
      color: z.string().default("").describe("Label color (hex)"),
      description: z.string().default("").describe("Label description"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/labels`, {
        name: c.args.name,
        color: c.options.color,
        description: c.options.description,
      });
    },
  })
  .command("list", {
    description: "List labels",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/labels`);
    },
  })
  .command("delete", {
    description: "Delete a label",
    args: z.object({
      id: z.coerce.number().describe("Label ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await api("DELETE", `/api/repos/${owner}/${repo}/labels/${c.args.id}`);
      return { status: "deleted", id: c.args.id };
    },
  });
