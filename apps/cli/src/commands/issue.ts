import { Cli, z } from "incur";
import { ApiError, api, resolveRepoRef } from "../client.js";
import {
  formatIssueCreate,
  formatIssueList,
  formatIssueMutation,
  formatIssueView,
  shouldReturnStructuredOutput,
} from "../output.js";

type IssueRecord = Record<string, unknown>;

function parseIssueNumber(value: string, label = "issue number"): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid ${label}`);
  }
  return parsed;
}

function handleIssueApiError(error: unknown): never {
  if (error instanceof ApiError) {
    throw new Error(error.detail);
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export const issue = Cli.create("issue", {
  description: "Manage issues",
})
  .command("create", {
    description: "Create an issue",
    args: z.object({
      title: z.string().optional().describe("Issue title"),
    }),
    options: z.object({
      title: z.string().optional().describe("Issue title"),
      body: z.string().default("").describe("Issue body"),
      assignee: z.string().optional().describe("Assignee username"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      const title = c.options.title ?? c.args.title;
      if (!title?.trim()) {
        throw new Error("issue title is required");
      }

      try {
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const issue = await api<IssueRecord>("POST", `/api/repos/${owner}/${repo}/issues`, {
          title,
          body: c.options.body,
          ...(c.options.assignee && { assignees: [c.options.assignee] }),
        });
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return formatIssueCreate(issue);
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("list", {
    description: "List issues",
    options: z.object({
      state: z.enum(["open", "closed", "all"]).default("open").describe("Filter by state"),
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
          query.set("state", c.options.state);
        }

        const issues = await api<IssueRecord[]>(
          "GET",
          `/api/repos/${owner}/${repo}/issues?${query.toString()}`,
        );
        if (shouldReturnStructuredOutput(c)) {
          return issues;
        }
        return formatIssueList(issues);
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("view", {
    description: "View an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const issue = await api<IssueRecord>("GET", `/api/repos/${owner}/${repo}/issues/${number}`);
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return formatIssueView(issue);
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("close", {
    description: "Close an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      comment: z.string().optional().describe("Add a comment when closing"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        if (c.options.comment) {
          await api<IssueRecord>("POST", `/api/repos/${owner}/${repo}/issues/${number}/comments`, {
            body: c.options.comment,
          });
        }
        const issue = await api<IssueRecord>("PATCH", `/api/repos/${owner}/${repo}/issues/${number}`, {
          state: "closed",
        });
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return formatIssueMutation("Closed", issue);
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("reopen", {
    description: "Reopen an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const issue = await api<IssueRecord>("PATCH", `/api/repos/${owner}/${repo}/issues/${number}`, {
          state: "open",
        });
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return formatIssueMutation("Reopened", issue);
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("edit", {
    description: "Edit an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      title: z.string().optional().describe("New title"),
      body: z.string().optional().describe("New body"),
      assignee: z.string().optional().describe("Add assignee username"),
      label: z.string().optional().describe("Add label name"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const patch: Record<string, unknown> = {};
        if (c.options.title !== undefined) patch.title = c.options.title;
        if (c.options.body !== undefined) patch.body = c.options.body;
        if (c.options.assignee !== undefined) patch.assignees = [c.options.assignee];
        if (c.options.label !== undefined) patch.labels = [c.options.label];
        const issue = await api<IssueRecord>("PATCH", `/api/repos/${owner}/${repo}/issues/${number}`, patch);
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return formatIssueMutation("Updated", issue);
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("comment", {
    description: "Add a comment to an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      body: z.string().describe("Comment body"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const comment = await api<IssueRecord>("POST", `/api/repos/${owner}/${repo}/issues/${number}/comments`, {
          body: c.options.body,
        });
        if (shouldReturnStructuredOutput(c)) {
          return comment;
        }
        return `Added a comment to issue #${number}`;
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("react", {
    description: "Add a reaction to an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
      emoji: z.string().describe("Reaction emoji (e.g. +1, -1, laugh, heart, hooray)"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const reaction = await api<IssueRecord>(
          "POST",
          `/api/repos/${owner}/${repo}/issues/${number}/reactions`,
          { content: c.args.emoji },
        );
        if (shouldReturnStructuredOutput(c)) {
          return reaction;
        }
        return `Added ${c.args.emoji} to issue #${number}`;
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("pin", {
    description: "Pin an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const issue = await api<IssueRecord>("PUT", `/api/repos/${owner}/${repo}/issues/${number}/pin`);
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return `Pinned issue #${number}`;
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("lock", {
    description: "Lock an issue",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      reason: z.string().optional().describe("Lock reason (off-topic, too heated, resolved, spam)"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const issue = await api<IssueRecord>("PUT", `/api/repos/${owner}/${repo}/issues/${number}/lock`, {
          ...(c.options.reason && { reason: c.options.reason }),
        });
        if (shouldReturnStructuredOutput(c)) {
          return issue;
        }
        return `Locked issue #${number}`;
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  })
  .command("link", {
    description: "Add a dependency link between issues",
    args: z.object({
      number: z.string().describe("Issue number"),
    }),
    options: z.object({
      blocks: z.string().describe("Issue number that this issue blocks"),
      repo: z.string().optional().describe("Repository (OWNER/REPO)"),
    }),
    async run(c) {
      try {
        const number = parseIssueNumber(c.args.number);
        const blocks = parseIssueNumber(c.options.blocks, "blocking issue number");
        const { owner, repo } = resolveRepoRef(c.options.repo);
        const dependency = await api<IssueRecord>(
          "POST",
          `/api/repos/${owner}/${repo}/issues/${number}/dependencies`,
          { blocks },
        );
        if (shouldReturnStructuredOutput(c)) {
          return dependency;
        }
        return `Linked issue #${number} to issue #${blocks}`;
      } catch (error) {
        handleIssueApiError(error);
      }
    },
  });
