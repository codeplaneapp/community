/**
 * Hook for fetching repository bookmarks.
 *
 * Used by:
 * - Bookmark tab in the repository overview
 * - Code explorer ref picker (select which bookmark to browse)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useRepoFetch, toLoadingError } from "./useRepoFetch.js";
import type {
  Bookmark,
  UseBookmarksOptions,
  UseBookmarksReturn,
} from "./repo-tree-types.js";
import type { LoadingError } from "../loading/types.js";

/** Wire format for paginated bookmark response. */
interface BookmarksResponse {
  items: Bookmark[];
  next_cursor: string;
}

export function useBookmarks(options: UseBookmarksOptions): UseBookmarksReturn {
  const { owner, repo, enabled = true } = options;
  const { get } = useRepoFetch();

  const [bookmarks, setBookmarks] = useState<Bookmark[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<LoadingError | null>(null);
  const [cursor, setCursor] = useState<string>("");
  const [hasMore, setHasMore] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [fetchCounter, setFetchCounter] = useState(0);
  const isFetchingMoreRef = useRef(false);

  // Build API path with optional cursor
  const buildApiPath = useCallback(
    (pageCursor?: string): string => {
      const base = `/api/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/bookmarks`;
      const params = new URLSearchParams();
      params.set("limit", "100"); // Bookmarks are typically few; fetch generously
      if (pageCursor) params.set("cursor", pageCursor);
      return `${base}?${params.toString()}`;
    },
    [owner, repo],
  );

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;
    if (!owner || !repo) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    setCursor("");

    get<BookmarksResponse>(buildApiPath(), { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setBookmarks(data.items);
          setCursor(data.next_cursor);
          setHasMore(data.next_cursor !== "");
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
  }, [owner, repo, enabled, fetchCounter, buildApiPath, get]);

  // Fetch more (pagination)
  const fetchMore = useCallback(() => {
    if (!hasMore || !cursor || isFetchingMoreRef.current) return;
    isFetchingMoreRef.current = true;

    get<BookmarksResponse>(buildApiPath(cursor))
      .then((data) => {
        setBookmarks((prev) => [...(prev ?? []), ...data.items]);
        setCursor(data.next_cursor);
        setHasMore(data.next_cursor !== "");
      })
      .catch((err) => {
        setError(toLoadingError(err));
      })
      .finally(() => {
        isFetchingMoreRef.current = false;
      });
  }, [hasMore, cursor, buildApiPath, get]);

  const refetch = useCallback(() => {
    setBookmarks(null);
    setFetchCounter((c) => c + 1);
  }, []);

  return { bookmarks, isLoading, error, hasMore, fetchMore, refetch };
}
