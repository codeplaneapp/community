import { useQuery } from "./useQuery.js";
import type { RepoIdentifier, WorkflowArtifact, QueryResult } from "./workflow-types.js";
import { MAX_ARTIFACTS } from "./workflow-types.js";

export function useWorkflowRunArtifacts(
  repo: RepoIdentifier,
  runId: number,
  options?: { enabled?: boolean },
): QueryResult<WorkflowArtifact[]> {
  return useQuery<WorkflowArtifact[]>({
    path: `/api/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/artifacts`,
    enabled: options?.enabled ?? true,
    transform: (res: any) => {
      let artifacts = res?.artifacts || [];
      if (artifacts.length > MAX_ARTIFACTS) {
        artifacts = artifacts.slice(-MAX_ARTIFACTS);
      }
      return artifacts;
    },
  });
}
