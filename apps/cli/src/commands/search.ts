import { Cli, z } from "incur";
import { api } from "../client.js";

export const search = Cli.create("search", {
  description: "Search repos, issues, and code",
})
  .command("repos", {
    description: "Search repositories",
    args: z.object({
      query: z.string().describe("Search query"),
    }),
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/search/repositories?q=${encodeURIComponent(c.args.query)}&page=${c.options.page}&limit=${c.options.limit}`,
      );
    },
  })
  .command("issues", {
    description: "Search issues",
    args: z.object({
      query: z.string().describe("Search query"),
    }),
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/search/issues?q=${encodeURIComponent(c.args.query)}&page=${c.options.page}&limit=${c.options.limit}`,
      );
    },
  })
  .command("code", {
    description: "Search code",
    args: z.object({
      query: z.string().describe("Search query"),
    }),
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/search/code?q=${encodeURIComponent(c.args.query)}&page=${c.options.page}&limit=${c.options.limit}`,
      );
    },
  })
  .command("users", {
    description: "Search users",
    args: z.object({
      query: z.string().describe("Search query"),
    }),
    options: z.object({
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
    }),
    async run(c) {
      return api(
        "GET",
        `/api/search/users?q=${encodeURIComponent(c.args.query)}&page=${c.options.page}&limit=${c.options.limit}`,
      );
    },
  });
