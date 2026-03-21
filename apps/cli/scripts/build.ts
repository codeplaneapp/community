import { cp, lstat, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const cliDir = resolve(import.meta.dir, "..");
const repoRoot = resolve(cliDir, "..", "..");
const binDir = resolve(repoRoot, "bin");

async function resolvePiPackageDir(): Promise<string> {
  const candidates = [
    resolve(repoRoot, "node_modules", "@mariozechner", "pi-coding-agent"),
    resolve(cliDir, "node_modules", "@mariozechner", "pi-coding-agent"),
  ];

  for (const candidate of candidates) {
    try {
      const stat = await lstat(resolve(candidate, "package.json"));
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next install layout.
    }
  }

  throw new Error("could not locate @mariozechner/pi-coding-agent in node_modules");
}

async function copyAsset(from: string, to: string): Promise<void> {
  const stat = await lstat(from);
  await rm(to, { recursive: true, force: true });
  await mkdir(dirname(to), { recursive: true });

  if (stat.isDirectory()) {
    await cp(from, to, { recursive: true });
    return;
  }

  await cp(from, to);
}

async function buildBinary(): Promise<void> {
  await mkdir(binDir, { recursive: true });

  const bun = Bun.which("bun") ?? process.execPath;
  const proc = Bun.spawnSync(
    [bun, "build", "src/main.ts", "--compile", "--outfile", "../../bin/jjhub"],
    {
      cwd: cliDir,
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  if (proc.exitCode !== 0) {
    throw new Error(`bun build failed with exit code ${proc.exitCode}`);
  }
}

async function packagePiAssets(): Promise<void> {
  const piPackageDir = await resolvePiPackageDir();
  const assets = [
    ["package.json", "package.json"],
    ["README.md", "README.md"],
    ["CHANGELOG.md", "CHANGELOG.md"],
    ["docs", "docs"],
    ["examples", "examples"],
    ["dist/modes/interactive/theme", "theme"],
    ["dist/core/export-html", "export-html"],
  ] as const;

  for (const [source, destination] of assets) {
    await copyAsset(resolve(piPackageDir, source), resolve(binDir, destination));
  }
}

await buildBinary();
await packagePiAssets();
