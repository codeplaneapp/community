import { useQuery } from "./useQuery.js";
import type { RepoIdentifier, WorkflowRunDetailResponse, QueryResult } from "./workflow-types.js";

export function useWorkflowRunDetail(
  repo: RepoIdentifier,
  runId: number,
  options?: { enabled?: boolean },
): QueryResult<WorkflowRunDetailResponse> {
  return useQuery<WorkflowRunDetailResponse>({
    path: `/api/repos/${repo.owner}/${repo.repo}/workflows/runs/${runId}`,
    enabled: options?.enabled ?? true,
    transform: (res: any) => res, // Identity
  });
}
