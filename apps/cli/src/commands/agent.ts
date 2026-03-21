import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";
import { runAgent } from "../agent/runtime.js";

function createRemoteSessionCommands(base: ReturnType<typeof Cli.create>) {
  return base
    .command("list", {
      description: "List remote agent sessions",
      options: z.object({
        page: z.number().default(1).describe("Page number"),
        "per-page": z.number().default(30).describe("Results per page"),
        repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      }),
      async run(c) {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        return api(
          "GET",
          `/api/repos/${owner}/${repo}/agent/sessions?page=${c.options.page}&per_page=${c.options["per-page"]}`,
        );
      },
    })
    .command("view", {
      description: "View a remote agent session",
      args: z.object({
        id: z.string().describe("Session ID"),
      }),
      options: z.object({
        repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      }),
      async run(c) {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        return api("GET", `/api/repos/${owner}/${repo}/agent/sessions/${c.args.id}`);
      },
    })
    .command("run", {
      description: "Start a remote agent session and run a prompt",
      args: z.object({
        prompt: z.string().describe("Prompt to send to the remote agent"),
      }),
      options: z.object({
        title: z.string().optional().describe("Optional title for the session"),
        repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      }),
      async run(c) {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const title = c.options.title ?? c.args.prompt.slice(0, 60);

        const session = await api<{ id: string; status: string }>(
          "POST",
          `/api/repos/${owner}/${repo}/agent/sessions`,
          { title },
        );

        await api(
          "POST",
          `/api/repos/${owner}/${repo}/agent/sessions/${session.id}/messages`,
          {
            role: "user",
            parts: [{ type: "text", content: c.args.prompt }],
          },
        );

        return session;
      },
    })
    .command("chat", {
      description: "Send a message to an existing remote agent session",
      args: z.object({
        id: z.string().describe("Session ID"),
        message: z.string().describe("Message to send"),
      }),
      options: z.object({
        repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      }),
      async run(c) {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        return api(
          "POST",
          `/api/repos/${owner}/${repo}/agent/sessions/${c.args.id}/messages`,
          {
            role: "user",
            parts: [{ type: "text", content: c.args.message }],
          },
        );
      },
    });
}

const session = createRemoteSessionCommands(
  Cli.create("session", {
    description: "Manage remote Codeplane agent sessions",
  }),
);

const ask = Cli.create("ask", {
  description: "Talk to the local Codeplane usage helper",
  args: z.object({
    prompt: z
      .string()
      .optional()
      .describe("Optional one-shot prompt for the local Codeplane helper"),
  }),
  options: z.object({
    sandbox: z
      .boolean()
      .default(false)
      .describe("Run the helper with a workspace-backed sandbox backend"),
    repo: z.string().optional().describe("Repository (OWNER/REPO)"),
  }),
  async run(c) {
    return runAgent({
      format: c.format,
      formatExplicit: c.formatExplicit,
      prompt: c.args.prompt,
      repoOverride: c.options.repo,
      sandbox: c.options.sandbox,
    });
  },
});

export const agent = createRemoteSessionCommands(
  Cli.create("agent", {
    description: "Talk to a local Codeplane usage helper or manage remote agent sessions",
  })
    .command(ask)
    .command(session),
);
