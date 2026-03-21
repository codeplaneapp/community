import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

const tempDirs: string[] = [];

async function generateDeployKey(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `codeplane-deploy-${prefix}-`));
  tempDirs.push(dir);

  const privateKeyPath = join(dir, "id_ed25519");
  const proc = Bun.spawn(
    ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", privateKeyPath, "-C", `deploy-${prefix}-${Date.now()}`],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  await chmod(privateKeyPath, 0o600);
  return (await Bun.file(`${privateKeyPath}.pub`).text()).trim();
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI: Deploy Keys", () => {
  const repoName = uniqueName("cli-deploy-keys");
  const repoSlug = `${OWNER}/${repoName}`;
  let deployKeyId = 0;

  test("setup: create repo for deploy key tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "Deploy keys e2e"],
      { json: true },
    );
    jsonParse(result);
  });

  test("add read-only deploy key", async () => {
    const pubKey = await generateDeployKey("readonly");
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/keys`,
        "--method", "POST",
        "-f", `title=ci-deploy-${Date.now()}`,
        "-f", `key=${pubKey}`,
        "-f", "read_only=true",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as {
      id: number;
      title: string;
      fingerprint: string;
      read_only: boolean;
    };
    expect(typeof body.id).toBe("number");
    expect(typeof body.fingerprint).toBe("string");
    expect(body.fingerprint.length).toBeGreaterThan(0);
    expect(body.read_only).toBe(true);
    deployKeyId = body.id;
  });

  test("list deploy keys", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/keys`],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ id: number; title: string; fingerprint: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((k) => k.id === deployKeyId)).toBe(true);
  });

  test("verify deploy key fingerprint format", async () => {
    const result = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/keys`],
      { json: true },
    );

    const body = JSON.parse(result.stdout) as Array<{ fingerprint: string }>;
    for (const key of body) {
      // Fingerprint should be SHA256 format
      expect(key.fingerprint).toMatch(/^SHA256:|^[a-f0-9:]+$/i);
    }
  });

  test("delete deploy key", async () => {
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/keys/${deployKeyId}`,
        "--method", "DELETE",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);

    // Verify gone
    const listResult = await cli(
      ["api", `/api/repos/${OWNER}/${repoName}/keys`],
      { json: true },
    );
    if (listResult.exitCode === 0) {
      const keys = JSON.parse(listResult.stdout) as Array<{ id: number }>;
      expect(keys.some((k) => k.id === deployKeyId)).toBe(false);
    }
  });

  test("add deploy key with write access", async () => {
    const pubKey = await generateDeployKey("readwrite");
    const result = await cli(
      [
        "api",
        `/api/repos/${OWNER}/${repoName}/keys`,
        "--method", "POST",
        "-f", `title=write-deploy-${Date.now()}`,
        "-f", `key=${pubKey}`,
        "-f", "read_only=false",
      ],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as { read_only: boolean };
    expect(body.read_only).toBe(false);
  });
});
