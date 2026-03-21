import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { api } from "../../client.js";
import { loadConfig } from "../../config.js";
import type { RepoContext } from "../types.js";

const issueSchema = Type.Object({
  title: Type.String({
    description: "Short Codeplane issue title.",
  }),
  summary: Type.String({
    description: "What happened and why it is a Codeplane issue.",
  }),
  expected_behavior: Type.Optional(
    Type.String({
      description: "What the user expected Codeplane to do.",
    }),
  ),
  actual_behavior: Type.Optional(
    Type.String({
      description: "What Codeplane actually did.",
    }),
  ),
  repro_steps: Type.Optional(
    Type.String({
      description: "Brief reproduction steps or context.",
    }),
  ),
  workaround: Type.Optional(
    Type.String({
      description: "Any workaround that was found, if one exists.",
    }),
  ),
  why_this_is_still_a_problem: Type.Optional(
    Type.String({
      description: "Why this is still worth fixing even with a workaround.",
    }),
  ),
  repo: Type.Optional(
    Type.String({
      description: "Optional OWNER/REPO override for the issue destination.",
    }),
  ),
});

type IssueToolParams = {
  title: string;
  summary: string;
  expected_behavior?: string;
  actual_behavior?: string;
  repro_steps?: string;
  workaround?: string;
  why_this_is_still_a_problem?: string;
  repo?: string;
};

export interface IssueContextRef {
  current: RepoContext;
}

export function resolveIssueTargetRepo(explicitRepo?: string): string {
  if (explicitRepo?.trim()) {
    return explicitRepo.trim();
  }

  const config = loadConfig();
  if (config.agent_issue_repo?.trim()) {
    return config.agent_issue_repo.trim();
  }

  throw new Error(
    "No Codeplane issue destination is configured. Set CODEPLANE_AGENT_ISSUE_REPO or add agent_issue_repo to your Codeplane config.",
  );
}

export function buildIssueBody(
  params: IssueToolParams,
  repoContext: RepoContext,
): string {
  const lines = [
    "## Summary",
    params.summary.trim(),
    "",
    "## Startup Context",
    `- cwd: ${repoContext.cwd}`,
    `- repo root: ${repoContext.repoRoot ?? "(not detected)"}`,
    `- detected Codeplane repo: ${repoContext.repoSlug ?? "(not detected)"}`,
    `- auth: ${repoContext.auth.loggedIn ? `logged in to ${repoContext.auth.host}` : `not logged in to ${repoContext.auth.host}`}`,
  ];

  if (repoContext.backend?.backend) {
    lines.push(`- backend: ${String(repoContext.backend.backend)}`);
  }
  if (repoContext.remoteRepo.checked) {
    lines.push(
      `- Codeplane repo availability: ${repoContext.remoteRepo.available ? "available" : "unavailable"}${repoContext.remoteRepo.status ? ` (${repoContext.remoteRepo.status})` : ""}`,
    );
  }

  if (params.expected_behavior?.trim()) {
    lines.push("", "## Expected Behavior", params.expected_behavior.trim());
  }
  if (params.actual_behavior?.trim()) {
    lines.push("", "## Actual Behavior", params.actual_behavior.trim());
  }
  if (params.repro_steps?.trim()) {
    lines.push("", "## Repro Steps", params.repro_steps.trim());
  }
  if (params.workaround?.trim()) {
    lines.push("", "## Workaround", params.workaround.trim());
  }
  if (params.why_this_is_still_a_problem?.trim()) {
    lines.push(
      "",
      "## Why This Is Still A Product/UX Issue",
      params.why_this_is_still_a_problem.trim(),
    );
  }

  if (repoContext.jjStatus.output) {
    lines.push("", "## `jj status`", "```text", repoContext.jjStatus.output, "```");
  }
  if (repoContext.jjRemotes.output) {
    lines.push(
      "",
      "## `jj git remote list`",
      "```text",
      repoContext.jjRemotes.output,
      "```",
    );
  }

  return `${lines.join("\n").trim()}\n`;
}

export function createCodeplaneIssueTool(
  contextRef: IssueContextRef,
): ToolDefinition<typeof issueSchema> {
  return {
    name: "codeplane_issue_create",
    label: "codeplane_issue_create",
    description:
      "Create a Codeplane product or UX issue in the configured Codeplane issue tracker.",
    promptSnippet:
      "codeplane_issue_create(title, summary, expected_behavior?, actual_behavior?, repro_steps?, workaround?, why_this_is_still_a_problem?, repo?) files a real Codeplane issue.",
    promptGuidelines: [
      "Use codeplane_issue_create when you identify a genuine Codeplane bug, missing capability, or rough UX, even if a workaround exists.",
      "Keep issue titles specific and include the concrete Codeplane pain point.",
    ],
    parameters: issueSchema,
    async execute(_toolCallId, params) {
      const repo = resolveIssueTargetRepo(params.repo);
      const parts = repo.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        throw new Error(`Invalid Codeplane issue destination: ${repo}`);
      }

      const body = buildIssueBody(params, contextRef.current);
      const created = await api(
        "POST",
        `/api/repos/${parts[0]}/${parts[1]}/issues`,
        {
          title: params.title.trim(),
          body,
        },
      );

      return {
        content: [
          {
            type: "text",
            text: `Created Codeplane issue in ${repo}: ${JSON.stringify(created)}`,
          },
        ],
        details: created,
      };
    },
  };
}
