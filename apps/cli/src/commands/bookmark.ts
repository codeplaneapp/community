import { Cli, z } from "incur";
import {
  createLocalBookmark,
  deleteLocalBookmark,
  hasLocalBookmark,
  listLocalBookmarks,
} from "../jj.js";

export const bookmark = Cli.create("bookmark", {
  description: "Manage bookmarks (branches)",
})
  .command("list", {
    description: "List bookmarks",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const bookmarks = await listLocalBookmarks();
      if (c.format === "json" || c.formatExplicit) {
        return bookmarks;
      }
      if (bookmarks.length === 0) {
        return "No bookmarks";
      }
      return bookmarks
        .map((bookmark) =>
          bookmark.target_change_id
            ? `${bookmark.name} ${bookmark.target_change_id}`
            : bookmark.name,
        )
        .join("\n");
    },
  })
  .command("create", {
    description: "Create a bookmark",
    args: z.object({
      name: z.string().describe("Bookmark name"),
    }),
    options: z.object({
      change: z.string().optional().describe("Target change ID"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const bookmark = await createLocalBookmark(c.args.name, c.options.change);
      if (c.format === "json" || c.formatExplicit) {
        return bookmark;
      }
      return bookmark.target_change_id
        ? `Created bookmark ${bookmark.name} at ${bookmark.target_change_id}`
        : `Created bookmark ${bookmark.name}`;
    },
  })
  .command("delete", {
    description: "Delete a bookmark",
    args: z.object({
      name: z.string().describe("Bookmark name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      if (!(await hasLocalBookmark(c.args.name))) {
        throw new Error(`Bookmark ${c.args.name} was not found`);
      }
      await deleteLocalBookmark(c.args.name);
      if (c.format === "json") {
        return undefined;
      }
      if (c.formatExplicit) {
        return { status: "deleted", name: c.args.name };
      }
      return `Deleted bookmark ${c.args.name}`;
    },
  });
