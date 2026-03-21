import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli, jsonParse, uniqueName, OWNER } from "./helpers";

describe("CLI: Releases", () => {
  const repoName = uniqueName("cli-releases");
  const repoSlug = `${OWNER}/${repoName}`;
  const tagName = "v1.0.0";
  let releaseId = 0;

  test("setup: create repo for release tests", async () => {
    const result = await cli(
      ["repo", "create", repoName, "--description", "CLI releases e2e"],
      { json: true },
    );
    const body = jsonParse<{ name: string }>(result);
    expect(body.name).toBe(repoName);
  });

  test("codeplane release create creates a release", async () => {
    const result = await cli(
      [
        "release", "create", tagName,
        "--title", "First Release",
        "--notes", "Release notes for v1.0.0",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      id: number;
      tag_name: string;
      name: string;
      body: string;
      draft: boolean;
      prerelease: boolean;
    }>(result);
    expect(typeof body.id).toBe("number");
    releaseId = body.id;
    expect(body.tag_name).toBe(tagName);
    expect(body.name).toBe("First Release");
    expect(body.body).toBe("Release notes for v1.0.0");
    expect(body.draft).toBe(false);
    expect(body.prerelease).toBe(false);
  });

  test("codeplane release asset download increments download_count", async () => {
    const assetDir = mkdtempSync(join(tmpdir(), "codeplane-release-asset-"));
    const assetPath = join(assetDir, "asset.txt");
    writeFileSync(assetPath, "release asset contents\n");

    try {
      const uploadResult = await cli(
        ["release", "upload", String(releaseId), assetPath],
        { repo: repoSlug, json: true },
      );
      const uploadBody = jsonParse<{
        id: number;
        status: string;
        download_count: number;
      }>(uploadResult);
      expect(uploadBody.status).toBe("ready");
      expect(uploadBody.download_count).toBe(0);

      const downloadResult = await cli(
        ["api", `/api/repos/${OWNER}/${repoName}/releases/${releaseId}/assets/${uploadBody.id}/download`],
        { json: true },
      );
      const downloadBody = jsonParse<{
        asset: { id: number; download_count: number };
        download_url: string;
      }>(downloadResult);
      expect(downloadBody.asset.id).toBe(uploadBody.id);
      expect(downloadBody.asset.download_count).toBe(1);
      expect(downloadBody.download_url.length).toBeGreaterThan(0);

      const releaseResult = await cli(
        ["release", "view", String(releaseId)],
        { repo: repoSlug, json: true },
      );
      const releaseBody = jsonParse<{
        assets: Array<{ id: number; download_count: number }>;
      }>(releaseResult);
      const asset = releaseBody.assets.find((entry) => entry.id === uploadBody.id);
      expect(asset).toBeDefined();
      expect(asset?.download_count).toBe(1);
    } finally {
      rmSync(assetDir, { recursive: true, force: true });
    }
  });

  test("codeplane release list lists releases", async () => {
    const result = await cli(
      ["release", "list"],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<Array<{ tag_name: string; name: string }>>(result);
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((r) => r.tag_name === tagName)).toBe(true);
  });

  test("codeplane release create draft release", async () => {
    const draftTag = "v2.0.0-beta";
    const result = await cli(
      [
        "release", "create", draftTag,
        "--title", "Draft Release",
        "--notes", "Pre-release draft",
        "--draft",
        "--prerelease",
      ],
      { repo: repoSlug, json: true },
    );

    const body = jsonParse<{
      tag_name: string;
      name: string;
      draft: boolean;
      prerelease: boolean;
    }>(result);
    expect(body.tag_name).toBe(draftTag);
    expect(body.name).toBe("Draft Release");
    expect(body.draft).toBe(true);
    expect(body.prerelease).toBe(true);
  });
});
