import { Cli, z } from "incur";
import { ApiError, api, resolveRepoRef } from "../client.js";
import {
  formatWikiCreate,
  formatWikiList,
  formatWikiMutation,
  formatWikiView,
  shouldReturnStructuredOutput,
} from "../output.js";

type WikiRecord = Record<string, unknown>;

function handleWikiApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw new Error(error.detail);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export const wiki = Cli.create("wiki", {
  description: "Manage wiki pages",
})
  .command("list", {
    description: "List wiki pages",
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
      query: z.string().optional().describe("Search titles, slugs, and body content"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const params = new URLSearchParams({
          page: String(c.options.page),
          per_page: String(c.options.limit),
        });
        if (c.options.query?.trim()) {
          params.set("q", c.options.query.trim());
        }
        const pages = await api<WikiRecord[]>("GET", `/api/repos/${owner}/${repo}/wiki?${params.toString()}`);
        if (shouldReturnStructuredOutput(c)) {
          return pages;
        }
        return formatWikiList(pages);
      } catch (error) {
        handleWikiApiError(error);
      }
    },
  })
  .command("view", {
    description: "View a wiki page",
    args: z.object({
      slug: z.string().describe("Wiki page slug"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const page = await api<WikiRecord>(
          "GET",
          `/api/repos/${owner}/${repo}/wiki/${c.args.slug}`,
        );
        if (shouldReturnStructuredOutput(c)) {
          return page;
        }
        return formatWikiView(page);
      } catch (error) {
        handleWikiApiError(error);
      }
    },
  })
  .command("create", {
    description: "Create a wiki page",
    options: z.object({
      title: z.string().describe("Page title"),
      slug: z.string().optional().describe("Page slug (defaults to a slugified title)"),
      body: z.string().default("").describe("Page content (Markdown)"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const page = await api<WikiRecord>("POST", `/api/repos/${owner}/${repo}/wiki`, {
          title: c.options.title,
          slug: c.options.slug,
          body: c.options.body,
        });
        if (shouldReturnStructuredOutput(c)) {
          return page;
        }
        return formatWikiCreate(page);
      } catch (error) {
        handleWikiApiError(error);
      }
    },
  })
  .command("edit", {
    description: "Edit a wiki page",
    args: z.object({
      slug: z.string().describe("Current wiki page slug"),
    }),
    options: z.object({
      title: z.string().optional().describe("New title"),
      slug: z.string().optional().describe("New slug"),
      body: z.string().optional().describe("New content (Markdown)"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const patch: Record<string, unknown> = {};
        if (c.options.title !== undefined) patch.title = c.options.title;
        if (c.options.slug !== undefined) patch.slug = c.options.slug;
        if (c.options.body !== undefined) patch.body = c.options.body;
        const page = await api<WikiRecord>(
          "PATCH",
          `/api/repos/${owner}/${repo}/wiki/${c.args.slug}`,
          patch,
        );
        if (shouldReturnStructuredOutput(c)) {
          return page;
        }
        return formatWikiMutation("Updated", page);
      } catch (error) {
        handleWikiApiError(error);
      }
    },
  })
  .command("delete", {
    description: "Delete a wiki page",
    args: z.object({
      slug: z.string().describe("Wiki page slug"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        await api(
          "DELETE",
          `/api/repos/${owner}/${repo}/wiki/${c.args.slug}`,
        );
        return `Deleted wiki page ${c.args.slug}`;
      } catch (error) {
        handleWikiApiError(error);
      }
    },
  });
