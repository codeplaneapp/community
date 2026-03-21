import { spawn } from "node:child_process";

export const down = {
  description: "Stop the Smithers engine",
  async run(c: any) {
    console.log("Stopping smithers engine...");
    const child = spawn(
      "bunx",
      ["smithers", "cancel", "specs/generate.tsx"],
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
