import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, jsonParse, READ_TOKEN } from "./helpers";

const tempDirs: string[] = [];

async function generateSSHPublicKey(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), `codeplane-cli-ssh-${prefix}-`));
  tempDirs.push(dir);

  const privateKeyPath = join(dir, "id_ed25519");
  const proc = Bun.spawn(
    ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", privateKeyPath, "-C", `${prefix}-${Date.now()}`],
    { stdout: "pipe", stderr: "pipe" },
  );
  await proc.exited;
  await chmod(privateKeyPath, 0o600);
  return (await Bun.file(`${privateKeyPath}.pub`).text()).trim();
}

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI: SSH Key Management", () => {
  test("codeplane ssh-key list returns a list of keys", async () => {
    const result = await cli(
      ["ssh-key", "list"],
      { json: true },
    );

    expect(result.exitCode).toBe(0);
    const body = JSON.parse(result.stdout) as Array<{ id: number; name: string }>;
    expect(Array.isArray(body)).toBe(true);
  });

  test("codeplane ssh-key add creates a new SSH key", async () => {
    const publicKey = await generateSSHPublicKey("cli-add");
    const title = `cli-ssh-add-${Date.now()}`;

    const result = await cli(
      ["ssh-key", "add", "--title", title, "--key", publicKey],
      { json: true },
    );

    const body = jsonParse<{
      id: number;
      name: string;
      fingerprint: string;
      key_type: string;
      created_at: string;
    }>(result);
    expect(body.id).toBeGreaterThan(0);
    expect(body.name).toBe(title);
    expect(typeof body.fingerprint).toBe("string");
    expect(body.fingerprint.length).toBeGreaterThan(0);
    expect(typeof body.key_type).toBe("string");
    expect(typeof body.created_at).toBe("string");
  });

  test("codeplane ssh-key add rejects duplicate keys", async () => {
    const publicKey = await generateSSHPublicKey("cli-dup");
    const title1 = `cli-ssh-dup1-${Date.now()}`;
    const title2 = `cli-ssh-dup2-${Date.now()}`;

    // First add should succeed
    const first = await cli(
      ["ssh-key", "add", "--title", title1, "--key", publicKey],
      { json: true },
    );
    expect(first.exitCode).toBe(0);

    // Second add with same key should fail
    const second = await cli(
      ["ssh-key", "add", "--title", title2, "--key", publicKey],
      { json: true },
    );
    expect(second.exitCode).not.toBe(0);
  });

  test("codeplane ssh-key add rejects invalid key material", async () => {
    const result = await cli(
      ["ssh-key", "add", "--title", "invalid-key", "--key", "not-a-real-ssh-key"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane ssh-key add then delete round-trip", async () => {
    const publicKey = await generateSSHPublicKey("cli-del");
    const title = `cli-ssh-del-${Date.now()}`;

    // Add the key
    const addResult = await cli(
      ["ssh-key", "add", "--title", title, "--key", publicKey],
      { json: true },
    );
    const added = jsonParse<{ id: number }>(addResult);
    expect(added.id).toBeGreaterThan(0);

    // Delete the key
    const deleteResult = await cli(
      ["ssh-key", "delete", String(added.id), "--yes"],
      { json: true },
    );
    expect(deleteResult.exitCode).toBe(0);

    // Verify it is gone
    const listResult = await cli(
      ["ssh-key", "list"],
      { json: true },
    );
    if (listResult.exitCode === 0) {
      const keys = JSON.parse(listResult.stdout) as Array<{ id: number }>;
      const found = keys.find((k) => k.id === added.id);
      expect(found).toBeUndefined();
    }
  });

  test("codeplane ssh-key delete fails for non-existent key", async () => {
    const result = await cli(
      ["ssh-key", "delete", "999999999", "--yes"],
      { json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane ssh-key list fails without auth", async () => {
    const result = await cli(
      ["ssh-key", "list"],
      { token: "", json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });

  test("codeplane ssh-key add fails with read-only token", async () => {
    const publicKey = await generateSSHPublicKey("cli-readonly");

    const result = await cli(
      ["ssh-key", "add", "--title", "should-fail", "--key", publicKey],
      { token: READ_TOKEN, json: true },
    );

    expect(result.exitCode).not.toBe(0);
  });
});
