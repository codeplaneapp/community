import { Cli, z } from "incur";
import { ApiError, api, resolveRepoRef } from "../client.js";
import { currentLocalChangeId, listLocalStackChangeIds } from "../jj.js";
import {
  formatLandingChecks,
  formatLandingCreate,
  formatLandingList,
  formatLandingMutation,
  formatLandingView,
  shouldReturnStructuredOutput,
} from "../output.js";

type LandingRecord = Record<string, unknown>;

function parseLandingNumber(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("invalid landing request number");
  }
  return parsed;
}

function repoRef(owner: string, repo: string): string {
  return `${owner}/${repo}`;
}

function handleLandingApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw new Error(error.detail);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export function normalizeLandingListState(
  state: "open" | "closed" | "merged" | "landed" | "all",
): string {
  return state === "landed" ? "merged" : state;
}

export const land = Cli.create("land", {
  description: "Manage landing requests",
})
  .command("create", {
    description: "Create a landing request",
    options: z.object({
      title: z.string().describe("Landing request title"),
      body: z.string().default("").describe("Landing request body"),
      target: z.string().default("main").describe("Target bookmark"),
      change: z.string().optional().describe("Change ID(s) to land"),
      "change-id": z.string().optional().describe("Change ID(s) to land"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
      stack: z.boolean().default(false).describe("Include the full stack up to the target"),
    }),
    async run(c) {
      try {
        const explicitChangeId = c.options["change-id"] ?? c.options.change;
        const changeIds = explicitChangeId
          ? [explicitChangeId]
          : c.options.stack
            ? await listLocalStackChangeIds(c.options.target)
            : [await currentLocalChangeId()];
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const landing = await api<LandingRecord>("POST", `/api/repos/${owner}/${repo}/landings`, {
          title: c.options.title,
          body: c.options.body,
          target_bookmark: c.options.target,
          change_ids: changeIds,
        });
        if (shouldReturnStructuredOutput(c)) {
          return landing;
        }
        return formatLandingCreate(repoRef(owner, repo), landing);
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("list", {
    description: "List landing requests",
    options: z.object({
      state: z
        .enum(["open", "closed", "merged", "landed", "all"])
        .default("open")
        .describe("Filter by state"),
      page: z.number().default(1).describe("Page number"),
      limit: z.number().default(30).describe("Results per page"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const query = new URLSearchParams({
          page: String(c.options.page),
          per_page: String(c.options.limit),
        });
        if (c.options.state !== "all") {
          query.set("state", normalizeLandingListState(c.options.state));
        }
        const landings = await api<LandingRecord[]>(
          "GET",
          `/api/repos/${owner}/${repo}/landings?${query.toString()}`,
        );
        if (shouldReturnStructuredOutput(c)) {
          return landings;
        }
        return formatLandingList(landings);
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("view", {
    description: "View a landing request",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseLandingNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const [landing, changes, reviews, conflicts] = await Promise.all([
          api<LandingRecord>("GET", `/api/repos/${owner}/${repo}/landings/${number}`),
          api<LandingRecord[]>(
            "GET",
            `/api/repos/${owner}/${repo}/landings/${number}/changes?page=1&per_page=100`,
          ),
          api<LandingRecord[]>(
            "GET",
            `/api/repos/${owner}/${repo}/landings/${number}/reviews?page=1&per_page=100`,
          ),
          api<LandingRecord>("GET", `/api/repos/${owner}/${repo}/landings/${number}/conflicts`),
        ]);
        const details = { landing, changes, reviews, conflicts };
        if (shouldReturnStructuredOutput(c)) {
          return details;
        }
        return formatLandingView(details);
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("review", {
    description: "Submit a review on a landing request",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      approve: z.boolean().default(false).describe("Approve the landing request"),
      body: z.string().default("").describe("Review comment"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseLandingNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const review = await api<LandingRecord>(
          "POST",
          `/api/repos/${owner}/${repo}/landings/${number}/reviews`,
          {
            type: c.options.approve ? "approve" : "comment",
            body: c.options.body,
          },
        );
        if (shouldReturnStructuredOutput(c)) {
          return review;
        }
        return `Submitted ${c.options.approve ? "approval" : "review"} for landing request #${number}`;
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("checks", {
    description: "View landing request checks",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseLandingNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const landing = await api<LandingRecord>("GET", `/api/repos/${owner}/${repo}/landings/${number}`);
        const statuses = (
          await Promise.all(
            (Array.isArray(landing.change_ids) ? landing.change_ids : []).map(async (changeId) => {
              const change = typeof changeId === "string" ? changeId : String(changeId);
              const items = await api<LandingRecord[]>(
                "GET",
                `/api/repos/${owner}/${repo}/commits/${change}/statuses`,
              );
              return items.map((item) => ({ ...item, change_id: change }));
            }),
          )
        ).flat();
        const payload = { landing, statuses };
        if (shouldReturnStructuredOutput(c)) {
          return payload;
        }
        return formatLandingChecks(statuses);
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("conflicts", {
    description: "View landing request conflicts",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseLandingNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const conflicts = await api<LandingRecord>(
          "GET",
          `/api/repos/${owner}/${repo}/landings/${number}/conflicts`,
        );
        if (shouldReturnStructuredOutput(c)) {
          return conflicts;
        }
        return `Conflicts: ${String(conflicts.conflict_status ?? "unknown")}`;
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("edit", {
    description: "Edit a landing request",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      title: z.string().optional().describe("New title"),
      body: z.string().optional().describe("New body"),
      target: z.string().optional().describe("New target bookmark"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseLandingNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const patch: Record<string, unknown> = {};
        if (c.options.title !== undefined) patch.title = c.options.title;
        if (c.options.body !== undefined) patch.body = c.options.body;
        if (c.options.target !== undefined) patch.target_bookmark = c.options.target;
        const landing = await api<LandingRecord>(
          "PATCH",
          `/api/repos/${owner}/${repo}/landings/${number}`,
          patch,
        );
        if (shouldReturnStructuredOutput(c)) {
          return landing;
        }
        return formatLandingMutation("Updated", landing);
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("comment", {
    description: "Add a comment to a landing request",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      body: z.string().describe("Comment body"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseLandingNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const comment = await api<LandingRecord>(
          "POST",
          `/api/repos/${owner}/${repo}/landings/${number}/comments`,
          { body: c.options.body },
        );
        if (shouldReturnStructuredOutput(c)) {
          return comment;
        }
        return `Added a comment to landing request #${number}`;
      } catch (error) {
        handleLandingApiError(error);
      }
    },
  })
  .command("land", {
    description: "Land (merge) a landing request",
    args: z.object({
      number: z.string().describe("Landing request number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const number = parseLandingNumber(c.args.number);
      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const landing = await api<LandingRecord>("PUT", `/api/repos/${owner}/${repo}/landings/${number}/land`);
        if (shouldReturnStructuredOutput(c)) {
          return landing;
        }
        return formatLandingMutation("Landed", landing);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status === 404) {
            throw new Error(`landing request #${number} was not found`);
          }
          if (error.status === 409) {
            throw new Error(
              `landing request #${number} cannot be landed right now: ${error.detail}`,
            );
          }
        }
        handleLandingApiError(error);
      }
    },
  });
