import { spawn } from "node:child_process";

export const up = {
  description: "Start the Smithers engine",
  async run(c: any) {
    console.log("Starting smithers engine...");
    const child = spawn(
      "bunx",
      [
        "smithers",
        "run",
        "specs/generate.tsx",
        "--input",
        "{}",
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
