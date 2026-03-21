import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { DocsIndex } from "../docs-index.js";
import { searchDocsIndex } from "../docs-index.js";
import type { DocsCorpusStatus } from "../types.js";

const docsSearchSchema = Type.Object({
  query: Type.String({
    description: "JJHub docs search query.",
  }),
  max_results: Type.Optional(
    Type.Number({
      description: "Maximum number of excerpts to return (default: 4).",
    }),
  ),
});

export function createJjhubDocsTool(
  docsIndex: DocsIndex | null,
  docsStatus: DocsCorpusStatus,
): ToolDefinition<typeof docsSearchSchema> {
  return {
    name: "jjhub_docs_search",
    label: "jjhub_docs_search",
    description:
      "Search the locally cached JJHub docs corpus and return focused excerpts instead of guessing.",
    promptSnippet:
      "jjhub_docs_search(query, max_results?) searches JJHub docs and returns the most relevant excerpts.",
    promptGuidelines: [
      "Prefer jjhub_docs_search before giving JJHub-specific advice.",
      "Quote or summarize only the returned excerpts, not the whole JJHub corpus.",
    ],
    parameters: docsSearchSchema,
    async execute(_toolCallId, params) {
      if (!docsIndex) {
        return {
          content: [
            {
              type: "text",
              text:
                docsStatus.warning ??
                "JJHub docs are currently unavailable, so docs-backed answers are degraded.",
            },
          ],
          details: { status: docsStatus },
        };
      }

      const maxResults =
        typeof params.max_results === "number" && params.max_results > 0
          ? Math.min(Math.floor(params.max_results), 8)
          : 4;
      const hits = searchDocsIndex(docsIndex, params.query, maxResults);

      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No JJHub docs sections matched "${params.query}".`,
            },
          ],
          details: { status: docsStatus, hits: [] },
        };
      }

      const excerpt = hits
        .map(
          (hit, index) =>
            `[${index + 1}] ${hit.title} (lines ${hit.lineStart}-${hit.lineEnd})\n${hit.snippet}`,
        )
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text:
              docsStatus.status === "stale"
                ? `${excerpt}\n\n[Using cached JJHub docs: ${docsStatus.warning ?? "refresh failed"}]`
                : excerpt,
          },
        ],
        details: {
          status: docsStatus,
          hits,
        },
      };
    },
  };
}
