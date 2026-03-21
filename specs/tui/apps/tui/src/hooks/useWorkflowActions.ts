import { useMutation } from "@codeplane/ui-core/src/hooks/internal/useMutation.js";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError } from "@codeplane/ui-core/src/types/errors.js";
import type { RepoIdentifier, MutationResult, HookError, WorkflowRunResult } from "./workflow-types.js";

// Cancel Run
export function useWorkflowRunCancel(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (runId: number) => (() => void) | void;
    onSuccess?: (runId: number) => void;
    onError?: (error: HookError, runId: number) => void;
  },
): MutationResult<number, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<number, void>({
    mutationFn: async (runId, signal) => {
      const response = await client.request(
        `/api/repos/${repo.owner}/${repo.repo}/workflows/runs/${runId}/cancel`,
        { method: "POST", signal }
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
    onOptimistic: (runId) => {
      if (callbacks?.onOptimistic) {
        // useMutation currently doesn't persist return values from onOptimistic
        // To correctly handle rollback in ui-core's mutation, we either modify the core or store the rollback.
        // We will store the rollback in a weakmap or closure but since we don't have an error hook that triggers it automatically
        // inside ui-core if it fails, we need to handle the rollback locally in onError.
        const rollback = callbacks.onOptimistic(runId);
        if (typeof rollback === "function") {
          (useWorkflowRunCancel as any)[`rollback_${runId}`] = rollback;
        }
      }
    },
    onSuccess: (result, runId) => {
      delete (useWorkflowRunCancel as any)[`rollback_${runId}`];
      callbacks?.onSuccess?.(runId);
    },
    onError: (err, runId) => {
      const rollback = (useWorkflowRunCancel as any)[`rollback_${runId}`];
      if (typeof rollback === "function") {
        rollback();
      }
      delete (useWorkflowRunCancel as any)[`rollback_${runId}`];
      callbacks?.onError?.(err, runId);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

// Rerun Run
export function useWorkflowRunRerun(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (runId: number) => (() => void) | void;
    onSuccess?: (result: WorkflowRunResult, runId: number) => void;
    onError?: (error: HookError, runId: number) => void;
  },
): MutationResult<number, WorkflowRunResult> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<number, WorkflowRunResult>({
    mutationFn: async (runId, signal) => {
      const response = await client.request(
        `/api/repos/${repo.owner}/${repo.repo}/workflows/runs/${runId}/rerun`,
        { method: "POST", signal }
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
      return response.json();
    },
    onOptimistic: (runId) => {
      if (callbacks?.onOptimistic) {
        const rollback = callbacks.onOptimistic(runId);
        if (typeof rollback === "function") {
          (useWorkflowRunRerun as any)[`rollback_${runId}`] = rollback;
        }
      }
    },
    onSuccess: (result, runId) => {
      delete (useWorkflowRunRerun as any)[`rollback_${runId}`];
      callbacks?.onSuccess?.(result, runId);
    },
    onError: (err, runId) => {
      const rollback = (useWorkflowRunRerun as any)[`rollback_${runId}`];
      if (typeof rollback === "function") {
        rollback();
      }
      delete (useWorkflowRunRerun as any)[`rollback_${runId}`];
      callbacks?.onError?.(err, runId);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

// Resume Run
export function useWorkflowRunResume(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (runId: number) => (() => void) | void;
    onSuccess?: (runId: number) => void;
    onError?: (error: HookError, runId: number) => void;
  },
): MutationResult<number, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<number, void>({
    mutationFn: async (runId, signal) => {
      const response = await client.request(
        `/api/repos/${repo.owner}/${repo.repo}/workflows/runs/${runId}/resume`,
        { method: "POST", signal }
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
    onOptimistic: (runId) => {
      if (callbacks?.onOptimistic) {
        const rollback = callbacks.onOptimistic(runId);
        if (typeof rollback === "function") {
          (useWorkflowRunResume as any)[`rollback_${runId}`] = rollback;
        }
      }
    },
    onSuccess: (result, runId) => {
      delete (useWorkflowRunResume as any)[`rollback_${runId}`];
      callbacks?.onSuccess?.(runId);
    },
    onError: (err, runId) => {
      const rollback = (useWorkflowRunResume as any)[`rollback_${runId}`];
      if (typeof rollback === "function") {
        rollback();
      }
      delete (useWorkflowRunResume as any)[`rollback_${runId}`];
      callbacks?.onError?.(err, runId);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

// Delete Artifact
export function useDeleteWorkflowArtifact(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (args: { runId: number; name: string }) => (() => void) | void;
    onSuccess?: (args: { runId: number; name: string }) => void;
    onError?: (error: HookError, args: { runId: number; name: string }) => void;
  },
): MutationResult<{ runId: number; name: string }, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<{ runId: number; name: string }, void>({
    mutationFn: async (args, signal) => {
      const response = await client.request(
        `/api/repos/${repo.owner}/${repo.repo}/actions/runs/${args.runId}/artifacts/${encodeURIComponent(args.name)}`,
        { method: "DELETE", signal }
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
    onOptimistic: (args) => {
      if (callbacks?.onOptimistic) {
        const rollback = callbacks.onOptimistic(args);
        if (typeof rollback === "function") {
          const key = `${args.runId}_${args.name}`;
          (useDeleteWorkflowArtifact as any)[`rollback_${key}`] = rollback;
        }
      }
    },
    onSuccess: (result, args) => {
      const key = `${args.runId}_${args.name}`;
      delete (useDeleteWorkflowArtifact as any)[`rollback_${key}`];
      callbacks?.onSuccess?.(args);
    },
    onError: (err, args) => {
      const key = `${args.runId}_${args.name}`;
      const rollback = (useDeleteWorkflowArtifact as any)[`rollback_${key}`];
      if (typeof rollback === "function") {
        rollback();
      }
      delete (useDeleteWorkflowArtifact as any)[`rollback_${key}`];
      callbacks?.onError?.(err, args);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}

// Delete Cache
export function useDeleteWorkflowCache(
  repo: RepoIdentifier,
  callbacks?: {
    onOptimistic?: (cacheId: number) => (() => void) | void;
    onSuccess?: (cacheId: number) => void;
    onError?: (error: HookError, cacheId: number) => void;
  },
): MutationResult<number, void> {
  const client = useAPIClient();

  const { mutate, isLoading, error, reset } = useMutation<number, void>({
    mutationFn: async (cacheId, signal) => {
      const response = await client.request(
        `/api/repos/${repo.owner}/${repo.repo}/actions/cache`,
        { method: "DELETE", signal }
      );
      if (!response.ok) {
        throw await parseResponseError(response);
      }
    },
    onOptimistic: (cacheId) => {
      if (callbacks?.onOptimistic) {
        const rollback = callbacks.onOptimistic(cacheId);
        if (typeof rollback === "function") {
          (useDeleteWorkflowCache as any)[`rollback_${cacheId}`] = rollback;
        }
      }
    },
    onSuccess: (result, cacheId) => {
      delete (useDeleteWorkflowCache as any)[`rollback_${cacheId}`];
      callbacks?.onSuccess?.(cacheId);
    },
    onError: (err, cacheId) => {
      const rollback = (useDeleteWorkflowCache as any)[`rollback_${cacheId}`];
      if (typeof rollback === "function") {
        rollback();
      }
      delete (useDeleteWorkflowCache as any)[`rollback_${cacheId}`];
      callbacks?.onError?.(err, cacheId);
    },
  });

  return { execute: mutate, loading: isLoading, error, reset };
}
