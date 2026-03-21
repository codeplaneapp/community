import { Cli, z } from "incur";
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const tui = Cli.create("tui", {
  description: "Launch the interactive terminal UI",
  options: z.object({
    repo: z
      .string()
      .optional()
      .describe("Initial repository context (OWNER/REPO)"),
  }),
  async run(c) {
    const tuiEntry = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "tui",
      "src",
      "index.tsx",
    );

    const args = [tuiEntry];
    if (c.options.repo) {
      args.push("--repo", c.options.repo);
    }

    const child = spawn("bun", args, {
      stdio: "inherit",
      env: {
        ...process.env,
      },
    });

    return new Promise<void>((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(new Error(`TUI exited with code ${code}`));
        }
      });
      child.on("error", reject);
    });
  },
});
