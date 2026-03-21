import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { collectRepoContext } from "../repo-context.js";
import type { RepoContext } from "../types.js";

const contextSchema = Type.Object({
  refresh: Type.Optional(
    Type.Boolean({
      description: "Refresh repo/auth state before returning it.",
    }),
  ),
});

export interface RepoContextRef {
  current: RepoContext;
}

export function createJjhubContextTool(
  contextRef: RepoContextRef,
  options: {
    repoOverride?: string;
    backendContext: () => Record<string, unknown>;
  },
): ToolDefinition<typeof contextSchema> {
  return {
    name: "jjhub_repo_context",
    label: "jjhub_repo_context",
    description:
      "Return the current local JJ/JJHub repo context, and optionally refresh it if state may have changed.",
    promptSnippet:
      "jjhub_repo_context(refresh?) returns the current repo root, detected JJHub repo, jj status, remotes, auth state, and backend details.",
    promptGuidelines: [
      "Use jjhub_repo_context(refresh=true) if local repo state or auth may have changed during the session.",
    ],
    parameters: contextSchema,
    async execute(_toolCallId, params) {
      if (params.refresh) {
        contextRef.current = await collectRepoContext({
          cwd: contextRef.current.cwd,
          repoOverride: options.repoOverride,
        });
        contextRef.current.backend = options.backendContext();
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(contextRef.current, null, 2),
          },
        ],
        details: contextRef.current,
      };
    },
  };
}
