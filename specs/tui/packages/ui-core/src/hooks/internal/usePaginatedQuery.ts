import { useState, useEffect, useRef, useCallback } from "react";
import type { APIClient } from "../../client/types.js";
import { parseResponseError, NetworkError } from "../../types/errors.js";
import type { HookError } from "../../types/errors.js";

export interface PaginatedQueryConfig<T> {
  client: APIClient;
  path: string;
  cacheKey: string;
  perPage: number;
  enabled: boolean;
  maxItems: number;
  autoPaginate: boolean;
  parseResponse: (data: unknown, headers: Headers) => {
    items: T[];
    totalCount: number | null;
  };
}

export interface PaginatedQueryResult<T> {
  items: T[];
  totalCount: number;
  isLoading: boolean;
  error: HookError | null;
  hasMore: boolean;
  fetchMore: () => void;
  refetch: () => void;
}

export function usePaginatedQuery<T>(
  config: PaginatedQueryConfig<T>
): PaginatedQueryResult<T> {
  const {
    client,
    path,
    cacheKey,
    perPage,
    enabled,
    maxItems,
    autoPaginate,
    parseResponse,
  } = config;

  const [items, setItems] = useState<T[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<HookError | null>(null);
  
  const pageRef = useRef<number>(1);
  const lastPageItemCountRef = useRef<number>(0);
  const isMounted = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [refetchCounter, setRefetchCounter] = useState(0);

  // Using lastCacheKey to distinguish between param changes (hard reset) and refetches (soft reset)
  const lastCacheKey = useRef<string>(cacheKey);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchPage = useCallback(async (pageToFetch: number, isRefetch: boolean, currentItems: T[]) => {
    if (!isMounted.current) return;
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const separator = path.includes('?') ? '&' : '?';
      const urlPath = `${path}${separator}page=${pageToFetch}&per_page=${perPage}`;
      const response = await client.request(urlPath, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        const parsedError = await parseResponseError(response);
        if (isMounted.current) {
          setError(parsedError);
          setIsLoading(false);
        }
        return;
      }

      const body = await response.json();
      const parsed = parseResponse(body, response.headers);

      if (isMounted.current) {
        const newItems = parsed.items;
        lastPageItemCountRef.current = newItems.length;

        let combinedItems: T[];
        if (pageToFetch === 1) {
          combinedItems = newItems;
        } else {
          combinedItems = [...currentItems, ...newItems];
        }

        if (combinedItems.length > maxItems) {
          combinedItems = combinedItems.slice(combinedItems.length - maxItems);
        }

        setItems(combinedItems);
        if (parsed.totalCount !== null) {
          setTotalCount(parsed.totalCount);
        }
        setError(null);
        pageRef.current = pageToFetch;

        let hasMoreLocal = false;
        if (parsed.totalCount !== null) {
          hasMoreLocal = combinedItems.length < parsed.totalCount;
        } else {
          hasMoreLocal = newItems.length === perPage;
        }

        if (autoPaginate && hasMoreLocal) {
          // Continue fetching
          fetchPage(pageToFetch + 1, false, combinedItems);
        } else {
          setIsLoading(false);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return;
      }
      if (isMounted.current) {
        setError(err instanceof NetworkError ? err : new NetworkError("Fetch failed", err));
        setIsLoading(false);
      }
    }
  }, [client, path, perPage, maxItems, autoPaginate, parseResponse]);

  useEffect(() => {
    if (!isMounted.current) return;

    if (cacheKey !== lastCacheKey.current) {
      // Hard reset
      lastCacheKey.current = cacheKey;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setItems([]);
      setTotalCount(0);
      setError(null);
      lastPageItemCountRef.current = 0;
      pageRef.current = 1;
      if (enabled) {
        setIsLoading(true);
        fetchPage(1, false, []);
      } else {
        setIsLoading(false);
      }
      return;
    }

    if (!enabled) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setItems([]);
      setTotalCount(0);
      setError(null);
      lastPageItemCountRef.current = 0;
      pageRef.current = 1;
      setIsLoading(false);
      return;
    }

    // enabled is true, and it might be initial load or refetch
    // If it's refetch (refetchCounter changed), we keep items but fetch page 1
    if (refetchCounter > 0) {
      fetchPage(1, true, items);
    } else {
      // Initial load
      fetchPage(1, false, []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled, refetchCounter]);

  const hasMore = config.parseResponse([], new Headers()).totalCount !== null
    ? items.length < totalCount
    : lastPageItemCountRef.current === perPage;

  const fetchMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    fetchPage(pageRef.current + 1, false, items);
  }, [hasMore, isLoading, items, fetchPage]);

  const refetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setError(null);
    pageRef.current = 1;
    setRefetchCounter(c => c + 1);
  }, []);

  return {
    items,
    totalCount,
    isLoading,
    error,
    hasMore,
    fetchMore,
    refetch,
  };
}