import { basename } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { Cli, z } from "incur";
import { ApiError, api, resolveRepoRef } from "../client.js";

type ReleaseAuthor = {
  id: number;
  login: string;
};

type ReleaseAsset = {
  id: number;
  name: string;
  size: number;
  content_type: string;
  status: string;
  download_count: number;
  confirmed_at?: string;
  created_at: string;
  updated_at: string;
};

type ReleaseRecord = {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  is_tag: boolean;
  author: ReleaseAuthor;
  assets: ReleaseAsset[];
  created_at: string;
  updated_at: string;
  published_at?: string;
};

type ReleaseAssetUploadResponse = {
  asset: ReleaseAsset;
  upload_url: string;
};

function parseReleaseID(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function getRelease(owner: string, repo: string, selector: string): Promise<ReleaseRecord> {
  const releaseID = parseReleaseID(selector);
  if (releaseID != null) {
    try {
      return await api<ReleaseRecord>("GET", `/api/repos/${owner}/${repo}/releases/${releaseID}`);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }
  }
  return api<ReleaseRecord>(
    "GET",
    `/api/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(selector)}`,
  );
}

async function deleteRelease(owner: string, repo: string, selector: string): Promise<void> {
  const releaseID = parseReleaseID(selector);
  if (releaseID != null) {
    try {
      await api("DELETE", `/api/repos/${owner}/${repo}/releases/${releaseID}`);
      return;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) {
        throw error;
      }
    }
  }
  await api("DELETE", `/api/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(selector)}`);
}

function inferContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "application/gzip";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt") || lower.endsWith(".log") || lower.endsWith(".md")) return "text/plain";
  if (lower.endsWith(".wasm")) return "application/wasm";
  return "application/octet-stream";
}

export const release = Cli.create("release", {
  description: "Manage repository releases",
})
  .command("create", {
    description: "Create a release",
    args: z.object({
      tag: z.string().describe("Release tag name"),
    }),
    options: z.object({
      name: z.string().optional().describe("Release title"),
      body: z.string().default("").describe("Release notes/body"),
      target: z.string().optional().describe("Target commitish or bookmark"),
      draft: z.boolean().default(false).describe("Create the release as a draft"),
      prerelease: z.boolean().default(false).describe("Mark the release as a prerelease"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api<ReleaseRecord>("POST", `/api/repos/${owner}/${repo}/releases`, {
        tag_name: c.args.tag,
        name: c.options.name,
        body: c.options.body,
        target_commitish: c.options.target,
        draft: c.options.draft,
        prerelease: c.options.prerelease,
      });
    },
  })
  .command("list", {
    description: "List releases",
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
      drafts: z.boolean().default(false).describe("Include draft releases"),
      prereleases: z.boolean().default(true).describe("Include prereleases"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const params = new URLSearchParams({
        page: String(c.options.page),
        per_page: String(c.options.limit),
      });
      if (!c.options.drafts) {
        params.set("exclude_drafts", "true");
      }
      if (!c.options.prereleases) {
        params.set("exclude_prereleases", "true");
      }
      return api<ReleaseRecord[]>("GET", `/api/repos/${owner}/${repo}/releases?${params.toString()}`);
    },
  })
  .command("view", {
    description: "View a release by ID or tag",
    args: z.object({
      release: z.string().describe("Release ID or tag name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return getRelease(owner, repo, c.args.release);
    },
  })
  .command("delete", {
    description: "Delete a release by ID or tag",
    args: z.object({
      release: z.string().describe("Release ID or tag name"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      await deleteRelease(owner, repo, c.args.release);
      if (c.format === "json") {
        return undefined;
      }
      if (c.formatExplicit) {
        return { status: "deleted", release: c.args.release };
      }
      return `Deleted release ${c.args.release}`;
    },
  })
  .command("upload", {
    description: "Upload an asset to a release",
    args: z.object({
      release: z.string().describe("Release ID or tag name"),
      file: z.string().describe("Path to the asset file"),
    }),
    options: z.object({
      name: z.string().optional().describe("Asset name (defaults to file basename)"),
      "content-type": z.string().optional().describe("Asset content type"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const targetRelease = await getRelease(owner, repo, c.args.release);
      const fileStats = await stat(c.args.file);
      if (!fileStats.isFile()) {
        throw new Error(`not a file: ${c.args.file}`);
      }

      const assetName = c.options.name?.trim() || basename(c.args.file);
      const contentType = c.options["content-type"]?.trim() || inferContentType(assetName);
      const upload = await api<ReleaseAssetUploadResponse>(
        "POST",
        `/api/repos/${owner}/${repo}/releases/${targetRelease.id}/assets`,
        {
          name: assetName,
          size: fileStats.size,
          content_type: contentType,
        },
      );

      const body = await readFile(c.args.file);
      const uploadResponse = await fetch(upload.upload_url, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        body,
      });
      if (!uploadResponse.ok) {
        throw new Error(`asset upload failed (${uploadResponse.status} ${uploadResponse.statusText})`);
      }

      return api<ReleaseAsset>(
        "POST",
        `/api/repos/${owner}/${repo}/releases/${targetRelease.id}/assets/${upload.asset.id}/confirm`,
      );
    },
  });
