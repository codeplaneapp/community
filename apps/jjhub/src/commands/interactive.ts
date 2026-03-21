import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";

export const interactive = {
  description: "Launch the interactive Pi-powered dev harness",
  async run(c: any) {
    console.log("Launching JJHub Pi Harness...");

    const extDir = path.join(process.cwd(), ".pi", "extension");
    const skillDir = path.join(process.cwd(), ".pi", "skill");

    await fs.mkdir(extDir, { recursive: true });
    await fs.mkdir(skillDir, { recursive: true });

    const child = spawn("pi", ["--extension", extDir, "--skill", skillDir], {
      stdio: "inherit",
    });

    return new Promise((resolve) => {
      child.on("exit", (code) => {
        if (code === 0) resolve(c.ok({ success: true }));
        else
          resolve(
            c.error({
              code: "PI_FAILED",
              message: `Pi exited with code ${code}`,
            }),
          );
      });
    });
  },
} as const;
