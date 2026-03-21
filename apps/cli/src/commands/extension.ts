import { Cli, z } from "incur";
import { api } from "../client.js";
import { readStdinText } from "../stdin.js";

const linearCredentialInput = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
});

const linear = Cli.create("linear", {
  description: "Configure and manage the Linear integration",
})
  .command("install", {
    description: "Configure a Linear team for a Codeplane repository",
    options: z.object({
      "team-id": z.string().describe("Linear team ID"),
      "team-name": z.string().optional().describe("Linear team display name"),
      "team-key": z.string().optional().describe("Linear team key (e.g. JJH)"),
      "repo-owner": z.string().describe("Codeplane repo owner"),
      "repo-name": z.string().describe("Codeplane repo name"),
      "repo-id": z.coerce.number().describe("Codeplane repo ID"),
      "credentials-stdin": z
        .boolean()
        .default(false)
        .describe("Read Linear OAuth credentials from stdin as JSON"),
      "expires-at": z.string().optional().describe("Token expiry (ISO-8601)"),
      "actor-id": z.string().optional().describe("Linear actor ID for loop guard"),
    }),
    async run(c) {
      if (!c.options["credentials-stdin"]) {
        throw new Error(
          "Linear OAuth credentials must be provided via stdin with --credentials-stdin",
        );
      }

      let rawCredentials: unknown;
      try {
        rawCredentials = JSON.parse(await readStdinText("Linear OAuth credentials"));
      } catch {
        throw new Error(
          "invalid Linear OAuth credentials on stdin; expected JSON with access_token and optional refresh_token",
        );
      }

      const credentials = linearCredentialInput.safeParse(rawCredentials);
      if (!credentials.success) {
        throw new Error(
          "invalid Linear OAuth credentials on stdin; expected JSON with access_token and optional refresh_token",
        );
      }

      return api("POST", "/api/integrations/linear", {
        linear_team_id: c.options["team-id"],
        linear_team_name: c.options["team-name"] ?? "",
        linear_team_key: c.options["team-key"] ?? "",
        repo_owner: c.options["repo-owner"],
        repo_name: c.options["repo-name"],
        repo_id: c.options["repo-id"],
        access_token: credentials.data.access_token,
        refresh_token: credentials.data.refresh_token ?? "",
        expires_at: c.options["expires-at"] ?? "",
        linear_actor_id: c.options["actor-id"] ?? "",
      });
    },
  })
  .command("list", {
    description: "List Linear integrations",
    async run() {
      return api("GET", "/api/integrations/linear");
    },
  })
  .command("remove", {
    description: "Remove a Linear integration",
    args: z.object({
      id: z.coerce.number().describe("Integration ID"),
    }),
    async run(c) {
      await api("DELETE", `/api/integrations/linear/${c.args.id}`);
      return { status: "removed", id: c.args.id };
    },
  })
  .command("sync", {
    description: "Trigger initial sync for a Linear integration",
    args: z.object({
      id: z.coerce.number().describe("Integration ID"),
    }),
    async run(c) {
      return api("POST", `/api/integrations/linear/${c.args.id}/sync`);
    },
  });

export const extension = Cli.create("extension", {
  description: "Configure built-in integrations from the CLI",
}).command(linear);
