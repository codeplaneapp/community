/**
 * Hook for lazy-loading repository directory tree.
 *
 * Fetches the contents of a directory within a repository at a given ref.
 * Supports the code explorer's on-demand subdirectory expansion pattern.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRepoFetch, toLoadingError } from "./useRepoFetch.js";
import type {
  TreeEntry,
  UseRepoTreeOptions,
  UseRepoTreeReturn,
} from "./repo-tree-types.js";
import type { LoadingError } from "../loading/types.js";

export function useRepoTree(options: UseRepoTreeOptions): UseRepoTreeReturn {
  const { owner, repo, path, ref, enabled = true } = options;
  const { get } = useRepoFetch();

  const [entries, setEntries] = useState<TreeEntry[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LoadingError | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);

  // Build the API path for a given repo sub-path
  const buildApiPath = useCallback(
    (subPath?: string): string => {
      const base = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`;
      const resolvedPath = subPath ?? path;
      const fullPath = resolvedPath ? `${base}/${resolvedPath}` : base;
      if (ref) {
        return `${fullPath}?ref=${encodeURIComponent(ref)}`;
      }
      return fullPath;
    },
    [owner, repo, path, ref],
  );

  // Primary fetch effect: runs when options change or refetch is called
  useEffect(() => {
    if (!enabled) return;
    if (!owner || !repo) return;

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    get<TreeEntry[]>(buildApiPath(), { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          const sorted = sortTreeEntries(data);
          setEntries(sorted);
          setError(null);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(toLoadingError(err));
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
  }, [owner, repo, path, ref, enabled, fetchCounter, buildApiPath, get]);

  const refetch = useCallback(() => {
    setFetchCounter((c) => c + 1);
  }, []);

  /**
   * Fetch a subdirectory on demand.
   * Used by the code explorer when a user expands a directory node.
   * Returns the entries directly for the caller to insert into the tree model.
   * Does NOT update this hook's top-level `entries` state.
   */
  const fetchPath = useCallback(
    async (subPath: string): Promise<TreeEntry[]> => {
      const apiPath = buildApiPath(subPath);
      const data = await get<TreeEntry[]>(apiPath);
      return sortTreeEntries(data);
    },
    [buildApiPath, get],
  );

  return { entries, isLoading, error, refetch, fetchPath };
}

/** Sort tree entries: directories first, then files, alphabetical within each group. */
function sortTreeEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type === "dir" && b.type !== "dir") return -1;
    if (a.type !== "dir" && b.type === "dir") return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
