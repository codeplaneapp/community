import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";
import { readStdinText } from "../stdin.js";

export const webhook = Cli.create("webhook", {
  description: "Manage webhooks",
})
  .command("create", {
    description: "Create a webhook",
    options: z.object({
      url: z.string().describe("Webhook payload URL"),
      events: z.array(z.string()).default(["push"]).describe("Events to trigger on"),
      "secret-stdin": z.boolean().default(false).describe("Read the webhook secret from stdin"),
      "content-type": z
        .enum(["json", "form"])
        .default("json")
        .describe("Payload content type"),
      active: z.boolean().default(true).describe("Whether the webhook is active"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const secret = c.options["secret-stdin"]
        ? await readStdinText("webhook secret", { allowEmpty: true })
        : undefined;
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("POST", `/api/repos/${owner}/${repo}/hooks`, {
        type: "jjhub",
        config: {
          url: c.options.url,
          content_type: c.options["content-type"],
          ...(secret !== undefined ? { secret } : {}),
        },
        events: c.options.events,
        active: c.options.active,
      });
    },
  })
  .command("list", {
    description: "List webhooks",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api("GET", `/api/repos/${owner}/${repo}/hooks`);
    },
  })
  .command("view", {
    description: "View webhook details and recent deliveries",
    args: z.object({
      id: z.coerce.number().describe("Webhook ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const [hook, deliveries] = await Promise.all([
        api("GET", `/api/repos/${owner}/${repo}/hooks/${c.args.id}`),
        api("GET", `/api/repos/${owner}/${repo}/hooks/${c.args.id}/deliveries`),
      ]);
      return { hook, deliveries };
    },
  })
  .command("update", {
    description: "Update a webhook",
    args: z.object({
      id: z.coerce.number().describe("Webhook ID"),
    }),
    options: z.object({
      url: z.string().optional().describe("Webhook payload URL"),
      events: z.array(z.string()).optional().describe("Events to trigger on"),
      "secret-stdin": z.boolean().default(false).describe("Read the webhook secret from stdin"),
      active: z.boolean().optional().describe("Whether the webhook is active"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const secret = c.options["secret-stdin"]
        ? await readStdinText("webhook secret", { allowEmpty: true })
        : undefined;
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const body: Record<string, unknown> = {};
      if (c.options.url) {
        body.config = { url: c.options.url, ...(secret !== undefined ? { secret } : {}) };
      } else if (secret !== undefined) {
        body.config = { secret };
      }
      if (c.options.events) body.events = c.options.events;
      if (c.options.active !== undefined) body.active = c.options.active;
      return api("PATCH", `/api/repos/${owner}/${repo}/hooks/${c.args.id}`, body);
    },
  })
  .command("delete", {
    description: "Delete a webhook",
    args: z.object({
      id: z.coerce.number().describe("Webhook ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await api("DELETE", `/api/repos/${owner}/${repo}/hooks/${c.args.id}`);
      return { status: "deleted", id: c.args.id };
    },
  })
  .command("deliveries", {
    description: "View delivery history for a webhook",
    args: z.object({
      id: z.coerce.number().describe("Webhook ID"),
    }),
    options: z.object({
      replay: z.string().optional().describe("Delivery ID to replay"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);

      if (c.options.replay) {
        return api(
          "POST",
          `/api/repos/${owner}/${repo}/hooks/${c.args.id}/deliveries/${c.options.replay}/replay`,
        );
      }

      return api("GET", `/api/repos/${owner}/${repo}/hooks/${c.args.id}/deliveries`);
    },
  });
