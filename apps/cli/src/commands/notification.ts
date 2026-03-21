import { Cli, z } from "incur";
import { api } from "../client.js";

export const notification = Cli.create("notification", {
  description: "Manage notifications",
})
  .command("list", {
    description: "List notifications",
    options: z.object({
      unread: z.boolean().default(false).describe("Show only unread notifications"),
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
    }),
    async run(c) {
      const params = new URLSearchParams();
      params.set("page", String(c.options.page));
      params.set("limit", String(c.options.limit));
      if (c.options.unread) {
        params.set("status", "unread");
      }
      return api("GET", `/api/notifications/list?${params}`);
    },
  })
  .command("read", {
    description: "Mark a notification as read",
    args: z.object({
      id: z.string().optional().describe("Notification ID"),
    }),
    options: z.object({
      all: z.boolean().default(false).describe("Mark all notifications as read"),
    }),
    async run(c) {
      if (c.options.all) {
        await api("PUT", "/api/notifications/mark-read");
        return { status: "all_read" };
      }

      if (!c.args.id) {
        throw new Error("Provide a notification ID or use --all to mark all as read.");
      }

      return api("PATCH", `/api/notifications/${c.args.id}`, {
        read: true,
      });
    },
  });
