/**
 * Hook for fetching file content at a specific jj change.
 *
 * Used by the code explorer file preview and README renderer.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRepoFetch, toLoadingError } from "./useRepoFetch.js";
import type {
  UseFileContentOptions,
  UseFileContentReturn,
} from "./repo-tree-types.js";
import type { LoadingError } from "../loading/types.js";

/** Matches the SDK FileContent type from packages/sdk/src/services/repohost.ts */
interface FileContentResponse {
  path: string;
  content: string;
}

export function useFileContent(options: UseFileContentOptions): UseFileContentReturn {
  const { owner, repo, changeId, filePath, enabled = true } = options;
  const { get } = useRepoFetch();

  const [content, setContent] = useState<string | null>(null);
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LoadingError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (!owner || !repo || !changeId || !filePath) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    // Uses the jj-native file endpoint, not the git-based contents endpoint.
    // The filePath is passed as-is after the change ID — the API route uses
    // a wildcard catch-all and decodeURIComponent on the server side.
    const apiPath = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/file/${encodeURIComponent(changeId)}/${filePath}`;

    get<FileContentResponse>(apiPath, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setContent(data.content);
          setResolvedPath(data.path);
          setError(null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(toLoadingError(err));
          setContent(null);
          setResolvedPath(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [owner, repo, changeId, filePath, enabled, fetchCounter, get]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  return {
    content,
    filePath: resolvedPath,
    isLoading,
    error,
    refetch,
  };
}
