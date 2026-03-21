import { useState, useEffect, useRef, useCallback } from "react";
import { useAPIClient } from "@codeplane/ui-core/src/client/index.js";
import { parseResponseError, NetworkError } from "@codeplane/ui-core/src/types/errors.js";
import type { QueryResult, HookError } from "./workflow-types.js";

export interface UseQueryOptions<T> {
  path: string;
  params?: Record<string, string>;
  transform?: (response: unknown) => T;
  enabled?: boolean;
}

export function useQuery<T>(options: UseQueryOptions<T>): QueryResult<T> {
  const { path, params, transform, enabled = true } = options;
  const client = useAPIClient();

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<HookError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMounted = useRef<boolean>(true);
  const [refetchCounter, setRefetchCounter] = useState(0);
  
  // To avoid unnecessary re-renders or stale closures
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const buildUrl = useCallback(() => {
    const opts = optionsRef.current;
    if (!opts.params || Object.keys(opts.params).length === 0) {
      return opts.path;
    }
    const searchParams = new URLSearchParams(opts.params);
    const separator = opts.path.includes("?") ? "&" : "?";
    return `${opts.path}${separator}${searchParams.toString()}`;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      if (!isMounted.current) return;
      setLoading(true);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const url = buildUrl();
        const response = await client.request(url, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          const parsedError = await parseResponseError(response);
          if (isMounted.current) {
            setError(parsedError);
            setLoading(false);
          }
          return;
        }

        const body = await response.json();
        const parsedData = optionsRef.current.transform 
          ? optionsRef.current.transform(body) 
          : (body as T);

        if (isMounted.current) {
          setData(parsedData);
          setError(null);
          setLoading(false);
        }
      } catch (err: any) {
        if (err.name === "AbortError") {
          return;
        }
        if (isMounted.current) {
          setError(err instanceof NetworkError ? err : new NetworkError("Fetch failed", err));
          setLoading(false);
        }
      }
    };

    fetchData();
  }, [client, path, enabled, refetchCounter, buildUrl]);

  const refetch = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setError(null);
    setRefetchCounter((c) => c + 1);
  }, []);

  return {
    data,
    loading,
    error,
    refetch,
  };
}
