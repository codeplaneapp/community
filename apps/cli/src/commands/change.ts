import { Cli, z } from "incur";
import {
  getLocalChange,
  getLocalChangeDetails,
  getLocalDiff,
  listLocalChangeConflicts,
  listLocalChangeFiles,
  listLocalChanges,
} from "../jj.js";

export const change = Cli.create("change", {
  description: "View changes",
})
  .command("list", {
    description: "List changes",
    options: z.object({
      limit: z.number().default(10).describe("Number of changes to show"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const changes = await listLocalChanges(c.options.limit);
      if (c.format === "json" || c.formatExplicit) {
        return changes;
      }
      return changes
        .map((change) =>
          change.description.length > 0
            ? `${change.change_id} ${change.description}`
            : change.change_id,
        )
        .join("\n");
    },
  })
  .command("show", {
    description: "Show a specific change",
    args: z.object({
      id: z.string().describe("Change ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      if (c.format === "json" || c.formatExplicit) {
        return getLocalChangeDetails(c.args.id);
      }
      return getLocalChange(c.args.id);
    },
  })
  .command("diff", {
    description: "Show diff for a change",
    args: z.object({
      id: z.string().optional().describe("Change ID (defaults to working copy)"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const changeId = c.args.id ?? "@";
      return {
        change_id: changeId,
        diff: await getLocalDiff(changeId),
      };
    },
  })
  .command("files", {
    description: "List files in a change",
    args: z.object({
      id: z.string().describe("Change ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      return {
        change_id: c.args.id,
        files: await listLocalChangeFiles(c.args.id),
      };
    },
  })
  .command("conflicts", {
    description: "List conflicts in a change",
    args: z.object({
      id: z.string().describe("Change ID"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      return {
        change_id: c.args.id,
        conflicts: await listLocalChangeConflicts(c.args.id),
      };
    },
  });
