import { Cli, z } from "incur";
import { api } from "../client.js";

export const sshKey = Cli.create("ssh-key", {
  description: "Manage SSH keys",
})
  .command("add", {
    description: "Add an SSH key",
    options: z.object({
      title: z.string().describe("Key title"),
      key: z.string().describe("Public key content"),
    }),
    async run(c) {
      return api("POST", "/api/user/keys", {
        title: c.options.title,
        key: c.options.key,
      });
    },
  })
  .command("list", {
    description: "List SSH keys",
    async run() {
      return api("GET", "/api/user/keys");
    },
  })
  .command("delete", {
    description: "Delete an SSH key",
    args: z.object({
      id: z.string().describe("Key ID"),
    }),
    async run(c) {
      const id = Number.parseInt(c.args.id, 10);
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new Error("invalid SSH key id");
      }
      await api("DELETE", `/api/user/keys/${id}`);
      return { status: "deleted", id };
    },
  });
