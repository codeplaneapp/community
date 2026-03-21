import { z } from "incur";
import * as fs from "node:fs/promises";
import { fileMap, docEnum } from "../file-map.js";

export const view = {
  description: "View a document (prd, design, arch, tickets, smithers)",
  args: z.object({
    doc: z
      .enum(docEnum)
      .describe("The document to view"),
  }),
  async run(c: any) {
    const file = fileMap[c.args.doc];
    const content = await fs.readFile(file, "utf-8");
    console.log(content);
    return c.ok({});
  },
} as const;
