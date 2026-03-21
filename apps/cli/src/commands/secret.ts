import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";
import { readStdinText } from "../stdin.js";

export const secret = Cli.create("secret", {
  description: "Manage secrets",
})
  .command("list", {
    description: "List secrets",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/secrets`);
    },
  })
  .command("set", {
    description: "Set a secret",
    args: z.object({
      name: z.string().describe("Secret name"),
    }),
    options: z.object({
      "body-stdin": z.boolean().default(false).describe("Read the secret value from stdin"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      if (!c.options["body-stdin"]) {
        throw new Error("secret values must be provided via stdin with --body-stdin");
      }

      const value = await readStdinText("secret value");
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/secrets`, {
        name: c.args.name,
        value,
      });
    },
  })
  .command("delete", {
    description: "Delete a secret",
    args: z.object({
      name: z.string().describe("Secret name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await api("DELETE", `/api/repos/${owner}/${repo}/secrets/${c.args.name}`);
      return { status: "deleted", name: c.args.name };
    },
  });
