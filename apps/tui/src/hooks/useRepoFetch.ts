/**
 * Internal helper for authenticated fetch against the Codeplane API.
 * Not exported from hooks/index.ts — only consumed by repo-tree hooks.
 */

import { useCallback } from "react";
import { useAPIClient } from "../providers/APIClientProvider.js";
import type { LoadingError } from "../loading/types.js";

export interface FetchOptions {
  signal?: AbortSignal;
}

export interface RepoFetchContext {
  /**
   * Make an authenticated GET request to the given API path.
   * Returns parsed JSON on success, throws a FetchError on failure.
   */
  get: <T>(path: string, options?: FetchOptions) => Promise<T>;
}

/**
 * Error class that carries HTTP status for LoadingError conversion.
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

/**
 * Convert a FetchError (or generic Error) to a LoadingError.
 *
 * Classification logic mirrors parseToLoadingError in useScreenLoading.ts
 * but is decoupled for use in hooks that manage their own state.
 */
export function toLoadingError(err: unknown): LoadingError {
  if (err instanceof FetchError) {
    if (err.status === 401) {
      return {
        type: "auth_error",
        httpStatus: 401,
        summary: "Session expired. Run `codeplane auth login`",
      };
    }
    if (err.status === 429) {
      return {
        type: "rate_limited",
        httpStatus: 429,
        summary: "Rate limited — try again later",
      };
    }
    if (err.status && err.status >= 400) {
      return {
        type: "http_error",
        httpStatus: err.status,
        summary: truncate(err.message),
      };
    }
  }
  if (err instanceof Error && err.name === "AbortError") {
    return { type: "network", summary: "Request cancelled" };
  }
  const msg = err instanceof Error ? err.message : "Network error";
  return { type: "network", summary: truncate(msg) };
}

function truncate(s: string): string {
  return s.length <= 60 ? s : s.slice(0, 57) + "\u2026";
}

/**
 * Hook that returns an authenticated fetch context bound to the
 * current APIClient's baseUrl and token.
 */
export function useRepoFetch(): RepoFetchContext {
  const client = useAPIClient();

  const get = useCallback(
    async <T>(path: string, options?: FetchOptions): Promise<T> => {
      const url = `${client.baseUrl}${path}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${client.token}`,
          Accept: "application/json",
        },
        signal: options?.signal,
      });

      if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as Record<string, unknown>;
          if (typeof body?.message === "string") message = body.message;
        } catch {
          // body not JSON — use status text
          message = res.statusText || message;
        }
        throw new FetchError(message, res.status);
      }

      return res.json() as Promise<T>;
    },
    [client.baseUrl, client.token],
  );

  return { get };
}
