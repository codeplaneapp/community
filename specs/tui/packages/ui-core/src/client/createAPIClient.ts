import type { APIClient, APIRequestOptions } from "./types.js";
import { NetworkError } from "../types/errors.js";

export interface CreateAPIClientConfig {
  baseUrl: string;
  token: string;
}

export function createAPIClient(config: CreateAPIClientConfig): APIClient {
  return {
    baseUrl: config.baseUrl,
    async request(path: string, options?: APIRequestOptions): Promise<Response> {
      const url = `${config.baseUrl}${path}`;
      const headers: Record<string, string> = {
        "Authorization": `token ${config.token}`,
        ...options?.headers,
      };

      if (options?.body !== undefined) {
        headers["Content-Type"] = "application/json";
      }

      try {
        return await fetch(url, {
          method: options?.method ?? "GET",
          headers,
          body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal: options?.signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          throw err; // Let AbortError propagate — hooks handle it
        }
        throw new NetworkError(
          `Failed to fetch ${options?.method ?? "GET"} ${path}`,
          err,
        );
      }
    },
  };
}