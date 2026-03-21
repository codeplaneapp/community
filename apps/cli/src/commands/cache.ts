import { Cli, z } from "incur";
import { api, resolveRepoRef } from "../client.js";

type WorkflowCacheRecord = {
  id: number;
  repository_id: number;
  workflow_run_id?: number | null;
  bookmark_name: string;
  cache_key: string;
  cache_version: string;
  object_key: string;
  object_size_bytes: number;
  compression: string;
  status: string;
  hit_count: number;
  last_hit_at?: string | null;
  finalized_at?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

type WorkflowCacheStats = {
  cache_count: number;
  total_size_bytes: number;
  repo_quota_bytes: number;
  archive_max_bytes: number;
  ttl_seconds: number;
  last_hit_at?: string | null;
  max_expires_at?: string | null;
};

type WorkflowCacheClearResult = {
  deleted_count: number;
  deleted_bytes: number;
};

function buildCacheQuery(options: {
  bookmark?: string;
  key?: string;
  limit?: number;
  page?: number;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(options.page ?? 1));
  params.set("per_page", String(options.limit ?? 30));

  const bookmark = options.bookmark?.trim();
  if (bookmark) {
    params.set("bookmark", bookmark);
  }

  const key = options.key?.trim();
  if (key) {
    params.set("key", key);
  }

  return `?${params.toString()}`;
}

function buildCacheFilterQuery(options: { bookmark?: string; key?: string }): string {
  const params = new URLSearchParams();

  const bookmark = options.bookmark?.trim();
  if (bookmark) {
    params.set("bookmark", bookmark);
  }

  const key = options.key?.trim();
  if (key) {
    params.set("key", key);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

export const cache = Cli.create("cache", {
  description: "Manage workflow caches",
})
  .command("list", {
    description: "List workflow caches for a repository",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      bookmark: z.string().optional().describe("Filter by bookmark name"),
      key: z.string().optional().describe("Filter by cache key"),
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Number of results"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const query = buildCacheQuery(c.options);
      return api<WorkflowCacheRecord[]>(
        "GET",
        `/api/repos/${owner}/${repo}/caches${query}`,
      );
    },
  })
  .command("stats", {
    description: "Show workflow cache statistics for a repository",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      return api<WorkflowCacheStats>("GET", `/api/repos/${owner}/${repo}/caches/stats`);
    },
  })
  .command("clear", {
    description: "Clear workflow caches for a repository",
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      bookmark: z.string().optional().describe("Filter by bookmark name"),
      key: z.string().optional().describe("Filter by cache key"),
    }),
    async run(c) {
      const { owner, repo } = resolveRepoRef(c.options.repo);
      const query = buildCacheFilterQuery(c.options);
      return api<WorkflowCacheClearResult>(
        "DELETE",
        `/api/repos/${owner}/${repo}/caches${query}`,
      );
    },
  });
