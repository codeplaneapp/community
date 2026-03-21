import { execFileSync } from "node:child_process";
import * as path from "node:path";

export function execJJ(args: string[], cwd?: string): string {
  return execFileSync("jj", args, {
    encoding: "utf-8",
    cwd: cwd || process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

/** Resolve the specs/ directory relative to this file */
export function specsDir(): string {
  return path.resolve(__dirname, "..");
}

/** Resolve the repo root (one level above specs/) */
export function rootDir(): string {
  return path.resolve(specsDir(), "..");
}
