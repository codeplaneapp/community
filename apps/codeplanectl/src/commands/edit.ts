import { z } from "incur";
import * as fs from "node:fs/promises";
import * as p from "@clack/prompts";
import { ClaudeCodeAgent } from "smithers-orchestrator";
import * as diff from "diff";
import { spawn } from "node:child_process";
import { fileMap, docEnum } from "../file-map.js";

export const edit = {
  description:
    "Prompt a change to a document using Claude and auto-apply the diffs via Smithers.",
  args: z.object({
    doc: z
      .enum(docEnum)
      .describe("The document to edit"),
  }),
  async run(c: any) {
    p.intro(`Editing ${c.args.doc}`);
    const file = fileMap[c.args.doc];

    const request = await p.text({
      message: `What change would you like to make to ${c.args.doc}?`,
      placeholder: "e.g., Add a section about feature X...",
    });

    if (p.isCancel(request)) {
      p.cancel("Operation cancelled.");
      return c.error({ code: "ABORTED", message: "User aborted the edit." });
    }

    const s = p.spinner();
    s.start("Generating changes with Claude Code...");

    const content = await fs.readFile(file, "utf-8");

    const agent = new ClaudeCodeAgent({
      model: "claude-opus-4-6",
      systemPrompt: `You are an expert software engineer. Rewrite the following file according to the user's instructions.
Output ONLY the final file content, with no markdown code blocks around the whole document, no explanations, and no commentary.
Your entire output will be piped directly into the file. Do not wrap the file in \`\`\`markdown ... \`\`\`.`,
      dangerouslySkipPermissions: true,
    });

    const result = await agent.generate({
      prompt: `File content:\n\n${content}\n\nUser instructions:\n${request}`,
    });

    let newContent = result.text.trim();
    if (newContent.startsWith("\`\`\`") && newContent.endsWith("\`\`\`")) {
      newContent = newContent
        .replace(/^\`\`\`[a-z]*\n/, "")
        .replace(/\n\`\`\`$/, "");
    }

    s.stop("Changes generated.");

    const d = diff.createPatch(file, content, newContent);
    console.log("\nProposed changes:\n");
    console.log(d);

    const apply = await p.confirm({
      message: "Apply these changes and trigger a rebuild?",
    });

    if (p.isCancel(apply) || !apply) {
      p.cancel("Aborted.");
      return c.error({ code: "ABORTED", message: "User aborted the edit." });
    }

    await fs.writeFile(file, newContent, "utf-8");
    p.log.success("Changes saved.");

    p.note("Running 'codeplanectl up' with diff context...");
    const child = spawn(
      "bunx",
      [
        "smithers",
        "run",
        "specs/generate.tsx",
        "--input",
        JSON.stringify({ diffs: { [file]: d } }),
        "--allow-network",
      ],
      { stdio: "inherit" },
    );

    return new Promise((resolve) => {
      child.on("exit", (code) => {
        if (code === 0) resolve(c.ok({ success: true }));
        else
          resolve(
            c.error({
              code: "SMITHERS_FAILED",
              message: `Smithers exited with code ${code}`,
            }),
          );
      });
    });
  },
} as const;
